import re

from httpx import AsyncClient

from app.services.email import EmailMessage

PASSWORD = "Gr4nite-Falcon!"

_LINK = re.compile(r"/(?:activate|password/reset/confirm)/(?P<uid>[^/\s]+)/(?P<token>[^\s<\"]+)")


def link_parts(message: EmailMessage) -> tuple[str, str]:
    """Extract (uid, token) from an activation or password-reset email."""
    match = _LINK.search(message.text)
    assert match, message.text
    return match["uid"], match["token"]


async def signup(
    client: AsyncClient,
    *,
    email: str = "jane@example.com",
    name: str = "Jane Doe",
    password: str = PASSWORD,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/auth/signup", json={"name": name, "email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    body: dict[str, object] = response.json()
    return body


async def signup_and_activate(
    client: AsyncClient,
    outbox: list[EmailMessage],
    *,
    email: str = "jane@example.com",
    password: str = PASSWORD,
) -> None:
    await signup(client, email=email, password=password)
    uid, token = link_parts(outbox[-1])
    response = await client.post("/api/v1/auth/activate", json={"uid": uid, "token": token})
    assert response.status_code == 204, response.text


async def login(
    client: AsyncClient, *, email: str = "jane@example.com", password: str = PASSWORD
) -> str:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def use_refresh_cookie(client: AsyncClient, name: str, value: str) -> None:
    """Make `value` the refresh cookie the client sends (simulates another device / a thief)."""
    client.cookies.clear()
    # http.cookiejar stores cookies for dot-less hosts like "test" under "test.local".
    client.cookies.set(name, value, domain="test.local", path="/api/v1/auth")
    assert client.cookies.get(name, path="/api/v1/auth") == value
