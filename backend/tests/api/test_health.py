from httpx import AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import ClientFactory


async def test_liveness(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness_when_database_is_reachable(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


async def test_readiness_when_database_is_unreachable(
    settings: Settings, client_for: ClientFactory
) -> None:
    # Port 1 on localhost refuses connections immediately.
    broken = settings.model_copy(
        update={"database_url": "postgresql+asyncpg://user:pw@127.0.0.1:1/nodb"}
    )

    async with client_for(create_app(broken)) as client:
        response = await client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unavailable"}
