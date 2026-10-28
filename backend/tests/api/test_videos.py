import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
import structlog
from fastapi import FastAPI
from httpx import AsyncClient

from app.core.config import Settings
from app.main import create_app
from app.ml.registry import ModelRegistry
from app.models.video import VideoJob, VideoJobStatus
from app.services.email import EmailMessage
from app.services.job_events import InMemoryJobEvents
from app.services.job_queue import CeleryJobQueue, InlineJobQueue
from app.workers.video_job import run_video_job
from tests.api.helpers import bearer, login, signup_and_activate
from tests.conftest import ClientFactory
from tests.fakes import BlobDetector, FakeDetector, jpeg_bytes, make_test_video

VIDEOS = "/api/v1/videos"


class ManualQueue:
    """Records jobs without running them, so tests control when processing happens."""

    def __init__(self, fail: bool = False) -> None:
        self.enqueued: list[int] = []
        self.fail = fail

    async def enqueue(self, job_id: int) -> None:
        if self.fail:
            raise ConnectionError("redis down")
        self.enqueued.append(job_id)

    async def close(self) -> None:
        return None


def _video_app(settings: Settings, queue: object | None = None) -> FastAPI:
    app = create_app(settings)
    app.state.models = ModelRegistry(image=BlobDetector(), live=FakeDetector())
    if queue is not None:
        app.state.job_queue = queue
    return app


@pytest.fixture
def app(settings: Settings) -> FastAPI:  # overrides the shared fixture: video-capable detector
    return _video_app(settings)


@pytest.fixture
async def token(client: AsyncClient, outbox: list[EmailMessage]) -> str:
    await signup_and_activate(client, outbox)
    return await login(client)


@pytest.fixture
def video(tmp_path: Path) -> bytes:
    return make_test_video(
        tmp_path / "in.mp4", seconds=3, squares=((1.0, 2.5), (0.5, 2.0))
    ).read_bytes()


async def _upload(
    client: AsyncClient, token: str, data: bytes, filename: str = "patrol.mp4"
) -> dict[str, Any]:
    response = await client.post(
        VIDEOS, headers=bearer(token), files={"video": (filename, data, "video/mp4")}
    )
    assert response.status_code == 202, response.text
    body: dict[str, Any] = response.json()
    return body


def _parse_sse(text: str) -> list[tuple[str, dict[str, Any]]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "data" in lines:
            events.append((lines.get("event", "message"), json.loads(lines["data"])))
    return events


async def _signed_in(client: AsyncClient, app: FastAPI) -> str:
    await signup_and_activate(client, app.state.email_sender.outbox)
    return await login(client)


# ------------------------------------------------------------------ happy path


async def test_upload_is_processed_in_the_background(
    client: AsyncClient, token: str, app: FastAPI, video: bytes
) -> None:
    queued = await _upload(client, token, video, filename="C:\\clips\\patrol.mp4")

    assert queued["status"] == "queued"
    assert queued["original_filename"] == "patrol.mp4"
    assert (queued["width"], queued["height"], queued["fps"]) == (320, 240, 30.0)
    assert queued["duration_seconds"] == pytest.approx(3.0, abs=0.05)
    assert (queued["confidence_threshold"], queued["iou_threshold"], queued["target_fps"]) == (
        0.5,
        0.6,
        10.0,
    )

    queue = app.state.job_queue
    assert isinstance(queue, InlineJobQueue)
    await queue.wait_idle()
    job = (await client.get(f"{VIDEOS}/{queued['id']}", headers=bearer(token))).json()

    assert job["status"] == "succeeded"
    assert job["frames_processed"] == 30
    # the report table: ordered by track id, with first-seen timestamps
    assert [(t["track_id"], t["class_name"]) for t in job["tracks"]] == [
        (1, "Soldier"),
        (2, "Soldier"),
    ]
    assert [t["first_seen_seconds"] for t in job["tracks"]] == pytest.approx([0.6, 1.1], abs=0.01)
    clip = await client.get(job["tracks"][0]["clip_url"])
    assert clip.status_code == 200
    assert clip.headers["content-type"] == "video/mp4"
    source = await client.get(job["source_url"])
    assert source.content == video


async def test_history_is_newest_first_without_tracks(
    client: AsyncClient, token: str, app: FastAPI, video: bytes
) -> None:
    ids = [(await _upload(client, token, video, f"{i}.mp4"))["id"] for i in range(3)]
    await app.state.job_queue.wait_idle()

    page = (await client.get(VIDEOS, headers=bearer(token), params={"limit": 2})).json()

    assert page["total"] == 3
    assert [item["id"] for item in page["items"]] == ids[::-1][:2]
    assert all(item["tracks"] is None for item in page["items"])


# ------------------------------------------------------------------ live progress (SSE)


async def test_events_stream_progress_frames_and_completion(
    settings: Settings, client_for: ClientFactory, video: bytes
) -> None:
    queue = ManualQueue()
    app = _video_app(settings, queue)
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        job_id = (await _upload(client, token, video))["id"]
        events: InMemoryJobEvents = app.state.job_events

        stream = asyncio.create_task(client.get(f"{VIDEOS}/{job_id}/events", headers=bearer(token)))
        for _ in range(200):  # wait until the endpoint has subscribed
            if events._queues.get(job_id):
                break
            await asyncio.sleep(0.01)
        await run_video_job(
            job_id,
            session_factory=app.state.session_factory,
            storage=app.state.storage,
            detector=app.state.models.image,
            events=events,
            settings=settings,
        )
        response = await asyncio.wait_for(stream, timeout=10)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    received = _parse_sse(response.text)
    names = [name for name, _ in received]
    assert received[0] == ("status", {"type": "status", "status": "queued", "progress": None})
    assert names[1] == "status" and received[1][1]["status"] == "running"
    assert names.count("progress") == names.count("frame") == 30
    assert names[-1] == "completed"
    frame = next(data for name, data in received if name == "frame")
    assert frame["image"].startswith("/9j/")  # base64 JPEG
    progress = [data["progress"] for name, data in received if name == "progress"]
    assert progress == sorted(progress)


async def test_events_for_a_finished_job_end_immediately(
    client: AsyncClient, token: str, app: FastAPI, video: bytes
) -> None:
    job_id = (await _upload(client, token, video))["id"]
    await app.state.job_queue.wait_idle()

    response = await client.get(f"{VIDEOS}/{job_id}/events", headers=bearer(token))

    assert [name for name, _ in _parse_sse(response.text)] == ["status", "completed"]


async def test_events_require_ownership(
    client: AsyncClient, token: str, outbox: list[EmailMessage], video: bytes, app: FastAPI
) -> None:
    job_id = (await _upload(client, token, video))["id"]
    await app.state.job_queue.wait_idle()
    await signup_and_activate(client, outbox, email="other@example.com")
    other = await login(client, email="other@example.com")

    anonymous = await client.get(f"{VIDEOS}/{job_id}/events")
    stranger = await client.get(f"{VIDEOS}/{job_id}/events", headers=bearer(other))

    assert anonymous.status_code == 401
    assert stranger.status_code == 404
    assert stranger.json()["code"] == "not_found"


# ------------------------------------------------------------------ validation


@pytest.mark.parametrize(
    ("data", "filename", "status", "code"),
    [
        (b"definitely not a video", "x.mp4", 422, "invalid_video"),
        (jpeg_bytes(), "photo.jpg", 422, "invalid_video"),
        (b"", "x.mp4", 422, "empty_upload"),
    ],
)
async def test_invalid_uploads_are_rejected_and_not_kept(
    client: AsyncClient,
    token: str,
    settings: Settings,
    data: bytes,
    filename: str,
    status: int,
    code: str,
) -> None:
    response = await client.post(
        VIDEOS, headers=bearer(token), files={"video": (filename, data, "video/mp4")}
    )

    assert response.status_code == status
    assert response.json()["code"] == code
    assert not [p for p in settings.storage_dir.rglob("*") if p.is_file()]  # nothing left behind
    assert (await client.get(VIDEOS, headers=bearer(token))).json()["total"] == 0


async def test_too_large_and_too_long_videos_are_rejected(
    settings: Settings, client_for: ClientFactory, video: bytes
) -> None:
    app = _video_app(
        settings.model_copy(update={"max_video_upload_mb": 1, "max_video_duration_seconds": 2})
    )
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        too_large = await client.post(
            VIDEOS,
            headers=bearer(token),
            files={"video": ("big.mp4", b"x" * (1024 * 1024 + 1), "video/mp4")},
        )
        too_long = await client.post(
            VIDEOS, headers=bearer(token), files={"video": ("long.mp4", video, "video/mp4")}
        )

    assert too_large.status_code == 413
    assert too_long.status_code == 422
    assert "too long" in too_long.json()["detail"]


async def test_upload_requires_authentication(client: AsyncClient, video: bytes) -> None:
    response = await client.post(VIDEOS, files={"video": ("a.mp4", video, "video/mp4")})

    assert response.status_code == 401


# ------------------------------------------------------------------ ownership


async def test_users_cannot_touch_each_others_jobs(
    client: AsyncClient, token: str, outbox: list[EmailMessage], video: bytes, app: FastAPI
) -> None:
    job_id = (await _upload(client, token, video))["id"]
    await app.state.job_queue.wait_idle()
    await signup_and_activate(client, outbox, email="other@example.com")
    other = bearer(await login(client, email="other@example.com"))

    assert (await client.get(VIDEOS, headers=other)).json()["total"] == 0
    assert (await client.get(f"{VIDEOS}/{job_id}", headers=other)).status_code == 404
    assert (await client.post(f"{VIDEOS}/{job_id}/cancel", headers=other)).status_code == 404
    assert (await client.delete(f"{VIDEOS}/{job_id}", headers=other)).status_code == 404
    assert (await client.get(f"{VIDEOS}/{job_id}", headers=bearer(token))).status_code == 200


# ------------------------------------------------------------------ cancel & delete


async def test_cancelling_a_queued_job(
    settings: Settings, client_for: ClientFactory, video: bytes
) -> None:
    queue = ManualQueue()
    app = _video_app(settings, queue)
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        job_id = (await _upload(client, token, video))["id"]

        cancelled = await client.post(f"{VIDEOS}/{job_id}/cancel", headers=bearer(token))
        again = await client.post(f"{VIDEOS}/{job_id}/cancel", headers=bearer(token))
        # the worker picks the job up later and must skip it
        result = await run_video_job(
            job_id,
            session_factory=app.state.session_factory,
            storage=app.state.storage,
            detector=app.state.models.image,
            events=app.state.job_events,
            settings=settings,
        )

    assert cancelled.status_code == 202
    assert cancelled.json()["status"] == "cancelled"
    assert again.status_code == 409
    assert again.json()["code"] == "job_not_active"
    assert result is None


async def test_cancelling_a_running_job_signals_the_worker(
    settings: Settings, client_for: ClientFactory, video: bytes
) -> None:
    app = _video_app(settings, ManualQueue())
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        job_id = (await _upload(client, token, video))["id"]
        async with app.state.session_factory() as db:
            job = await db.get(VideoJob, job_id)
            job.status = VideoJobStatus.RUNNING
            await db.commit()

        response = await client.post(f"{VIDEOS}/{job_id}/cancel", headers=bearer(token))

        assert response.status_code == 202
        assert await app.state.job_events.is_cancel_requested(job_id)


async def test_delete(settings: Settings, client_for: ClientFactory, video: bytes) -> None:
    app = _video_app(settings, ManualQueue())
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        job_id = (await _upload(client, token, video))["id"]

        while_queued = await client.delete(f"{VIDEOS}/{job_id}", headers=bearer(token))
        await run_video_job(
            job_id,
            session_factory=app.state.session_factory,
            storage=app.state.storage,
            detector=app.state.models.image,
            events=app.state.job_events,
            settings=settings,
        )
        files = [p for p in settings.storage_dir.rglob("*") if p.is_file()]
        deleted = await client.delete(f"{VIDEOS}/{job_id}", headers=bearer(token))
        gone = await client.get(f"{VIDEOS}/{job_id}", headers=bearer(token))

    assert while_queued.status_code == 409
    assert while_queued.json()["code"] == "job_still_active"
    assert len(files) == 3  # source + 2 clips
    assert deleted.status_code == 204
    assert gone.status_code == 404
    assert not any(p.exists() for p in files)


# ------------------------------------------------------------------ queue


async def test_queue_outage_returns_503_and_fails_the_job(
    settings: Settings, client_for: ClientFactory, video: bytes
) -> None:
    app = _video_app(settings, ManualQueue(fail=True))
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        response = await client.post(
            VIDEOS, headers=bearer(token), files={"video": ("a.mp4", video, "video/mp4")}
        )
        jobs = (await client.get(VIDEOS, headers=bearer(token))).json()["items"]

    assert response.status_code == 503
    assert response.json()["code"] == "queue_unavailable"
    assert [(j["status"], j["error"]) for j in jobs] == [("failed", "Could not queue the job.")]


async def test_celery_queue_sends_the_task_by_name(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    queue = CeleryJobQueue(settings)
    sent: list[tuple[str, list[int], dict[str, Any]]] = []
    monkeypatch.setattr(
        queue._celery,
        "send_task",
        lambda name, args, kwargs: sent.append((name, args, kwargs)),
    )

    with structlog.contextvars.bound_contextvars(request_id="req-0123456789"):
        await queue.enqueue(42)

    # The upload's request ID goes along, so the worker's log lines carry it.
    assert sent == [("secureye.process_video", [42], {"request_id": "req-0123456789"})]


def test_worker_registers_the_task_under_that_name() -> None:
    from app.workers.celery_app import celery_app

    assert "secureye.process_video" in celery_app.tasks


async def test_events_end_when_a_job_finishes_without_a_terminal_event(
    settings: Settings,
    client_for: ClientFactory,
    video: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: a worker that crashed without reporting left the stream open forever."""
    from app.api.v1 import videos as videos_module

    monkeypatch.setattr(videos_module, "_QUIET_RECHECK_SECONDS", 0.2)
    app = _video_app(settings, ManualQueue())
    async with client_for(app) as client:
        token = await _signed_in(client, app)
        job_id = (await _upload(client, token, video))["id"]
        stream = asyncio.create_task(client.get(f"{VIDEOS}/{job_id}/events", headers=bearer(token)))
        await asyncio.sleep(0.1)
        async with app.state.session_factory() as db:  # the job dies silently
            job = await db.get(VideoJob, job_id)
            job.status = VideoJobStatus.FAILED
            job.error = "Processing failed unexpectedly."
            await db.commit()
        response = await asyncio.wait_for(stream, timeout=10)

    assert _parse_sse(response.text)[-1] == (
        "failed",
        {"type": "failed", "status": "failed", "error": "Processing failed unexpectedly."},
    )
