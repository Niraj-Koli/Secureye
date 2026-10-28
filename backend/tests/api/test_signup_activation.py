from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.core import security
from app.core.config import Settings
from app.services.email import EmailMessage
from tests.api.helpers import PASSWORD, link_parts, login, signup

ACTIVATE = "/api/v1/auth/activate"


async def test_signup_creates_inactive_user_and_sends_activation_email(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    body = await signup(client, email="Jane@Example.COM")

    assert body["email"] == "jane@example.com"  # normalized
    assert body["is_active"] is False
    assert "password" not in body and "password_hash" not in body
    assert len(outbox) == 1
    assert outbox[0].to == "jane@example.com"
    assert "http://frontend.test/activate/" in outbox[0].text


async def test_signup_rejects_duplicate_email_case_insensitively(client: AsyncClient) -> None:
    await signup(client, email="jane@example.com")

    response = await client.post(
        "/api/v1/auth/signup",
        json={"name": "Other", "email": "JANE@example.com", "password": PASSWORD},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "email_already_registered"


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        ({"name": "Jane_Doe!"}, "name with symbols (old regex: letters, digits, spaces)"),
        ({"name": "   "}, "blank name"),
        ({"email": "not-an-email"}, "invalid email"),
        ({"password": "short1"}, "too short"),
        ({"password": "has spaces 123"}, "whitespace"),
        ({"password": "98127346501"}, "numeric only"),
        ({"password": "password123"}, "common"),
        ({"password": "janedoe99"}, "similar to name"),
    ],
)
async def test_signup_validation(
    client: AsyncClient, outbox: list[EmailMessage], payload: dict[str, str], reason: str
) -> None:
    data = {"name": "Jane Doe", "email": "jane@example.com", "password": PASSWORD, **payload}

    response = await client.post("/api/v1/auth/signup", json=data)

    assert response.status_code == 422, reason
    assert response.json()["code"] == "validation_error"
    assert outbox == []


async def test_activation_link_activates_account_once(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup(client)
    uid, token = link_parts(outbox[0])

    first = await client.post(ACTIVATE, json={"uid": uid, "token": token})
    second = await client.post(ACTIVATE, json={"uid": uid, "token": token})

    assert first.status_code == 204
    assert second.status_code == 409
    assert second.json()["code"] == "already_active"
    assert await login(client)


async def test_inactive_user_cannot_log_in(client: AsyncClient) -> None:
    await signup(client)

    response = await client.post(
        "/api/v1/auth/login", json={"email": "jane@example.com", "password": PASSWORD}
    )

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


async def test_tampered_activation_token_is_rejected(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup(client)
    uid, token = link_parts(outbox[0])
    tampered = token[:-2] + ("AA" if not token.endswith("AA") else "BB")

    response = await client.post(ACTIVATE, json={"uid": uid, "token": tampered})

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_or_expired_link"


async def test_activation_token_for_another_user_is_rejected(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup(client, email="a@example.com")
    await signup(client, email="b@example.com")
    uid_a, _ = link_parts(outbox[0])
    _, token_b = link_parts(outbox[1])

    response = await client.post(ACTIVATE, json={"uid": uid_a, "token": token_b})

    assert response.status_code == 400


async def test_expired_activation_token_is_rejected(
    client: AsyncClient, outbox: list[EmailMessage], settings: Settings
) -> None:
    await signup(client)
    uid, valid = link_parts(outbox[0])
    claims = security.decode_one_time_token(
        valid,
        purpose=security.TokenPurpose.ACTIVATION,
        secret=settings.secret_key.get_secret_value(),
    )
    expired = security.create_one_time_token(
        user_id=claims.user_id,
        purpose=security.TokenPurpose.ACTIVATION,
        fingerprint=claims.fingerprint,
        secret=settings.secret_key.get_secret_value(),
        ttl=timedelta(seconds=-1),
    )

    response = await client.post(ACTIVATE, json={"uid": uid, "token": expired})

    assert response.status_code == 400


async def test_malformed_uid_is_rejected(client: AsyncClient) -> None:
    response = await client.post(ACTIVATE, json={"uid": "%%%", "token": "x"})

    assert response.status_code == 400


async def test_resend_activation_only_emails_inactive_accounts(
    client: AsyncClient, outbox: list[EmailMessage]
) -> None:
    await signup(client, email="pending@example.com")
    await signup(client, email="active@example.com")
    uid, token = link_parts(outbox[1])
    await client.post(ACTIVATE, json={"uid": uid, "token": token})
    outbox.clear()

    responses = [
        await client.post("/api/v1/auth/activate/resend", json={"email": email})
        for email in ("pending@example.com", "active@example.com", "nobody@example.com")
    ]

    assert [r.status_code for r in responses] == [202, 202, 202]  # no account enumeration
    assert [m.to for m in outbox] == ["pending@example.com"]
