"""Video job use cases for the API: upload → queue, list, inspect, cancel, delete."""

import uuid
from pathlib import Path, PurePath

import anyio
import structlog
from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.errors import AppError, NotFoundError
from app.ml.video import InvalidVideoError, probe_video
from app.models.user import User
from app.models.video import VideoJob, VideoJobStatus
from app.schemas.video import VideoJobPage, VideoJobRead, VideoTrackRead
from app.services.job_events import JobEvents
from app.services.job_queue import JobQueue
from app.services.storage import FileSigner, Storage

logger = structlog.get_logger(__name__)

_VIDEO_EXTENSIONS = {"mp4", "m4v", "mov", "webm", "mkv", "avi"}


class InvalidVideoUploadError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "invalid_video"


class JobNotActiveError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "job_not_active"


class JobStillActiveError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "job_still_active"


class QueueUnavailableError(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "queue_unavailable"


def _display_filename(filename: str | None) -> str:
    name = PurePath((filename or "").replace("\\", "/")).name.strip()
    return (name or "video")[:255]


def _extension(filename: str) -> str:
    suffix = PurePath(filename).suffix.lower().lstrip(".")
    return suffix if suffix in _VIDEO_EXTENSIONS else "mp4"


class VideoJobService:
    def __init__(
        self,
        db: AsyncSession,
        storage: Storage,
        signer: FileSigner,
        queue: JobQueue,
        events: JobEvents,
        settings: Settings,
        model_name: str,
    ) -> None:
        self._db = db
        self._storage = storage
        self._signer = signer
        self._queue = queue
        self._events = events
        self._settings = settings
        self._model_name = model_name

    async def create(self, user: User, upload_path: Path, filename: str | None) -> VideoJobRead:
        """Validate an uploaded file (already on disk), store it and queue the job."""
        s = self._settings
        try:
            info = await anyio.to_thread.run_sync(probe_video, upload_path)
        except InvalidVideoError as exc:
            raise InvalidVideoUploadError(str(exc)) from exc
        if info.duration_seconds > s.max_video_duration_seconds:
            raise InvalidVideoUploadError(
                f"Video is too long ({info.duration_seconds:.0f} s); "
                f"the maximum is {s.max_video_duration_seconds} s."
            )
        if info.width * info.height > s.max_video_pixels:
            raise InvalidVideoUploadError(
                f"Video resolution {info.width}x{info.height} is too high; the maximum is 4K."
            )

        display_name = _display_filename(filename)
        key = f"videos/{user.id}/{uuid.uuid4().hex}/source.{_extension(display_name)}"
        await self._storage.save_file(key, upload_path)

        job = VideoJob(
            user_id=user.id,
            status=VideoJobStatus.QUEUED,
            original_filename=display_name,
            source_key=key,
            width=info.width,
            height=info.height,
            fps=info.fps,
            duration_seconds=info.duration_seconds,
            model=self._model_name,
            confidence_threshold=s.video_confidence,
            iou_threshold=s.video_iou,
            target_fps=s.video_target_fps,
        )
        self._db.add(job)
        await self._db.commit()

        try:
            await self._queue.enqueue(job.id)
        except Exception as exc:
            logger.exception("video_job_enqueue_failed", job_id=job.id)
            job.status = VideoJobStatus.FAILED
            job.error = "Could not queue the job."
            await self._db.commit()
            raise QueueUnavailableError(
                "The video queue is unavailable. Please try again later."
            ) from exc

        logger.info(
            "video_job_queued", job_id=job.id, user_id=user.id, duration=info.duration_seconds
        )
        return await self.get(user, job.id)

    async def list(self, user: User, *, limit: int, offset: int) -> VideoJobPage:
        total = await self._db.scalar(
            select(func.count()).select_from(VideoJob).where(VideoJob.user_id == user.id)
        )
        rows = await self._db.scalars(
            select(VideoJob)
            .where(VideoJob.user_id == user.id)
            .order_by(VideoJob.created_at.desc(), VideoJob.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return VideoJobPage(
            items=[self._present(job, with_tracks=False) for job in rows],
            total=total or 0,
            limit=limit,
            offset=offset,
        )

    async def get(self, user: User, job_id: int) -> VideoJobRead:
        return self._present(await self.owned(user, job_id, with_tracks=True), with_tracks=True)

    async def owned(self, user: User, job_id: int, *, with_tracks: bool = False) -> VideoJob:
        query = (
            select(VideoJob).where(VideoJob.id == job_id).execution_options(populate_existing=True)
        )
        if with_tracks:
            query = query.options(selectinload(VideoJob.tracks))
        job = await self._db.scalar(query)
        # Someone else's job is reported as missing, not forbidden: don't confirm it exists.
        if job is None or job.user_id != user.id:
            raise NotFoundError("Video job not found.")
        return job

    async def cancel(self, user: User, job_id: int) -> VideoJobRead:
        job = await self.owned(user, job_id)
        if job.status == VideoJobStatus.QUEUED:
            # Not picked up yet: the worker skips jobs that are no longer queued.
            job.status = VideoJobStatus.CANCELLED
            await self._db.commit()
            await self._events.publish(
                job.id, {"type": "cancelled", "status": job.status, "error": None}
            )
        elif job.status == VideoJobStatus.RUNNING:
            # The worker checks this flag between frames and finishes the job as cancelled.
            await self._events.request_cancel(job.id)
        else:
            raise JobNotActiveError(f"The job has already finished ({job.status}).")
        return await self.get(user, job_id)

    async def delete(self, user: User, job_id: int) -> None:
        job = await self.owned(user, job_id, with_tracks=True)
        if job.status.is_active:
            raise JobStillActiveError("Cancel the job before deleting it.")
        keys = [job.source_key, *(t.clip_key for t in job.tracks if t.clip_key)]
        await self._db.delete(job)
        await self._db.commit()
        for key in keys:
            await self._storage.delete(key)

    def _present(self, job: VideoJob, *, with_tracks: bool) -> VideoJobRead:
        tracks = None
        if with_tracks:
            tracks = [
                VideoTrackRead(
                    track_id=t.track_id,
                    class_name=t.class_name,
                    first_seen_seconds=t.first_seen_seconds,
                    last_seen_seconds=t.last_seen_seconds,
                    best_confidence=t.best_confidence,
                    frames=t.frames,
                    clip_url=self._signer.url(t.clip_key) if t.clip_key else None,
                )
                for t in job.tracks
            ]
        return VideoJobRead(
            id=job.id,
            status=job.status,
            error=job.error,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
            original_filename=job.original_filename,
            width=job.width,
            height=job.height,
            fps=job.fps,
            duration_seconds=job.duration_seconds,
            model=job.model,
            confidence_threshold=job.confidence_threshold,
            iou_threshold=job.iou_threshold,
            target_fps=job.target_fps,
            frames_processed=job.frames_processed,
            source_url=self._signer.url(job.source_key),
            tracks=tracks,
        )
