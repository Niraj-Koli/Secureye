from httpx import AsyncClient

from app.core.config import Settings
from app.services.email import EmailMessage
from tests.api.helpers import (
    PASSWORD,
    link_parts,
    login,
    signup,
    signup_and_activate,
    use_refresh_cookie,
)

REQUEST = "/api/v1/auth/password-reset"
CONFIRM = "/api/v1/auth/password-reset/confirm"
NEW_PASSWORD = "N3w-Basalt-Owl"


async def _request_reset(client: AsyncClient, outbox: list[EmailMessage]) -> tuple[str, str]:
    outbox.clear()
    response = await client.post(REQUEST, json={"email": "jane@example.com"})
    assert response.status_code == 202
    assert len(outbox) == 1
    assert "http://frontend.test/password/reset/confirm/" in outbox[0].text
    return link_parts(outbox[0])


async def test_reset_request_does_not_reveal_unknown_or_inactive_accounts(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup(client, email="inactive@example.com")
    outbox.clear()

    unknown = await client.post(REQUEST, json={"email": "nobody@example.com"})
    inactive = await client.post(REQUEST, json={"email": "inactive@example.com"})

    assert unknown.status_code == inactive.status_code == 202
    assert outbox == []


async def test_full_password_reset_flow(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup_and_activate(client, outbox)
    await login(client)
    old_refresh = client.cookies[settings.refresh_cookie_name]
    uid, token = await _request_reset(client, outbox)
    outbox.clear()

    response = await client.post(
        CONFIRM,
        json={
            "uid": uid,
            "token": token,
            "new_password": NEW_PASSWORD,
            "re_new_password": NEW_PASSWORD,
        },
    )

    assert response.status_code == 204
    # "password changed" confirmation email (old: PASSWORD_CHANGED_EMAIL_CONFIRMATION)
    assert [m.subject for m in outbox] == ["Your Secureye password was changed"]
    # old password no longer works, new one does
    old = await client.post(
        "/api/v1/auth/login", json={"email": "jane@example.com", "password": PASSWORD}
    )
    assert old.status_code == 401
    assert await login(client, password=NEW_PASSWORD)
    # every pre-existing session was signed out
    use_refresh_cookie(client, settings.refresh_cookie_name, old_refresh)
    replay = await client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401


async def test_reset_link_works_only_once(client: AsyncClient, outbox: list[EmailMessage]) -> None:
    await signup_and_activate(client, outbox)
    uid, token = await _request_reset(client, outbox)
    body = {
        "uid": uid,
        "token": token,
        "new_password": NEW_PASSWORD,
        "re_new_password": NEW_PASSWORD,
    }

    first = await client.post(CONFIRM, json=body)
    second = await client.post(
        CONFIRM, json={**body, "new_password": "An0ther-Pass!", "re_new_password": "An0ther-Pass!"}
    )

    assert first.status_code == 204
    assert second.status_code == 400
    assert second.json()["code"] == "invalid_or_expired_link"


async def test_activation_token_cannot_reset_a_password(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup(client)
    uid, activation_token = link_parts(outbox[0])

    response = await client.post(
        CONFIRM,
        json={
            "uid": uid,
            "token": activation_token,
            "new_password": NEW_PASSWORD,
            "re_new_password": NEW_PASSWORD,
        },
    )

    assert response.status_code == 400


async def test_passwords_must_match(client: AsyncClient, outbox: list[EmailMessage]) -> None:
    await signup_and_activate(client, outbox)
    uid, token = await _request_reset(client, outbox)

    response = await client.post(
        CONFIRM,
        json={
            "uid": uid,
            "token": token,
            "new_password": NEW_PASSWORD,
            "re_new_password": "Different-1",
        },
    )

    assert response.status_code == 422
    assert "Passwords do not match." in str(response.json()["detail"])


async def test_new_password_must_be_strong_and_unlike_identity(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup_and_activate(client, outbox)
    uid, token = await _request_reset(client, outbox)

    common = await client.post(
        CONFIRM,
        json={
            "uid": uid,
            "token": token,
            "new_password": "password1",
            "re_new_password": "password1",
        },
    )
    similar = await client.post(
        CONFIRM,
        json={
            "uid": uid,
            "token": token,
            "new_password": "janedoe77",
            "re_new_password": "janedoe77",
        },
    )

    assert common.status_code == 422
    assert similar.status_code == 422
    assert similar.json()["code"] == "weak_password"
    assert await login(client)  # password unchanged
