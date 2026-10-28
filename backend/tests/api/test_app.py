from httpx import AsyncClient
from pydantic import SecretStr

from app.core.config import Environment, Settings
from app.main import create_app
from tests.conftest import ClientFactory


async def test_docs_available_outside_production(client: AsyncClient) -> None:
    assert (await client.get("/docs")).status_code == 200
    assert (await client.get("/api/v1/openapi.json")).status_code == 200


async def test_docs_hidden_in_production(settings: Settings, client_for: ClientFactory) -> None:
    production = settings.model_copy(
        update={"environment": Environment.PRODUCTION, "secret_key": SecretStr("x" * 40)}
    )

    async with client_for(create_app(production)) as client:
        assert (await client.get("/docs")).status_code == 404
        assert (await client.get("/api/v1/openapi.json")).status_code == 404


async def test_cors_allows_configured_origin_only(client: AsyncClient) -> None:
    allowed = await client.get("/api/v1/health", headers={"Origin": "http://testserver.local"})
    denied = await client.get("/api/v1/health", headers={"Origin": "http://evil.example"})

    assert allowed.headers["access-control-allow-origin"] == "http://testserver.local"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "access-control-allow-origin" not in denied.headers
