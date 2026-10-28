"""Runs one video job end to end. Used by the Celery task and by the inline runner."""

import base64
import tempfile
from datetime import UTC, datetime
from functools import partial
from pathlib import Path, PurePosixPath

import anyio
import anyio.from_thread
import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.ml.detector import Detector
from app.ml.video import (
    FrameUpdate,
    InvalidVideoError,
    ProcessingOptions,
    VideoCancelledError,
    VideoSummary,
    process_video,
)
from app.models.video import VideoJob, VideoJobStatus, VideoTrack
from app.services.job_events import JobEvents
from app.services.storage import Storage

logger = structlog.get_logger(__name__)


async def run_video_job(
    job_id: int,
    *,
    session_factory: async_sessionmaker[AsyncSession],
    storage: Storage,
    detector: Detector,
    events: JobEvents,
    settings: Settings,
) -> VideoJobStatus | None:
    """Process a queued job. Returns its final status, or None if there was nothing to do."""
    log = logger.bind(job_id=job_id)

    async with session_factory() as db:
        job = await db.get(VideoJob, job_id)
        if job is None or job.status != VideoJobStatus.QUEUED:
            # Deleted, cancelled before it started, or already handled (duplicate delivery).
            log.info("video_job_skipped", status=job.status if job else None)
            return None
        job.status = VideoJobStatus.RUNNING
        job.started_at = datetime.now(UTC)
        source = storage.local_path(job.source_key)
        clips_prefix = str(PurePosixPath(job.source_key).parent / "tracks")
        options = ProcessingOptions(
            confidence=job.confidence_threshold,
            iou=job.iou_threshold,
            agnostic_nms=settings.video_agnostic_nms,
            target_fps=job.target_fps,
            preview_max_width=settings.video_preview_max_width,
            preview_jpeg_quality=settings.video_preview_jpeg_quality,
        )
        await db.commit()
    await events.publish(job_id, {"type": "status", "status": VideoJobStatus.RUNNING})
    log.info("video_job_started")

    # Called from the processing thread: hop back onto the event loop to talk to Redis.
    def on_frame(update: FrameUpdate) -> None:
        anyio.from_thread.run(
            events.publish,
            job_id,
            {
                "type": "progress",
                "progress": round(update.progress, 4),
                "time_seconds": update.time_seconds,
                "tracks_found": update.tracks_found,
            },
        )
        anyio.from_thread.run(
            events.publish,
            job_id,
            {
                "type": "frame",
                "time_seconds": update.time_seconds,
                "image": base64.b64encode(update.preview_jpeg).decode(),
            },
        )

    def is_cancelled() -> bool:
        return anyio.from_thread.run(events.is_cancel_requested, job_id)

    status: VideoJobStatus
    error: str | None = None
    summary: VideoSummary | None = None
    clip_keys: dict[int, str] = {}
    with tempfile.TemporaryDirectory(prefix=f"secureye-job-{job_id}-") as tmp:
        clips_dir = Path(tmp)
        try:
            summary = await anyio.to_thread.run_sync(
                partial(
                    process_video,
                    source,
                    detector,
                    options=options,
                    clips_dir=clips_dir,
                    on_frame=on_frame,
                    is_cancelled=is_cancelled,
                )
            )
            for track in summary.tracks:
                if track.clip_filename:
                    key = f"{clips_prefix}/{track.clip_filename}"
                    data = await anyio.Path(clips_dir / track.clip_filename).read_bytes()
                    await storage.save(key, data)
                    clip_keys[track.track_id] = key
            status = VideoJobStatus.SUCCEEDED
        except VideoCancelledError:
            status = VideoJobStatus.CANCELLED
        except InvalidVideoError as exc:
            status, error = VideoJobStatus.FAILED, str(exc)
        except Exception:
            log.exception("video_job_crashed")
            status, error = VideoJobStatus.FAILED, "Processing failed unexpectedly."

        if status is not VideoJobStatus.SUCCEEDED:
            for key in clip_keys.values():  # don't keep clips of a failed/cancelled run
                await storage.delete(key)
            clip_keys.clear()

    async with session_factory() as db:
        job = await db.get(VideoJob, job_id)
        if job is None:  # deleted while running
            return None
        job.status = status
        job.error = error
        job.finished_at = datetime.now(UTC)
        if summary is not None and status is VideoJobStatus.SUCCEEDED:
            job.frames_processed = summary.frames_processed
            db.add_all(
                VideoTrack(
                    job_id=job_id,
                    track_id=t.track_id,
                    class_name=t.class_name,
                    first_seen_seconds=t.first_seen_seconds,
                    last_seen_seconds=t.last_seen_seconds,
                    best_confidence=t.best_confidence,
                    frames=t.frames,
                    clip_key=clip_keys.get(t.track_id),
                )
                for t in summary.tracks
            )
        await db.commit()

    terminal = {
        VideoJobStatus.SUCCEEDED: "completed",
        VideoJobStatus.FAILED: "failed",
        VideoJobStatus.CANCELLED: "cancelled",
    }[status]
    await events.publish(job_id, {"type": terminal, "status": status, "error": error})
    log.info(
        "video_job_finished",
        status=status,
        tracks=len(summary.tracks) if summary else 0,
        frames=summary.frames_processed if summary else 0,
    )
    return status


async def fail_job(
    job_id: int,
    *,
    session_factory: async_sessionmaker[AsyncSession],
    events: JobEvents,
    error: str = "Processing failed unexpectedly.",
) -> None:
    """Best-effort: mark an unfinished job failed and tell listeners."""
    try:
        async with session_factory() as db:
            job = await db.get(VideoJob, job_id)
            if job is None or not job.status.is_active:
                return
            job.status = VideoJobStatus.FAILED
            job.error = error
            job.finished_at = datetime.now(UTC)
            await db.commit()
        await events.publish(
            job_id, {"type": "failed", "status": VideoJobStatus.FAILED, "error": error}
        )
    except Exception:
        logger.exception("video_job_fail_marking_failed", job_id=job_id)
