"""The superuser-only admin site at /admin (SQLAdmin)."""

from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import select, update

from app.models.live import Camera
from app.models.user import User
from app.services.email import EmailMessage
from tests.api.helpers import PASSWORD, signup_and_activate

ADMIN_EMAIL = "admin@example.com"


async def _set_superuser(app: FastAPI, email: str, value: bool = True) -> None:
    async with app.state.session_factory() as db:
        await db.execute(update(User).where(User.email == email).values(is_superuser=value))
        await db.commit()


async def _admin_login(
    client: AsyncClient, email: str = ADMIN_EMAIL, password: str = PASSWORD
) -> Response:
    return await client.post("/admin/login", data={"username": email, "password": password})


async def _signed_in_admin(app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]) -> None:
    await signup_and_activate(client, outbox, email=ADMIN_EMAIL)
    await _set_superuser(app, ADMIN_EMAIL)
    response = await _admin_login(client)
    assert response.status_code == 302
    assert response.headers["location"].endswith("/admin/")


async def test_pages_require_an_admin_login(client: AsyncClient) -> None:
    response = await client.get("/admin/user/list")

    assert response.status_code == 302
    assert response.headers["location"].endswith("/admin/login")


async def test_only_superusers_can_sign_in(client: AsyncClient, outbox: list[EmailMessage]) -> None:
    await signup_and_activate(client, outbox, email="jane@example.com")

    regular = await _admin_login(client, "jane@example.com")
    wrong_password = await _admin_login(client, "jane@example.com", "Wrong-Password-1")

    # SQLAdmin shows the login form again (400) instead of redirecting into the site.
    assert regular.status_code == 400
    assert wrong_password.status_code == 400
    assert (await client.get("/admin/user/list")).status_code == 302


async def test_superuser_browses_every_section(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await _signed_in_admin(app, client, outbox)

    for section in (
        "user",
        "image-detection",
        "video-job",
        "video-track",
        "live-session",
        "live-event",
        "camera",
    ):
        response = await client.get(f"/admin/{section}/list")
        assert response.status_code == 200, section
    users = await client.get("/admin/user/list")
    assert ADMIN_EMAIL in users.text
    assert "argon2" not in users.text  # password hashes are never shown


async def test_records_with_files_are_read_only(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await _signed_in_admin(app, client, outbox)

    # Deleting these must also delete their files, which only the API does.
    for section in ("image-detection", "video-job", "live-session"):
        assert (await client.get(f"/admin/{section}/create")).status_code in (403, 404)
    assert (await client.get("/admin/user/create")).status_code in (403, 404)


async def test_cameras_can_be_managed(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await _signed_in_admin(app, client, outbox)

    response = await client.post(
        "/admin/camera/create",
        data={"name": "Gate", "source": "rtsp://10.0.0.5/stream", "enabled": "y"},
    )

    assert response.status_code == 302
    async with app.state.session_factory() as db:
        camera = await db.scalar(select(Camera).where(Camera.name == "Gate"))
    assert camera is not None
    assert (camera.source, camera.enabled) == ("rtsp://10.0.0.5/stream", True)


async def test_revoking_admin_rights_ends_the_admin_session(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await _signed_in_admin(app, client, outbox)
    assert (await client.get("/admin/user/list")).status_code == 200

    await _set_superuser(app, ADMIN_EMAIL, value=False)

    assert (await client.get("/admin/user/list")).status_code == 302


async def test_admin_login_is_rate_limited(client: AsyncClient, outbox: list[EmailMessage]) -> None:
    await signup_and_activate(client, outbox, email="jane@example.com")

    statuses = [
        (await _admin_login(client, "jane@example.com", "Wrong-Password-1")).status_code
        for _ in range(6)
    ]

    assert statuses == [400] * 6  # every attempt fails the same way...
    # ...and from the sixth on, even the right password is refused for a while.
    assert (await _admin_login(client, "jane@example.com", PASSWORD)).status_code == 400


async def test_admin_cookie_is_scoped_and_strict(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup_and_activate(client, outbox, email=ADMIN_EMAIL)
    await _set_superuser(app, ADMIN_EMAIL)

    response = await _admin_login(client)

    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith("secureye_admin=")
    assert "path=/admin" in cookie
    assert "httponly" in cookie
    assert "samesite=strict" in cookie


async def test_duplicate_camera_names_get_a_plain_message(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await _signed_in_admin(app, client, outbox)
    camera = {"name": "Gate", "source": "rtsp://10.0.0.5/stream", "enabled": "y"}
    assert (await client.post("/admin/camera/create", data=camera)).status_code == 302

    again = await client.post("/admin/camera/create", data={**camera, "name": "  Gate "})

    assert again.status_code == 400
    assert "A camera named &#34;Gate&#34; already exists." in again.text
    assert "INSERT INTO" not in again.text  # no database internals
