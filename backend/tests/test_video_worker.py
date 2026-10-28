"""`run_video_job`: the job lifecycle the Celery worker (and inline runner) executes."""

import asyncio
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import anyio
import pytest
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import hash_password
from app.ml.detector import ImageBGR, Prediction
from app.models.user import User
from app.models.video import VideoJob, VideoJobStatus
from app.services.job_events import InMemoryJobEvents
from app.services.storage import LocalStorage
from app.workers.video_job import fail_job, run_video_job
from tests.fakes import BlobDetector, make_test_video


@pytest.fixture
async def session_factory(database_url: str) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(database_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def storage(settings: Settings) -> LocalStorage:
    return LocalStorage(settings.storage_dir)


async def _make_job(
    db_factory: async_sessionmaker[AsyncSession],
    storage: LocalStorage,
    video: Path | bytes,
    *,
    email: str = "worker@example.com",
    status: VideoJobStatus = VideoJobStatus.QUEUED,
) -> int:
    async with db_factory() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                name="Worker", email=email, password_hash=hash_password("x"), is_active=True
            )
            db.add(user)
            await db.flush()
        key = f"videos/{user.id}/{len(email)}{id(video)}/source.mp4"
        data = video if isinstance(video, bytes) else await anyio.Path(video).read_bytes()
        await storage.save(key, data)
        job = VideoJob(
            user_id=user.id,
            status=status,
            original_filename="clip.mp4",
            source_key=key,
            width=320,
            height=240,
            fps=30,
            duration_seconds=4,
            model="blob-detector",
            confidence_threshold=0.5,
            iou_threshold=0.6,
            target_fps=10,
        )
        db.add(job)
        await db.commit()
        return job.id


async def _load(db_factory: async_sessionmaker[AsyncSession], job_id: int) -> VideoJob:
    async with db_factory() as db:
        job = await db.scalar(
            select(VideoJob).where(VideoJob.id == job_id).options(selectinload(VideoJob.tracks))
        )
        assert job is not None
        return job


async def test_successful_job_records_tracks_clips_and_events(
    session_factory: async_sessionmaker[AsyncSession],
    storage: LocalStorage,
    settings: Settings,
    tmp_path: Path,
) -> None:
    video = make_test_video(tmp_path / "in.mp4", seconds=4, squares=((1.0, 3.0), (0.5, 2.0)))
    job_id = await _make_job(session_factory, storage, video)
    events = InMemoryJobEvents()

    status = await run_video_job(
        job_id,
        session_factory=session_factory,
        storage=storage,
        detector=BlobDetector(),
        events=events,
        settings=settings,
    )

    assert status is VideoJobStatus.SUCCEEDED
    job = await _load(session_factory, job_id)
    assert job.status is VideoJobStatus.SUCCEEDED
    assert job.frames_processed == 40
    assert job.started_at is not None and job.finished_at is not None
    assert [(t.track_id, t.class_name) for t in job.tracks] == [(1, "Soldier"), (2, "Soldier")]
    assert [t.first_seen_seconds for t in job.tracks] == pytest.approx([0.6, 1.1], abs=0.01)
    for track in job.tracks:
        assert track.clip_key is not None
        assert storage.local_path(track.clip_key).stat().st_size > 0

    types = [event["type"] for _, event in events.published]
    assert types[0] == "status"
    assert types[-1] == "completed"
    assert types.count("progress") == types.count("frame") == 40
    assert all(job == job_id for job, _ in events.published)


async def test_invalid_video_fails_the_job_with_a_reason(
    session_factory: async_sessionmaker[AsyncSession], storage: LocalStorage, settings: Settings
) -> None:
    job_id = await _make_job(session_factory, storage, b"corrupted upload")
    events = InMemoryJobEvents()

    status = await run_video_job(
        job_id,
        session_factory=session_factory,
        storage=storage,
        detector=BlobDetector(),
        events=events,
        settings=settings,
    )

    job = await _load(session_factory, job_id)
    assert status is job.status is VideoJobStatus.FAILED
    assert job.error == "The file is not a valid video."
    assert job.tracks == []
    assert events.published[-1][1] == {
        "type": "failed",
        "status": VideoJobStatus.FAILED,
        "error": "The file is not a valid video.",
    }


async def test_unexpected_errors_fail_the_job_without_leaking_details(
    session_factory: async_sessionmaker[AsyncSession],
    storage: LocalStorage,
    settings: Settings,
    tmp_path: Path,
) -> None:
    class BrokenDetector(BlobDetector):
        def predict(
            self, image: ImageBGR, *, confidence: float, iou: float, agnostic_nms: bool = False
        ) -> Prediction:
            raise RuntimeError("CUDA out of memory at 0xdeadbeef")

    job_id = await _make_job(session_factory, storage, make_test_video(tmp_path / "v.mp4"))

    await run_video_job(
        job_id,
        session_factory=session_factory,
        storage=storage,
        detector=BrokenDetector(),
        events=InMemoryJobEvents(),
        settings=settings,
    )

    job = await _load(session_factory, job_id)
    assert job.status is VideoJobStatus.FAILED
    assert job.error == "Processing failed unexpectedly."


async def test_cancel_request_stops_a_running_job(
    session_factory: async_sessionmaker[AsyncSession],
    storage: LocalStorage,
    settings: Settings,
    tmp_path: Path,
) -> None:
    job_id = await _make_job(session_factory, storage, make_test_video(tmp_path / "v.mp4"))
    events = InMemoryJobEvents()
    await events.request_cancel(job_id)

    status = await run_video_job(
        job_id,
        session_factory=session_factory,
        storage=storage,
        detector=BlobDetector(),
        events=events,
        settings=settings,
    )

    job = await _load(session_factory, job_id)
    assert status is job.status is VideoJobStatus.CANCELLED
    assert job.tracks == []
    assert events.published[-1][1]["type"] == "cancelled"
    assert not list(storage.root.rglob("track_*.mp4"))  # no clips kept from a cancelled run


@pytest.mark.parametrize("status", [VideoJobStatus.CANCELLED, VideoJobStatus.SUCCEEDED])
async def test_jobs_that_are_not_queued_are_skipped(
    session_factory: async_sessionmaker[AsyncSession],
    storage: LocalStorage,
    settings: Settings,
    tmp_path: Path,
    status: VideoJobStatus,
) -> None:
    """Covers cancel-before-start and Celery redelivering a job that already ran."""
    job_id = await _make_job(
        session_factory, storage, make_test_video(tmp_path / "v.mp4"), status=status
    )
    detector = BlobDetector()

    result = await run_video_job(
        job_id,
        session_factory=session_factory,
        storage=storage,
        detector=detector,
        events=InMemoryJobEvents(),
        settings=settings,
    )

    assert result is None
    assert detector.calls == 0
    assert (await _load(session_factory, job_id)).status is status


async def test_missing_job_is_skipped(
    session_factory: async_sessionmaker[AsyncSession], storage: LocalStorage, settings: Settings
) -> None:
    result = await run_video_job(
        999_999,
        session_factory=session_factory,
        storage=storage,
        detector=BlobDetector(),
        events=InMemoryJobEvents(),
        settings=settings,
    )

    assert result is None


async def test_concurrent_jobs_do_not_interfere(
    session_factory: async_sessionmaker[AsyncSession],
    storage: LocalStorage,
    settings: Settings,
    tmp_path: Path,
) -> None:
    """The original app's single global processor mixed concurrent uploads together."""
    one = make_test_video(tmp_path / "one.mp4", seconds=3, squares=((0.5, 2.5),))
    two = make_test_video(tmp_path / "two.mp4", seconds=3, squares=((0.2, 1.0), (1.5, 2.8)))
    job_one = await _make_job(session_factory, storage, one, email="a@example.com")
    job_two = await _make_job(session_factory, storage, two, email="b@example.com")
    events = InMemoryJobEvents()
    detector = BlobDetector()  # shared, like the worker's single model

    await asyncio.gather(
        *(
            run_video_job(
                job_id,
                session_factory=session_factory,
                storage=storage,
                detector=detector,
                events=events,
                settings=settings,
            )
            for job_id in (job_one, job_two)
        )
    )

    first, second = await _load(session_factory, job_one), await _load(session_factory, job_two)
    assert [t.track_id for t in first.tracks] == [1]
    assert [t.track_id for t in second.tracks] == [1, 2]
    assert first.tracks[0].first_seen_seconds == pytest.approx(0.6, abs=0.01)
    assert [t.first_seen_seconds for t in second.tracks] == pytest.approx([0.3, 1.6], abs=0.01)


def test_worker_process_registers_every_table() -> None:
    """Regression: the worker never imported `User`, so saving a job failed with
    NoReferencedTableError (video_jobs.user_id -> users). Must run in a fresh interpreter:
    inside the test session every model is already imported."""
    code = (
        "import app.workers.celery_app\n"
        "from app.db.base import Base\n"
        "print(','.join(sorted(Base.metadata.tables)))"
    )
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", code], capture_output=True, text=True, check=True, timeout=120
    )

    assert result.stdout.strip().splitlines()[-1] == (
        "cameras,image_detections,live_events,live_sessions,refresh_tokens,users,video_jobs,video_tracks"
    )


async def test_fail_job_ends_an_unfinished_job(
    session_factory: async_sessionmaker[AsyncSession], storage: LocalStorage, tmp_path: Path
) -> None:
    job_id = await _make_job(session_factory, storage, make_test_video(tmp_path / "v.mp4"))
    events = InMemoryJobEvents()

    await fail_job(job_id, session_factory=session_factory, events=events)
    await fail_job(job_id, session_factory=session_factory, events=events)  # no-op once finished

    job = await _load(session_factory, job_id)
    assert job.status is VideoJobStatus.FAILED
    assert job.error == "Processing failed unexpectedly."
    assert [e["type"] for _, e in events.published] == ["failed"]


def test_task_logs_carry_the_upload_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.workers import celery_app as worker

    seen: dict[str, object] = {}

    async def fake_run(job_id: int) -> VideoJobStatus:
        seen.update(structlog.contextvars.get_contextvars())
        return VideoJobStatus.SUCCEEDED

    monkeypatch.setattr(worker, "_run", fake_run)

    assert worker.process_video_task.run(7, request_id="req-0123456789") == "succeeded"
    assert seen == {"request_id": "req-0123456789", "job_id": 7}
    assert structlog.contextvars.get_contextvars() == {}  # unbound afterwards
