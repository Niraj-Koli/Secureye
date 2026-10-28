"""Hands video jobs to whatever runs them: a Celery worker, or the API process itself."""

import asyncio
from functools import partial
from typing import Protocol

import anyio
import structlog
from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.middleware import current_request_id
from app.ml.detector import Detector
from app.services.job_events import JobEvents
from app.services.storage import Storage
from app.workers.video_job import run_video_job

logger = structlog.get_logger(__name__)

PROCESS_VIDEO_TASK = "secureye.process_video"


class JobQueue(Protocol):
    async def enqueue(self, job_id: int) -> None: ...

    async def close(self) -> None: ...


class CeleryJobQueue:
    """Production: send the job to a Celery worker via Redis."""

    def __init__(self, settings: Settings) -> None:
        # Only a client: sending by task name means the API never imports the worker module
        # (and with it torch and the model).
        self._celery = Celery("secureye", broker=settings.broker_url)
        self._celery.conf.update(task_serializer="json", accept_content=["json"])

    async def enqueue(self, job_id: int) -> None:
        # send_task does blocking network I/O; keep it off the event loop.
        # The upload's request ID travels with the task, so the worker's log lines carry it too.
        kwargs = {"request_id": current_request_id()}
        await anyio.to_thread.run_sync(
            lambda: self._celery.send_task(PROCESS_VIDEO_TASK, args=[job_id], kwargs=kwargs)
        )

    async def close(self) -> None:
        self._celery.close()


class InlineJobQueue:
    """Development without a worker, and tests: run the job as a task in this process."""

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession],
        storage: Storage,
        detector: Detector,
        events: JobEvents,
        settings: Settings,
    ) -> None:
        self._run = partial(
            run_video_job,
            session_factory=session_factory,
            storage=storage,
            detector=detector,
            events=events,
            settings=settings,
        )
        self._tasks: set[asyncio.Task[object]] = set()

    async def enqueue(self, job_id: int) -> None:
        task: asyncio.Task[object] = asyncio.create_task(self._run(job_id))
        self._tasks.add(task)  # keep a reference so the task isn't garbage-collected
        task.add_done_callback(self._tasks.discard)

    async def wait_idle(self) -> None:
        """Wait for every running job (tests)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    async def close(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
