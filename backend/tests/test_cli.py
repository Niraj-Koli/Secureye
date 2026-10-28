"""`python -m app.cli create-superuser` (replaces Django's `manage.py createsuperuser`)."""

import json
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest
from httpx import AsyncClient

from app import cli
from app.core.config import get_settings
from tests.api.helpers import bearer, login

STRONG = "Adm1n-Granite!"


@pytest.fixture
def cli_env(database_url: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("SECUREYE_SUPERUSER_PASSWORD", STRONG)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _run(*args: str) -> None:
    # The CLI owns its event loop (asyncio.run), so run it off the test's loop.
    errors: list[BaseException] = []

    def target() -> None:
        try:
            cli.main(list(args))
        except BaseException as exc:  # SystemExit included
            errors.append(exc)

    thread = threading.Thread(target=target)
    thread.start()
    thread.join()
    if errors:
        raise errors[0]


async def test_creates_an_active_superuser_who_can_log_in(
    cli_env: None, client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    _run("create-superuser", "--email", "Admin@Example.com", "--name", "Site Admin")

    assert "Superuser admin@example.com created" in capsys.readouterr().out
    token = await login(client, email="admin@example.com", password=STRONG)
    me = (await client.get("/api/v1/users/me", headers=bearer(token))).json()
    assert me["is_staff"] is True
    assert me["is_active"] is True


async def test_refuses_duplicate_email(cli_env: None, client: AsyncClient) -> None:
    _run("create-superuser", "--email", "admin@example.com", "--name", "Site Admin")

    with pytest.raises(SystemExit, match="already exists"):
        _run("create-superuser", "--email", "admin@example.com", "--name", "Other")


def test_refuses_weak_password(cli_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SECUREYE_SUPERUSER_PASSWORD", "password1")

    with pytest.raises(SystemExit, match="too common"):
        _run("create-superuser", "--email", "admin@example.com", "--name", "Site Admin")


def test_refuses_invalid_email(cli_env: None) -> None:
    with pytest.raises(SystemExit, match="Invalid email"):
        _run("create-superuser", "--email", "nope", "--name", "Site Admin")


def test_export_openapi_writes_the_api_schema(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    cli.main(["export-openapi", str(target)])

    schema = json.loads(target.read_text(encoding="utf-8"))
    assert schema["info"]["title"]
    assert "/api/v1/auth/login" in schema["paths"]
    assert "UserRead" in schema["components"]["schemas"]
