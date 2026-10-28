"""Request IDs, access logs and security headers (RequestContextMiddleware)."""

import re
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
import structlog
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from structlog.testing import capture_logs
from structlog.typing import EventDict

from app.core import middleware
from app.core.config import Environment, Settings
from app.main import create_app
from tests.conftest import ClientFactory


@contextmanager
def access_logs(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[EventDict]]:
    """Capture the access log as the app renders it (with context variables such as the
    request ID). Its logger is cached on first use, before capture starts, so swap in a new one."""
    with capture_logs(processors=[structlog.contextvars.merge_contextvars]) as logs:
        monkeypatch.setattr(middleware, "logger", structlog.get_logger("app.access"))
        yield logs


async def test_every_response_gets_a_request_id(client: AsyncClient) -> None:
    first = await client.get("/api/v1/health")
    second = await client.get("/api/v1/health")

    assert re.fullmatch(r"[0-9a-f]{32}", first.headers["X-Request-ID"])
    assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]


async def test_a_callers_request_id_is_kept_if_it_is_sensible(client: AsyncClient) -> None:
    kept = await client.get("/api/v1/health", headers={"X-Request-ID": "lb-7f3a9c21"})
    replaced = await client.get(
        "/api/v1/health", headers={"X-Request-ID": "bad id with spaces\nand a newline"}
    )

    assert kept.headers["X-Request-ID"] == "lb-7f3a9c21"
    assert replaced.headers["X-Request-ID"] != "bad id with spaces\nand a newline"
    assert re.fullmatch(r"[0-9a-f]{32}", replaced.headers["X-Request-ID"])


async def test_requests_are_logged_with_their_id(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    with access_logs(monkeypatch) as logs:
        response = await client.get("/api/v1/users/me")

    [entry] = [log for log in logs if log["event"] == "request"]
    assert entry["request_id"] == response.headers["X-Request-ID"]
    assert (entry["method"], entry["path"], entry["status"]) == ("GET", "/api/v1/users/me", 401)
    assert entry["duration_ms"] >= 0


async def test_health_checks_are_not_logged(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    with access_logs(monkeypatch) as logs:
        await client.get("/api/v1/health")

    assert not [log for log in logs if log["event"] == "request"]


async def test_api_responses_carry_security_headers(client: AsyncClient) -> None:
    response = await client.get("/api/v1/users/me")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Content-Security-Policy"].startswith("default-src 'none'")
    assert "Strict-Transport-Security" not in response.headers  # development: plain HTTP


async def test_admin_and_docs_get_policies_they_can_work_with(client: AsyncClient) -> None:
    admin = await client.get("/admin/login")
    docs = await client.get("/docs")

    assert "script-src 'self'" in admin.headers["Content-Security-Policy"]
    # Swagger UI loads from a CDN; the docs only exist outside production.
    assert "Content-Security-Policy" not in docs.headers
    assert docs.headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize("environment", [Environment.PRODUCTION])
async def test_production_adds_hsts(
    settings: Settings, client_for: ClientFactory, environment: Environment
) -> None:
    app: FastAPI = create_app(
        settings.model_copy(update={"environment": environment, "secret_key": SecretStr("x" * 64)})
    )

    async with client_for(app) as client:
        response = await client.get("/api/v1/health")

    assert response.headers["Strict-Transport-Security"].startswith("max-age=31536000")


async def test_cors_exposes_the_request_id(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health", headers={"Origin": "http://testserver.local"})

    assert "x-request-id" in response.headers["Access-Control-Expose-Headers"].lower()


async def test_cors_allows_only_what_the_web_app_uses(client: AsyncClient) -> None:
    def preflight(method: str, headers: str) -> dict[str, str]:
        return {
            "Origin": "http://testserver.local",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        }

    allowed = await client.options("/api/v1/images", headers=preflight("POST", "authorization"))
    put = await client.options("/api/v1/images", headers=preflight("PUT", "authorization"))
    odd_header = await client.options(
        "/api/v1/images", headers=preflight("GET", "x-forwarded-host")
    )
    other_origin = await client.options(
        "/api/v1/images",
        headers={**preflight("GET", "authorization"), "Origin": "https://evil.example"},
    )

    assert allowed.status_code == 200
    assert (put.status_code, odd_header.status_code, other_origin.status_code) == (400, 400, 400)
