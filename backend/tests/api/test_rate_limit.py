from httpx import AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import ClientFactory

LOGIN = "/api/v1/auth/login"
CREDENTIALS = {"email": "nobody@example.com", "password": "Whatever-123"}


async def test_login_is_limited_per_client(client: AsyncClient) -> None:
    statuses = [(await client.post(LOGIN, json=CREDENTIALS)).status_code for _ in range(11)]

    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


async def test_rate_limited_response_has_retry_after(client: AsyncClient) -> None:
    for _ in range(10):
        await client.post(LOGIN, json=CREDENTIALS)

    response = await client.post(LOGIN, json=CREDENTIALS)

    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert 1 <= int(response.headers["retry-after"]) <= 60


async def test_limits_are_tracked_per_endpoint(client: AsyncClient) -> None:
    for _ in range(11):
        await client.post(LOGIN, json=CREDENTIALS)

    response = await client.post("/api/v1/auth/password-reset", json={"email": "a@example.com"})

    assert response.status_code == 202


async def test_rate_limiting_can_be_disabled(settings: Settings, client_for: ClientFactory) -> None:
    app = create_app(settings.model_copy(update={"rate_limit_enabled": False}))

    async with client_for(app) as client:
        statuses = {(await client.post(LOGIN, json=CREDENTIALS)).status_code for _ in range(15)}

    assert statuses == {401}
