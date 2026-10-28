"""Application factory and ASGI entry point (`uvicorn app.main:app`)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import anyio
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin import mount_admin
from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware
from app.core.rate_limit import RateLimiter
from app.db.session import create_engine, create_session_factory
from app.ml.registry import load_registry
from app.services.email import create_email_sender
from app.services.job_events import InMemoryJobEvents, RedisJobEvents
from app.services.job_queue import CeleryJobQueue, InlineJobQueue, JobQueue
from app.services.live import ActiveSessions
from app.services.storage import FileSigner, LocalStorage

logger = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    # Creating the engine doesn't connect; the pool opens connections on first use.
    engine = create_engine(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.load_models_on_startup:
            # Loading + warm-up blocks for a few seconds; keep the event loop free meanwhile.
            app.state.models = await anyio.to_thread.run_sync(load_registry, settings)
        if getattr(app.state, "job_queue", None) is None:
            app.state.job_queue = _create_job_queue(app, settings)
        logger.info("startup", environment=settings.environment.value, jobs=settings.job_runner)
        try:
            yield
        finally:
            if app.state.job_queue is not None:
                await app.state.job_queue.close()
            await app.state.job_events.close()
            await engine.dispose()
            logger.info("shutdown")

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        # Interactive docs are a development aid; don't expose them in production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else f"{settings.api_v1_prefix}/openapi.json",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.email_sender = create_email_sender(settings)
    app.state.rate_limiter = RateLimiter(settings)
    app.state.storage = LocalStorage(settings.storage_dir)
    app.state.live_sessions = ActiveSessions(settings.live_max_sessions_per_user)
    app.state.job_events = (
        RedisJobEvents(settings.redis_url)
        if settings.job_events_backend == "redis"
        else InMemoryJobEvents()
    )
    app.state.file_signer = FileSigner(
        settings.secret_key.get_secret_value(),
        url_prefix=f"{settings.api_v1_prefix}/files",
        ttl_seconds=settings.file_url_ttl_seconds,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        # Only what the web app uses (it's normally same-origin through a proxy anyway).
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Accept", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )
    # Added last, so it runs first: every response (CORS and errors included) gets a request ID.
    app.add_middleware(RequestContextMiddleware, settings=settings)

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    if settings.admin_enabled:
        mount_admin(
            app,
            settings,
            app.state.session_factory,
            app.state.rate_limiter,
            app.state.file_signer,
        )

    return app


def _create_job_queue(app: FastAPI, settings: Settings) -> JobQueue | None:
    if settings.job_runner == "celery":
        return CeleryJobQueue(settings)
    models = getattr(app.state, "models", None)
    if models is None:
        return None  # inline processing needs the model in this process
    return InlineJobQueue(
        session_factory=app.state.session_factory,
        storage=app.state.storage,
        detector=models.image,
        events=app.state.job_events,
        settings=settings,
    )


app = create_app()
