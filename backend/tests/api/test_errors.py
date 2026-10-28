from fastapi import FastAPI
from httpx import AsyncClient

from app.core.errors import NotFoundError
from tests.conftest import ClientFactory


async def test_unknown_route_uses_error_shape(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found", "code": "not_found"}


async def test_method_not_allowed_uses_error_shape(client: AsyncClient) -> None:
    response = await client.post("/api/v1/health")

    assert response.status_code == 405
    assert response.json()["code"] == "method_not_allowed"


async def test_app_error_is_rendered_with_its_status_and_code(
    app: FastAPI, client_for: ClientFactory
) -> None:
    @app.get("/boom-not-found")
    async def _raise() -> None:
        raise NotFoundError("Detection not found.")

    async with client_for(app) as client:
        response = await client.get("/boom-not-found")

    assert response.status_code == 404
    assert response.json() == {"detail": "Detection not found.", "code": "not_found"}


async def test_validation_error_uses_error_shape(app: FastAPI, client_for: ClientFactory) -> None:
    @app.get("/needs-int")
    async def _needs_int(value: int) -> int:
        return value

    async with client_for(app) as client:
        response = await client.get("/needs-int", params={"value": "abc"})

    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "validation_error"
    assert body["detail"][0]["loc"] == ["query", "value"]


async def test_unhandled_exception_hides_internals(app: FastAPI, client_for: ClientFactory) -> None:
    @app.get("/crash")
    async def _crash() -> None:
        raise RuntimeError("secret database password in message")

    async with client_for(app) as client:
        response = await client.get("/crash")

    assert response.status_code == 500
    request_id = response.headers["X-Request-ID"]
    assert response.json() == {
        "detail": "Internal server error.",
        "code": "internal_error",
        "request_id": request_id,  # finds the traceback in the logs
    }
    assert "secret" not in response.text
