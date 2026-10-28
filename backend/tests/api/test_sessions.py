from datetime import timedelta

from httpx import AsyncClient

from app.core import security
from app.core.config import Settings
from app.services.email import EmailMessage
from tests.api.helpers import (
    PASSWORD,
    bearer,
    link_parts,
    login,
    signup,
    signup_and_activate,
    use_refresh_cookie,
)

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/users/me"


async def test_login_returns_access_token_and_sets_refresh_cookie(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup_and_activate(client, outbox)

    response = await client.post(LOGIN, json={"email": "JANE@example.com", "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.access_token_ttl_minutes * 60

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{settings.refresh_cookie_name}=")
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert "SameSite=lax" in cookie


async def test_me_returns_the_signed_in_user(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup_and_activate(client, outbox)
    token = await login(client)

    response = await client.get(ME, headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["email"] == "jane@example.com"
    assert response.json()["name"] == "Jane Doe"


async def test_wrong_password_and_unknown_email_get_the_same_error(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup_and_activate(client, outbox)

    wrong = await client.post(LOGIN, json={"email": "jane@example.com", "password": "Wrong-pass-1"})
    unknown = await client.post(LOGIN, json={"email": "who@example.com", "password": PASSWORD})

    assert wrong.status_code == unknown.status_code == 401
    assert (
        wrong.json()
        == unknown.json()
        == {
            "detail": "Invalid email or password.",
            "code": "invalid_credentials",
        }
    )


async def test_me_requires_a_valid_access_token(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup(client)
    _, activation_token = link_parts(outbox[0])
    expired = security.create_access_token(
        1, secret=settings.secret_key.get_secret_value(), ttl=timedelta(seconds=-1)
    ).token

    for headers in (
        {},
        bearer("garbage"),
        bearer(expired),
        bearer(activation_token),  # one-time tokens are not access tokens
        {"Authorization": "Basic amFuZTpwdw=="},
    ):
        response = await client.get(ME, headers=headers)
        assert response.status_code == 401, headers
        assert response.json()["code"] == "not_authenticated"
        assert response.headers["www-authenticate"] == "Bearer"


async def test_refresh_rotates_the_cookie_and_issues_a_new_access_token(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup_and_activate(client, outbox)
    await login(client)
    original = client.cookies[settings.refresh_cookie_name]

    response = await client.post(REFRESH)

    assert response.status_code == 200
    assert client.cookies[settings.refresh_cookie_name] != original
    me = await client.get(ME, headers=bearer(response.json()["access_token"]))
    assert me.status_code == 200


async def test_reusing_a_rotated_refresh_token_revokes_the_session(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup_and_activate(client, outbox)
    await login(client)
    stolen = client.cookies[settings.refresh_cookie_name]
    assert (await client.post(REFRESH)).status_code == 200  # legitimate rotation
    current = client.cookies[settings.refresh_cookie_name]

    use_refresh_cookie(client, settings.refresh_cookie_name, stolen)

    replay = await client.post(REFRESH)
    use_refresh_cookie(client, settings.refresh_cookie_name, current)
    after = await client.post(REFRESH)

    assert replay.status_code == 401
    assert replay.json()["code"] == "invalid_refresh_token"
    assert after.status_code == 401  # whole family revoked, including the newest token


async def test_refresh_without_cookie_is_rejected(client: AsyncClient) -> None:
    response = await client.post(REFRESH)

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_refresh_token"


async def test_logout_revokes_the_session_and_clears_the_cookie(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup_and_activate(client, outbox)
    await login(client)
    refresh_token = client.cookies[settings.refresh_cookie_name]

    response = await client.post(LOGOUT)

    assert response.status_code == 204
    assert settings.refresh_cookie_name not in client.cookies
    use_refresh_cookie(client, settings.refresh_cookie_name, refresh_token)
    replay = await client.post(REFRESH)
    assert replay.status_code == 401


async def test_logout_without_a_session_is_harmless(client: AsyncClient) -> None:
    assert (await client.post(LOGOUT)).status_code == 204


async def test_sessions_are_independent(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    """Logging out on one device doesn't end the session on another."""
    await signup_and_activate(client, outbox)
    await login(client)
    device_a = client.cookies[settings.refresh_cookie_name]
    await login(client)
    device_b = client.cookies[settings.refresh_cookie_name]

    use_refresh_cookie(client, settings.refresh_cookie_name, device_a)

    await client.post(LOGOUT)
    use_refresh_cookie(client, settings.refresh_cookie_name, device_b)
    response = await client.post(REFRESH)

    assert response.status_code == 200
