"""Celery worker for video jobs.

Run a worker (each worker process loads its own copy of the model):

    uv run celery -A app.workers.celery_app worker --loglevel=info --concurrency=1
    # Windows (Celery's prefork pool doesn't run there):
    uv run celery -A app.workers.celery_app worker --loglevel=info --pool=solo
"""

import asyncio

import structlog
from celery import Celery
from celery.signals import worker_process_init
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.ml.detector import YoloDetector
from app.models.video import VideoJobStatus
from app.services.job_events import RedisJobEvents
from app.services.job_queue import PROCESS_VIDEO_TASK
from app.services.storage import LocalStorage
from app.workers.video_job import fail_job, run_video_job

settings = get_settings()
logger = structlog.get_logger(__name__)

celery_app = Celery("secureye", broker=settings.broker_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    task_ignore_result=True,
    # A video job is long and expensive: take one at a time, and only acknowledge it once it's
    # done, so a crashed worker's job is redelivered instead of silently lost.
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Redelivery only after this long without an ack; must exceed the longest job.
    broker_transport_options={"visibility_timeout": 4 * 3600},
    # Logging is ours (structlog, JSON in production) in every worker process. Celery would
    # otherwise replace the root logger's setup and, in its child processes, redirect stdout
    # into logging, where the job's log lines were silently lost.
    worker_hijack_root_logger=False,
    worker_redirect_stdouts=False,
)
configure_logging(settings)

_detector: YoloDetector | None = None


@worker_process_init.connect
def _load_model(**_: object) -> None:
    """Load the model once per worker process, before the first job arrives."""
    configure_logging(settings)
    _get_detector()


def _get_detector() -> YoloDetector:
    global _detector
    if _detector is None:
        _detector = YoloDetector(
            settings.models_dir / settings.image_model_file, device=settings.inference_device
        )
        _detector.warm_up()
        logger.info("worker_model_loaded", model=_detector.name)
    return _detector


async def _run(job_id: int) -> VideoJobStatus | None:
    # A fresh engine per task: each task runs in its own event loop (asyncio.run), and pooled
    # asyncpg connections can't be shared across loops.
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    events = RedisJobEvents(settings.redis_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        return await run_video_job(
            job_id,
            session_factory=session_factory,
            storage=LocalStorage(settings.storage_dir),
            detector=_get_detector(),
            events=events,
            settings=settings,
        )
    except Exception:
        # The runner handles processing errors itself; this catches failures around it
        # (model loading, database, storage). Without it the job would stay queued/running
        # forever and its progress stream would never end.
        logger.exception("video_job_task_crashed", job_id=job_id)
        await fail_job(job_id, session_factory=session_factory, events=events)
        return VideoJobStatus.FAILED
    finally:
        await events.close()
        await engine.dispose()


@celery_app.task(name=PROCESS_VIDEO_TASK)
def process_video_task(job_id: int, request_id: str | None = None) -> str | None:
    # `request_id` is the upload request's; tasks queued before it existed simply lack it.
    with structlog.contextvars.bound_contextvars(request_id=request_id, job_id=job_id):
        status = asyncio.run(_run(job_id))
    return status.value if status else None
