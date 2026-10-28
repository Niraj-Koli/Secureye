"""Live detection over WebSocket (Starlette's TestClient: httpx has no WebSocket support)."""

import json
import re
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi import FastAPI
from sqlalchemy import update
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.api.live_socket import is_disconnect
from app.core.config import Settings
from app.main import create_app
from app.ml.detector import ImageBGR, Prediction
from app.ml.registry import ModelRegistry
from app.models.user import User
from tests.fakes import BlobDetector, FakeDetector, make_test_video

WS = "/api/v1/live/ws"
PASSWORD = "Gr4nite-Falcon!"


def _frame_jpeg(x: int, *, squares: int = 1) -> bytes:
    image = np.full((240, 320, 3), 30, dtype=np.uint8)
    for row in range(squares):
        image[20 + row * 70 : 60 + row * 70, x : x + 40] = 255
    ok, buffer = cv2.imencode(".jpg", image)
    assert ok
    return buffer.tobytes()


def _live_app(settings: Settings, **overrides: Any) -> FastAPI:
    app = create_app(settings.model_copy(update=overrides))
    app.state.models = ModelRegistry(image=FakeDetector(), live=BlobDetector())
    return app


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return _live_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, base_url="http://test") as client:
        yield client


def _sign_in(client: TestClient, email: str = "live@example.com") -> str:
    app: Any = client.app
    client.post(
        "/api/v1/auth/signup", json={"name": "Live User", "email": email, "password": PASSWORD}
    )
    uid, token = re.search(  # type: ignore[union-attr]
        r"/activate/([^/\s]+)/(\S+)", app.state.email_sender.outbox[-1].text
    ).groups()
    assert (
        client.post("/api/v1/auth/activate", json={"uid": uid, "token": token}).status_code == 204
    )
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    access: str = response.json()["access_token"]
    return access


def _make_superuser(client: TestClient, email: str) -> None:
    app: Any = client.app

    async def promote() -> None:
        async with app.state.session_factory() as db:
            await db.execute(update(User).where(User.email == email).values(is_superuser=True))
            await db.commit()

    assert client.portal is not None
    client.portal.call(promote)


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _receive_until(ws: Any, kind: str) -> list[dict[str, Any]]:
    """Collect JSON messages up to and including the first one of type `kind`."""
    messages = []
    while True:
        message = ws.receive_json()
        messages.append(message)
        if message["type"] == kind:
            return messages


def _wait_ended(client: TestClient, token: str, session_id: int) -> dict[str, Any]:
    for _ in range(200):
        session: dict[str, Any] = client.get(
            f"/api/v1/live/sessions/{session_id}", headers=_headers(token)
        ).json()
        if session["ended_at"]:
            return session
        time.sleep(0.02)
    raise AssertionError("session never ended")


# ------------------------------------------------------------------ browser source


def test_browser_session_end_to_end(client: TestClient) -> None:
    token = _sign_in(client)

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token, "source": "browser"})
        ready = ws.receive_json()
        replies = []
        for i in range(5):  # stop-and-wait: send a frame, read the analysis
            ws.send_bytes(_frame_jpeg(10 + 4 * i))
            replies.append(_receive_until(ws, "detections"))
            if i == 0:
                new_object = ws.receive_json()
        ws.send_json({"type": "stop"})
        ended = ws.receive_json()

    assert ready == {
        "type": "ready",
        "session_id": ready["session_id"],
        "source": "browser",
        "model": "blob-detector",
        "confidence": 0.4,
        "iou": 0.45,
        "target_fps": 10.0,
    }
    detections = [r[-1] for r in replies]
    assert [d["frame"] for d in detections] == [1, 2, 3, 4, 5]
    assert all((d["width"], d["height"]) == (320, 240) for d in detections)
    assert [[o["track_id"] for o in d["objects"]] for d in detections] == [[1]] * 5
    box = detections[0]["objects"][0]["box"]
    assert (box["x1"], box["y1"]) == pytest.approx((10, 20), abs=1)
    # first sighting -> one alert / report row
    assert new_object["type"] == "new_object"
    assert (new_object["track_id"], new_object["class_name"]) == (1, "Soldier")
    assert ended == {"type": "ended", "reason": "client_stopped"}

    session = _wait_ended(client, token, ready["session_id"])
    assert (session["source"], session["frames_processed"], session["end_reason"]) == (
        "browser",
        5,
        "client_stopped",
    )
    assert [(e["track_id"], e["class_name"]) for e in session["events"]] == [(1, "Soldier")]
    assert session["events"][0]["id"] == new_object["event_id"]
    clip = client.get(session["events"][0]["clip_url"])
    assert clip.status_code == 200
    assert clip.headers["content-type"] == "video/mp4"


def test_disconnect_without_stop_still_saves_the_session(client: TestClient) -> None:
    token = _sign_in(client)

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token, "source": "browser"})
        session_id = ws.receive_json()["session_id"]
        for i in range(3):
            ws.send_bytes(_frame_jpeg(10 + 4 * i))
            _receive_until(ws, "detections")

    session = _wait_ended(client, token, session_id)
    assert session["end_reason"] == "disconnected"
    assert session["frames_processed"] == 3
    assert session["events"][0]["clip_url"] is not None


def test_bad_frames_are_reported_but_do_not_end_the_session(client: TestClient) -> None:
    token = _sign_in(client)

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token, "source": "browser"})
        ws.receive_json()
        ws.send_bytes(b"not an image")
        error = ws.receive_json()
        ws.send_bytes(_frame_jpeg(10))
        detections = _receive_until(ws, "detections")[-1]

    assert error == {
        "type": "error",
        "code": "invalid_frame",
        "detail": "The file is not a valid image.",
    }
    assert detections["frame"] == 1


# ------------------------------------------------------------------ handshake & limits


def _expect_close(client: TestClient, first: Any, code: int, error: str) -> None:
    with client.websocket_connect(WS) as ws:
        if isinstance(first, bytes):
            ws.send_bytes(first)
        elif first is not None:
            ws.send_json(first)
        message = ws.receive_json()
        assert message["type"] == "error"
        assert message["code"] == error
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == code


def test_invalid_or_missing_token_is_rejected(client: TestClient) -> None:
    _expect_close(client, {"type": "start", "token": "garbage"}, 4401, "not_authenticated")
    _expect_close(client, {"type": "start"}, 4401, "not_authenticated")


def test_first_message_must_be_a_start_message(client: TestClient) -> None:
    _expect_close(client, b"\xff\xd8 binary first", 4400, "bad_request")
    _expect_close(client, {"type": "hello"}, 4400, "bad_request")


def test_authentication_must_happen_quickly(settings: Settings) -> None:
    app = _live_app(settings, live_auth_timeout_seconds=0.2)
    with TestClient(app, base_url="http://test") as client:
        _expect_close(client, None, 4401, "auth_timeout")


def test_unknown_source_or_camera_is_rejected(client: TestClient) -> None:
    token = _sign_in(client)

    _expect_close(
        client, {"type": "start", "token": token, "source": "satellite"}, 4400, "bad_request"
    )
    _expect_close(
        client, {"type": "start", "token": token, "source": "camera"}, 4400, "bad_request"
    )
    _expect_close(
        client,
        {"type": "start", "token": token, "source": "camera", "camera_id": 999},
        4404,
        "not_found",
    )


def test_sessions_per_user_are_limited(settings: Settings) -> None:
    app = _live_app(settings, live_max_sessions_per_user=1)
    with TestClient(app, base_url="http://test") as client:
        token = _sign_in(client)
        with client.websocket_connect(WS) as first:
            first.send_json({"type": "start", "token": token, "source": "browser"})
            first.receive_json()
            _expect_close(client, {"type": "start", "token": token}, 4409, "too_many_sessions")
        # once the first session ends, a new one is allowed
        with client.websocket_connect(WS) as again:
            again.send_json({"type": "start", "token": token})
            assert again.receive_json()["type"] == "ready"


def test_foreign_origins_are_refused(client: TestClient) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as refused,
        client.websocket_connect(WS, headers={"Origin": "https://evil.example"}) as ws,
    ):
        ws.receive_json()

    assert refused.value.code == 4403


# ------------------------------------------------------------------ server cameras


def test_camera_admin_and_camera_session(client: TestClient, tmp_path: Path) -> None:
    token = _sign_in(client)
    admin = _sign_in(client, email="admin@example.com")
    video = make_test_video(tmp_path / "cam.mp4", seconds=1.5, squares=((0.0, 1.5),))
    camera = {"name": "Gate", "source": str(video)}

    forbidden = client.post("/api/v1/live/admin/cameras", json=camera, headers=_headers(token))
    _make_superuser(client, "admin@example.com")
    created = client.post("/api/v1/live/admin/cameras", json=camera, headers=_headers(admin))
    duplicate = client.post("/api/v1/live/admin/cameras", json=camera, headers=_headers(admin))
    public = client.get("/api/v1/live/cameras", headers=_headers(token)).json()

    assert forbidden.status_code == 403
    assert created.status_code == 201
    assert duplicate.status_code == 409
    camera_id = created.json()["id"]
    assert public == [{"id": camera_id, "name": "Gate"}]  # the source stays admin-only

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token, "source": "camera", "camera_id": camera_id})
        ready = ws.receive_json()
        detections, previews, new_objects = 0, 0, 0
        while True:
            message = ws.receive()
            if message.get("bytes") is not None:
                assert message["bytes"][:3] == b"\xff\xd8\xff"  # annotated JPEG preview
                previews += 1
                continue
            payload = json.loads(message["text"])
            if payload["type"] == "detections":
                detections += 1
            elif payload["type"] == "new_object":
                new_objects += 1
            elif payload["type"] == "ended":
                ended = payload
                break

    assert ready["source"] == "camera"
    assert ended == {"type": "ended", "reason": "source_ended"}
    assert detections == previews > 5  # ~10 fps over a 1.5 s source
    assert new_objects == 1
    session = _wait_ended(client, token, ready["session_id"])
    assert (session["camera_id"], session["source"]) == (camera_id, "camera")


def test_leaving_a_camera_session_saves_it_as_disconnected(
    client: TestClient, tmp_path: Path
) -> None:
    token = _sign_in(client)
    admin = _sign_in(client, email="admin@example.com")
    _make_superuser(client, "admin@example.com")
    video = make_test_video(tmp_path / "cam.mp4", seconds=3, squares=((0.0, 3.0),))
    camera_id = client.post(
        "/api/v1/live/admin/cameras",
        json={"name": "Gate", "source": str(video)},
        headers=_headers(admin),
    ).json()["id"]

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token, "source": "camera", "camera_id": camera_id})
        session_id = ws.receive_json()["session_id"]
        _receive_until(ws, "detections")
        # The browser goes away mid-stream (tab closed): no stop message.

    session = _wait_ended(client, token, session_id)
    assert session["end_reason"] == "disconnected"


def test_a_disconnect_inside_a_task_group_counts_as_a_disconnect() -> None:
    # anyio task groups wrap errors in an ExceptionGroup; a send to a closed socket then
    # arrives as ExceptionGroup([WebSocketDisconnect]) and was logged as a crash.
    grouped = BaseExceptionGroup("unhandled errors in a TaskGroup", [WebSocketDisconnect(1006)])
    nested = BaseExceptionGroup("outer", [grouped])
    mixed = BaseExceptionGroup("mixed", [WebSocketDisconnect(1006), ValueError("boom")])

    assert is_disconnect(WebSocketDisconnect(1006))
    assert is_disconnect(grouped)
    assert is_disconnect(nested)
    assert not is_disconnect(mixed)  # a real error alongside it is still a crash
    assert not is_disconnect(ValueError("boom"))


def test_unopenable_camera_ends_the_session_cleanly(client: TestClient, tmp_path: Path) -> None:
    token = _sign_in(client)
    admin = _sign_in(client, email="admin@example.com")
    _make_superuser(client, "admin@example.com")
    camera_id = client.post(
        "/api/v1/live/admin/cameras",
        json={"name": "Broken", "source": str(tmp_path / "missing.mp4")},
        headers=_headers(admin),
    ).json()["id"]

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token, "source": "camera", "camera_id": camera_id})
        ws.receive_json()
        error, ended = ws.receive_json(), ws.receive_json()

    assert error["code"] == "camera_unavailable"
    assert ended == {"type": "ended", "reason": "camera_unavailable"}


def test_disabled_cameras_are_hidden_and_unusable(client: TestClient) -> None:
    token = _sign_in(client)
    admin = _sign_in(client, email="admin@example.com")
    _make_superuser(client, "admin@example.com")
    camera_id = client.post(
        "/api/v1/live/admin/cameras",
        json={"name": "Off", "source": "0", "enabled": False},
        headers=_headers(admin),
    ).json()["id"]

    assert client.get("/api/v1/live/cameras", headers=_headers(token)).json() == []
    assert len(client.get("/api/v1/live/admin/cameras", headers=_headers(admin)).json()) == 1
    _expect_close(
        client,
        {"type": "start", "token": token, "source": "camera", "camera_id": camera_id},
        4404,
        "not_found",
    )


# ------------------------------------------------------------------ history


def test_history_ownership_and_delete(client: TestClient) -> None:
    token = _sign_in(client)
    other = _sign_in(client, email="other@example.com")

    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "start", "token": token})
        session_id = ws.receive_json()["session_id"]
        for i in range(3):
            ws.send_bytes(_frame_jpeg(10 + 4 * i))
            _receive_until(ws, "detections")
        while_active = client.delete(f"/api/v1/live/sessions/{session_id}", headers=_headers(token))
        ws.send_json({"type": "stop"})
        _receive_until(ws, "ended")
    session = _wait_ended(client, token, session_id)
    clip_url = session["events"][0]["clip_url"]

    listed = client.get("/api/v1/live/sessions", headers=_headers(token)).json()
    strangers = client.get(f"/api/v1/live/sessions/{session_id}", headers=_headers(other))
    deleted = client.delete(f"/api/v1/live/sessions/{session_id}", headers=_headers(token))

    assert while_active.status_code == 409
    assert [s["id"] for s in listed["items"]] == [session_id]
    assert listed["items"][0]["events"] is None
    assert strangers.status_code == 404
    assert deleted.status_code == 204
    assert client.get(clip_url).status_code == 404  # clip file removed


class _SlowDetector(BlobDetector):
    def predict(
        self, image: ImageBGR, *, confidence: float, iou: float, agnostic_nms: bool = False
    ) -> Prediction:
        time.sleep(0.3)
        return super().predict(image, confidence=confidence, iou=iou)


def test_only_the_newest_frame_is_analysed(settings: Settings) -> None:
    """A slow model must not build up a backlog: stale frames are dropped and counted."""
    app = create_app(settings)
    app.state.models = ModelRegistry(image=FakeDetector(), live=_SlowDetector())
    with TestClient(app, base_url="http://test") as client:
        token = _sign_in(client)
        with client.websocket_connect(WS) as ws:
            ws.send_json({"type": "start", "token": token})
            ws.receive_json()
            for i in range(6):  # all sent while the first one is still being analysed
                ws.send_bytes(_frame_jpeg(10 + 4 * i))
            first = _receive_until(ws, "detections")[-1]
            second = _receive_until(ws, "detections")[-1]
            ws.send_json({"type": "stop"})
            ended = _receive_until(ws, "ended")[-1]

    assert first["frame"] == 1
    assert second["frame"] == 2  # the next analysis already used the newest frame...
    assert second["dropped_frames"] >= 3  # ...after skipping the stale ones
    assert ended["reason"] == "client_stopped"
