import io

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from PIL import Image

from app.core.config import Settings
from app.main import create_app
from app.services.email import EmailMessage
from tests.api.helpers import bearer, login, signup_and_activate
from tests.conftest import ClientFactory
from tests.fakes import FakeDetector, fake_registry, jpeg_bytes

IMAGES = "/api/v1/images"


@pytest.fixture
async def token(client: AsyncClient, outbox: list[EmailMessage]) -> str:
    await signup_and_activate(client, outbox)
    return await login(client)


async def _upload(
    client: AsyncClient, token: str, data: bytes | None = None, filename: str = "photo.jpg"
) -> dict[str, object]:
    response = await client.post(
        IMAGES,
        headers=bearer(token),
        files={"image": (filename, data or jpeg_bytes(), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    body: dict[str, object] = response.json()
    return body


async def test_detect_returns_detections_and_signed_file_links(
    client: AsyncClient, token: str, app: FastAPI, settings: Settings
) -> None:
    body = await _upload(client, token, jpeg_bytes(64, 48), filename="C:\\Users\\me\\scene.jpg")

    assert body["original_filename"] == "scene.jpg"  # client path stripped
    assert (body["width"], body["height"]) == (64, 48)
    assert body["model"] == "fake-image"
    assert body["detections"] == [
        {
            "class_name": "Soldier",
            "confidence": 0.87,
            "box": {"x1": 16.0, "y1": 12.0, "x2": 48.0, "y2": 36.0},
        }
    ]
    # thresholds from the original image endpoint were passed to the model
    detector = app.state.models.image
    assert isinstance(detector, FakeDetector)
    assert detector.calls == [((48, 64, 3), 0.2, 0.3)]
    assert (body["confidence_threshold"], body["iou_threshold"]) == (0.2, 0.3)

    original = await client.get(str(body["original_url"]))
    annotated = await client.get(str(body["annotated_url"]))
    assert original.status_code == annotated.status_code == 200
    assert original.content == jpeg_bytes(64, 48)  # stored exactly as uploaded
    # Old bug: the "predicted image" file contained base64 text. Now it's a real JPEG.
    assert annotated.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(annotated.content)).format == "JPEG"
    assert "private" in annotated.headers["cache-control"]


async def test_detection_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(IMAGES, files={"image": ("a.jpg", jpeg_bytes(), "image/jpeg")})

    assert response.status_code == 401


async def test_non_image_upload_is_rejected(client: AsyncClient, token: str) -> None:
    response = await client.post(
        IMAGES,
        headers=bearer(token),
        files={"image": ("evil.jpg", b"<?php echo 1; ?>", "image/jpeg")},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_image"


async def test_empty_upload_is_rejected(client: AsyncClient, token: str) -> None:
    response = await client.post(
        IMAGES, headers=bearer(token), files={"image": ("a.jpg", b"", "image/jpeg")}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "empty_upload"


async def test_oversized_upload_is_rejected(settings: Settings, client_for: ClientFactory) -> None:
    app = create_app(settings.model_copy(update={"max_image_upload_mb": 1}))
    app.state.models = fake_registry()

    async with client_for(app) as client:
        await signup_and_activate(client, app.state.email_sender.outbox)
        token = await login(client)
        response = await client.post(
            IMAGES,
            headers=bearer(token),
            files={"image": ("big.jpg", b"x" * (1024 * 1024 + 1), "image/jpeg")},
        )

    assert response.status_code == 413
    assert response.json()["code"] == "upload_too_large"


async def test_missing_file_field_is_a_validation_error(client: AsyncClient, token: str) -> None:
    response = await client.post(
        IMAGES, headers=bearer(token), files={"wrong": ("a.jpg", jpeg_bytes(), "image/jpeg")}
    )

    assert response.status_code == 422


async def test_history_is_newest_first_and_paginated(client: AsyncClient, token: str) -> None:
    ids = [(await _upload(client, token, filename=f"{i}.jpg"))["id"] for i in range(3)]

    page = (await client.get(IMAGES, headers=bearer(token), params={"limit": 2})).json()
    rest = (
        await client.get(IMAGES, headers=bearer(token), params={"limit": 2, "offset": 2})
    ).json()

    assert page["total"] == 3
    assert [item["id"] for item in page["items"]] == ids[::-1][:2]
    assert [item["id"] for item in rest["items"]] == ids[:1]


async def test_get_one(client: AsyncClient, token: str) -> None:
    created = await _upload(client, token)

    response = await client.get(f"{IMAGES}/{created['id']}", headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["detections"] == created["detections"]


async def test_users_cannot_see_each_others_detections(
    client: AsyncClient, token: str, outbox: list[EmailMessage]
) -> None:
    mine = await _upload(client, token)
    await signup_and_activate(client, outbox, email="other@example.com")
    other_token = await login(client, email="other@example.com")

    listed = (await client.get(IMAGES, headers=bearer(other_token))).json()
    fetched = await client.get(f"{IMAGES}/{mine['id']}", headers=bearer(other_token))
    deleted = await client.delete(f"{IMAGES}/{mine['id']}", headers=bearer(other_token))

    assert listed == {"items": [], "total": 0, "limit": 20, "offset": 0}
    assert fetched.status_code == deleted.status_code == 404
    assert (await client.get(f"{IMAGES}/{mine['id']}", headers=bearer(token))).status_code == 200


async def test_delete_removes_record_and_files(
    client: AsyncClient, token: str, settings: Settings
) -> None:
    created = await _upload(client, token)
    stored = list((settings.storage_dir / "images").rglob("*.*"))
    assert len(stored) == 2

    response = await client.delete(f"{IMAGES}/{created['id']}", headers=bearer(token))

    assert response.status_code == 204
    assert (await client.get(f"{IMAGES}/{created['id']}", headers=bearer(token))).status_code == 404
    assert not any(path.exists() for path in stored)
    assert (await client.get(str(created["original_url"]))).status_code == 404


async def test_files_require_a_valid_signature(client: AsyncClient, token: str) -> None:
    created = await _upload(client, token)
    url = str(created["annotated_url"])
    path = url.split("?")[0]

    unsigned = await client.get(path)
    tampered = await client.get(url[:-4] + "0000")
    other_key = await client.get(url.replace("annotated.jpg", "original.jpg"))

    assert unsigned.status_code == 422  # signature params missing
    assert tampered.status_code == other_key.status_code == 403


async def test_models_not_loaded_returns_503(settings: Settings, client_for: ClientFactory) -> None:
    app = create_app(settings)  # no models injected and loading disabled
    async with client_for(app) as client:
        await signup_and_activate(client, app.state.email_sender.outbox)
        token = await login(client)
        response = await client.post(
            IMAGES, headers=bearer(token), files={"image": ("a.jpg", jpeg_bytes(), "image/jpeg")}
        )

    assert response.status_code == 503
    assert response.json()["code"] == "models_unavailable"
