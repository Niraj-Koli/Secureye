"""End to end through HTTP with the real model."""

from fastapi import FastAPI
from httpx import AsyncClient

from app.ml.registry import ModelRegistry
from app.services.email import EmailMessage
from tests.api.helpers import bearer, login, signup_and_activate
from tests.ml.conftest import FIXTURES


async def test_upload_real_photo(
    app: FastAPI, client: AsyncClient, outbox: list[EmailMessage], real_models: ModelRegistry
) -> None:
    app.state.models = real_models
    await signup_and_activate(client, outbox)
    token = await login(client)

    response = await client.post(
        "/api/v1/images",
        headers=bearer(token),
        files={"image": ("soldiers.jpg", (FIXTURES / "soldiers.jpg").read_bytes(), "image/jpeg")},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["model"] == "bestM"
    assert (body["width"], body["height"]) == (2880, 1920)
    classes = [d["class_name"] for d in body["detections"]]
    assert classes.count("Soldier") >= 3
    assert "Rifle" in classes
    annotated = await client.get(body["annotated_url"])
    assert annotated.status_code == 200
    assert annotated.content[:3] == b"\xff\xd8\xff"
