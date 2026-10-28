"""Shared fixtures.

API tests run against a real PostgreSQL database (default: the docker-compose `db` service,
database `secureye_test`). It is created if missing and migrated with Alembic once per session,
which also proves the migrations work. Override with TEST_DATABASE_URL.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path

import asyncpg
import pytest
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.core.config import Environment, Settings
from app.db import models  # noqa: F401  (registers all tables)
from app.db.base import Base
from app.main import create_app
from app.services.email import EmailMessage, InMemoryEmailSender
from tests.fakes import fake_registry

ClientFactory = Callable[[FastAPI], AbstractAsyncContextManager[AsyncClient]]

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TEST_DATABASE_URL = "postgresql+asyncpg://secureye:secureye@localhost:5433/secureye_test"


async def _recreate_schema(url: str) -> None:
    """Create the test database if needed and give it an empty public schema."""
    parsed = make_url(url)
    connect_args = {
        "host": parsed.host,
        "port": parsed.port,
        "user": parsed.username,
        "password": parsed.password,
    }
    admin = await asyncpg.connect(database="postgres", **connect_args)
    try:
        exists = await admin.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", parsed.database
        )
        if not exists:
            await admin.execute(f'CREATE DATABASE "{parsed.database}"')
    finally:
        await admin.close()

    conn = await asyncpg.connect(database=parsed.database, **connect_args)
    try:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    try:
        asyncio.run(_recreate_schema(url))
    except OSError as exc:
        pytest.exit(
            f"Test database unreachable ({exc}). Start it with `docker compose up -d db` "
            "from the repository root or set TEST_DATABASE_URL.",
            returncode=1,
        )

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    return url


@pytest.fixture
def settings(database_url: str, tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,  # ignore a developer's local .env
        environment=Environment.TEST,
        database_url=database_url,
        cors_origins=["http://testserver.local"],
        frontend_url="http://frontend.test",
        email_backend="memory",
        rate_limit_storage_url="async+memory://",
        storage_dir=tmp_path / "storage",
        # API tests use a fake detector (fast, deterministic); tests/ml covers the real models.
        load_models_on_startup=False,
        # Video jobs run in-process with in-memory events (no Celery worker or Redis needed).
        job_runner="inline",
        job_events_backend="memory",
    )


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    app = create_app(settings)
    app.state.models = fake_registry()
    return app


@pytest.fixture
def client_for() -> ClientFactory:
    """Build a client for an arbitrary app, running its lifespan (startup/shutdown)."""

    @asynccontextmanager
    async def _client(app: FastAPI) -> AsyncIterator[AsyncClient]:
        async with app.router.lifespan_context(app):
            transport = ASGITransport(app=app, raise_app_exceptions=False)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client

    return _client


@pytest.fixture
async def client(app: FastAPI, client_for: ClientFactory) -> AsyncIterator[AsyncClient]:
    async with client_for(app) as client:
        yield client


@pytest.fixture
def outbox(app: FastAPI) -> list[EmailMessage]:
    sender = app.state.email_sender
    assert isinstance(sender, InMemoryEmailSender)
    return sender.outbox


@pytest.fixture(autouse=True)
async def _clean_database(request: pytest.FixtureRequest) -> AsyncIterator[None]:
    """Empty every table after each test that touched the database."""
    yield
    if "database_url" not in request.fixturenames:
        return
    engine = create_async_engine(request.getfixturevalue("database_url"))
    try:
        async with engine.begin() as conn:
            tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
            await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    finally:
        await engine.dispose()
