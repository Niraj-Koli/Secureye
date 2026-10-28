"""The live-detection WebSocket protocol.

Client → server
    1. JSON  {"type": "start", "token": "<access token>", "source": "browser"}
             or {"type": "start", "token": "...", "source": "camera", "camera_id": 3}
       (the token travels in the first message, not the URL, so it never lands in access logs)
    2. browser source: binary messages, each a JPEG/PNG/WebP frame from the user's camera
    3. JSON  {"type": "stop"} to end the session (or just close the socket)

Server → client (JSON text messages)
    {"type": "ready", "session_id", "source", "model", "confidence", "iou", "target_fps"}
    {"type": "detections", "frame", "width", "height", "inference_ms", "dropped_frames",
     "objects": [{"track_id", "class_name", "confidence", "box": {x1, y1, x2, y2}}]}
    {"type": "new_object", "event_id", "track_id", "class_name", "confidence", "detected_at"}
    {"type": "error", "code", "detail"}            (non-fatal, e.g. an undecodable frame)
    {"type": "ended", "reason"}                    then the socket closes
  camera source only: after each "detections", a binary message with the annotated JPEG.

Browser clients draw boxes on their own video from "detections", so only small JSON travels
back. Only the newest frame is analysed: frames arriving while the model is busy are dropped
(and counted), so a slow server never builds up a growing delay.
"""

import asyncio
import contextlib
import json
import tempfile
import time
from dataclasses import asdict
from datetime import UTC, datetime
from enum import IntEnum
from functools import partial
from pathlib import Path
from typing import Any

import anyio
import structlog
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core import security
from app.core.config import Settings
from app.core.errors import NotFoundError
from app.ml.live import CameraReader, CameraUnavailableError, FinishedClip, LiveProcessor
from app.ml.registry import ModelRegistry
from app.ml.video import encode_preview
from app.models.live import LiveSource
from app.models.user import User
from app.services.images import InvalidImageError, UnsupportedImageTypeError, decode_image
from app.services.live import ActiveSessions, CameraService, LiveSessionRecorder
from app.services.storage import Storage

logger = structlog.get_logger(__name__)


class CloseCode(IntEnum):
    TOO_BIG = 1009
    INTERNAL_ERROR = 1011
    TRY_AGAIN_LATER = 1013
    UNAUTHORIZED = 4401
    FORBIDDEN = 4403
    NOT_FOUND = 4404
    TOO_MANY_SESSIONS = 4409
    BAD_REQUEST = 4400


class _RejectedError(Exception):
    def __init__(self, code: CloseCode, error: str, detail: str) -> None:
        super().__init__(detail)
        self.code, self.error, self.detail = code, error, detail


def is_disconnect(error: BaseException) -> bool:
    """Whether `error` only says the client went away.

    Sends that fail inside an anyio task group arrive wrapped in an ExceptionGroup, so a closed
    tab looked like a crash; a group counts when every error in it is a disconnect.
    """
    if isinstance(error, WebSocketDisconnect):
        return True
    if isinstance(error, BaseExceptionGroup):
        return all(is_disconnect(inner) for inner in error.exceptions)
    return False


def _origin_allowed(websocket: WebSocket, settings: Settings) -> bool:
    """Browsers always send Origin on WebSocket handshakes, and CORS doesn't apply to them."""
    origin = websocket.headers.get("origin")
    return origin is None or origin in settings.cors_origins


async def serve_live_session(websocket: WebSocket) -> None:
    app = websocket.app
    settings: Settings = app.state.settings
    if not _origin_allowed(websocket, settings):
        await websocket.close(code=CloseCode.FORBIDDEN, reason="Origin not allowed")
        return
    await websocket.accept()

    active: ActiveSessions = app.state.live_sessions
    try:
        user, source, camera_source, camera_id = await _handshake(websocket, settings)
    except _RejectedError as reject:
        await _send_error_and_close(websocket, reject)
        return
    models: ModelRegistry | None = getattr(app.state, "models", None)
    if models is None:
        await _send_error_and_close(
            websocket,
            _RejectedError(
                CloseCode.TRY_AGAIN_LATER, "models_unavailable", "Models are not loaded."
            ),
        )
        return
    if not active.try_acquire(user.id):
        await _send_error_and_close(
            websocket,
            _RejectedError(
                CloseCode.TOO_MANY_SESSIONS,
                "too_many_sessions",
                f"At most {settings.live_max_sessions_per_user} live sessions at a time.",
            ),
        )
        return

    try:
        runner = _LiveSessionRunner(
            websocket,
            user=user,
            source=source,
            camera_id=camera_id,
            camera_source=camera_source,
            models=models,
            storage=app.state.storage,
            recorder=LiveSessionRecorder(app.state.session_factory),
            settings=settings,
        )
        await runner.run()
    finally:
        active.release(user.id)


async def _handshake(
    websocket: WebSocket, settings: Settings
) -> tuple[User, LiveSource, str | None, int | None]:
    try:
        with anyio.fail_after(settings.live_auth_timeout_seconds):
            message = await websocket.receive_json()
    except TimeoutError as exc:
        raise _RejectedError(
            CloseCode.UNAUTHORIZED, "auth_timeout", "Send the start message first."
        ) from exc
    except (ValueError, KeyError, WebSocketDisconnect) as exc:  # not JSON / binary first
        raise _RejectedError(
            CloseCode.BAD_REQUEST, "bad_request", "Expected a JSON start message."
        ) from exc

    if not isinstance(message, dict) or message.get("type") != "start":
        raise _RejectedError(CloseCode.BAD_REQUEST, "bad_request", "Expected a start message.")
    try:
        user_id = security.decode_access_token(
            str(message.get("token", "")), secret=settings.secret_key.get_secret_value()
        )
    except security.InvalidTokenError as exc:
        raise _RejectedError(
            CloseCode.UNAUTHORIZED, "not_authenticated", "Invalid or expired token."
        ) from exc

    async with websocket.app.state.session_factory() as db:
        user = await db.get(User, user_id)
        if user is None or not user.is_active:
            raise _RejectedError(
                CloseCode.UNAUTHORIZED, "not_authenticated", "Invalid or expired token."
            )

        source = message.get("source", LiveSource.BROWSER)
        if source == LiveSource.BROWSER:
            return user, LiveSource.BROWSER, None, None
        if source != LiveSource.CAMERA:
            raise _RejectedError(
                CloseCode.BAD_REQUEST, "bad_request", "source must be browser or camera."
            )
        camera_id = message.get("camera_id")
        if not isinstance(camera_id, int):
            raise _RejectedError(CloseCode.BAD_REQUEST, "bad_request", "camera_id is required.")
        try:
            camera = await CameraService(db).get_enabled(camera_id)
        except NotFoundError as exc:
            raise _RejectedError(CloseCode.NOT_FOUND, "not_found", "Camera not found.") from exc
        return user, LiveSource.CAMERA, camera.source, camera.id


async def _send_error_and_close(websocket: WebSocket, reject: _RejectedError) -> None:
    with contextlib.suppress(Exception):  # the client may already be gone
        await websocket.send_json({"type": "error", "code": reject.error, "detail": reject.detail})
        await websocket.close(code=reject.code, reason=reject.error)


class _LiveSessionRunner:
    def __init__(
        self,
        websocket: WebSocket,
        *,
        user: User,
        source: LiveSource,
        camera_id: int | None,
        camera_source: str | None,
        models: ModelRegistry,
        storage: Storage,
        recorder: LiveSessionRecorder,
        settings: Settings,
    ) -> None:
        self._ws = websocket
        self._user = user
        self._source = source
        self._camera_id = camera_id
        self._camera_source = camera_source
        self._models = models
        self._storage = storage
        self._recorder = recorder
        self._settings = settings
        self._session_id = 0
        self._clip_prefix = ""
        self._stop = asyncio.Event()
        self._reason = "client_stopped"
        self._latest_frame: bytes | None = None
        self._frame_ready = asyncio.Event()
        self._received = 0
        self._dropped = 0
        self._log = logger.bind(user_id=user.id, source=source)

    # ------------------------------------------------------------------ lifecycle

    async def run(self) -> None:
        s = self._settings
        detector = self._models.live
        self._session_id = await self._recorder.start(
            self._user.id,
            source=self._source,
            camera_id=self._camera_id,
            model=detector.name,
            confidence=s.live_confidence,
            iou=s.live_iou,
        )
        self._clip_prefix = f"live/{self._user.id}/{self._session_id}"
        self._log = self._log.bind(session_id=self._session_id)

        with tempfile.TemporaryDirectory(prefix="secureye-live-") as tmp:
            processor = LiveProcessor(
                detector,
                confidence=s.live_confidence,
                iou=s.live_iou,
                clips_dir=Path(tmp),
                fps=s.live_target_fps,
            )
            await self._send(
                {
                    "type": "ready",
                    "session_id": self._session_id,
                    "source": self._source,
                    "model": detector.name,
                    "confidence": s.live_confidence,
                    "iou": s.live_iou,
                    "target_fps": s.live_target_fps,
                }
            )
            self._log.info("live_session_started")
            try:
                with anyio.move_on_after(s.live_max_session_minutes * 60) as limit:
                    if self._source is LiveSource.BROWSER:
                        await self._run_browser(processor)
                    else:
                        await self._run_camera(processor)
                if limit.cancelled_caught:
                    self._reason = "time_limit"
            except Exception as error:
                if is_disconnect(error):
                    self._reason = "disconnected"
                else:
                    self._log.exception("live_session_crashed")
                    self._reason = "error"
            finally:
                # Finish bookkeeping even if the server is shutting down (shielded).
                with anyio.CancelScope(shield=True):
                    await self._finish(processor)

    async def _finish(self, processor: LiveProcessor) -> None:
        try:
            clips = await anyio.to_thread.run_sync(processor.finish)
            await self._store_clips(clips)
        finally:
            await self._recorder.finish(
                self._session_id, reason=self._reason, frames_processed=processor.frames_processed
            )
            self._log.info(
                "live_session_ended",
                reason=self._reason,
                frames=processor.frames_processed,
                dropped=self._dropped,
            )
            if self._ws.client_state is WebSocketState.CONNECTED:
                with contextlib.suppress(Exception):
                    await self._ws.send_json({"type": "ended", "reason": self._reason})
                    await self._ws.close()

    # ------------------------------------------------------------------ browser source

    async def _run_browser(self, processor: LiveProcessor) -> None:
        async with anyio.create_task_group() as tg:
            tg.start_soon(self._receive_browser_frames)
            await self._process_browser_frames(processor)
            tg.cancel_scope.cancel()

    async def _receive_browser_frames(self) -> None:
        try:
            while not self._stop.is_set():
                message = await self._ws.receive()
                if message["type"] == "websocket.disconnect":
                    self._end("disconnected")
                    return
                if (data := message.get("bytes")) is not None:
                    if len(data) > self._settings.live_max_frame_bytes:
                        await self._send_error("frame_too_large", "Frames must be at most 2 MB.")
                        continue
                    if self._latest_frame is not None:
                        self._dropped += 1  # the previous frame was never analysed
                    self._latest_frame = data
                    self._received += 1
                    self._frame_ready.set()
                elif self._is_stop(message.get("text")):
                    self._end("client_stopped")
                    return
        except WebSocketDisconnect:
            self._end("disconnected")

    async def _process_browser_frames(self, processor: LiveProcessor) -> None:
        while True:
            await self._wait_for_frame_or_stop()
            if self._stop.is_set():
                return
            data, self._latest_frame = self._latest_frame, None
            self._frame_ready.clear()
            if data is None:
                continue
            try:
                decoded = await anyio.to_thread.run_sync(
                    partial(decode_image, data, max_pixels=self._settings.live_max_frame_pixels)
                )
            except (InvalidImageError, UnsupportedImageTypeError) as exc:
                await self._send_error("invalid_frame", exc.detail)
                continue
            await self._analyse(processor, decoded.bgr, send_preview=False)

    async def _wait_for_frame_or_stop(self) -> None:
        stop = asyncio.ensure_future(self._stop.wait())
        frame = asyncio.ensure_future(self._frame_ready.wait())
        try:
            await asyncio.wait({stop, frame}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in (stop, frame):
                task.cancel()

    # ------------------------------------------------------------------ camera source

    async def _run_camera(self, processor: LiveProcessor) -> None:
        if self._camera_source is None:  # guaranteed by the handshake for camera sessions
            raise RuntimeError("Camera session without a camera source.")
        try:
            camera = await anyio.to_thread.run_sync(CameraReader, self._camera_source)
        except CameraUnavailableError:
            await self._send_error("camera_unavailable", "The camera could not be opened.")
            self._reason = "camera_unavailable"
            return
        try:
            async with anyio.create_task_group() as tg:
                tg.start_soon(self._receive_control_messages)
                await self._process_camera_frames(processor, camera)
                tg.cancel_scope.cancel()
        finally:
            await anyio.to_thread.run_sync(camera.close)

    async def _receive_control_messages(self) -> None:
        try:
            while not self._stop.is_set():
                message = await self._ws.receive()
                if message["type"] == "websocket.disconnect":
                    self._end("disconnected")
                    return
                if self._is_stop(message.get("text")):
                    self._end("client_stopped")
                    return
        except WebSocketDisconnect:
            self._end("disconnected")

    async def _process_camera_frames(self, processor: LiveProcessor, camera: CameraReader) -> None:
        interval = 1 / self._settings.live_target_fps
        sequence = 0
        while not self._stop.is_set():
            started = time.monotonic()
            latest = camera.latest(sequence)
            if latest is None:
                if camera.ended.is_set():
                    self._end("source_ended")
                    return
                await asyncio.sleep(0.01)
                continue
            new_sequence, frame = latest
            self._dropped += max(0, new_sequence - sequence - 1)
            sequence = new_sequence
            await self._analyse(processor, frame, send_preview=True)
            await asyncio.sleep(max(0.0, interval - (time.monotonic() - started)))

    # ------------------------------------------------------------------ shared

    async def _analyse(self, processor: LiveProcessor, image: Any, *, send_preview: bool) -> None:
        now = datetime.now(UTC)
        result = await anyio.to_thread.run_sync(
            partial(processor.process, image, now), limiter=self._models.limiter
        )
        height, width = image.shape[:2]
        await self._send(
            {
                "type": "detections",
                "frame": processor.frames_processed,
                "width": width,
                "height": height,
                "inference_ms": round(result.inference_ms, 1),
                "dropped_frames": self._dropped,
                "objects": [
                    {
                        "track_id": o.track_id,
                        "class_name": o.detection.class_name,
                        "confidence": o.detection.confidence,
                        "box": asdict(o.detection.box),
                    }
                    for o in result.tracked
                ],
            }
        )
        if send_preview:
            preview = encode_preview(
                result.annotated,
                max_width=self._settings.video_preview_max_width,
                quality=self._settings.video_preview_jpeg_quality,
            )
            await self._ws.send_bytes(preview)
        if result.new_objects:
            event_ids = await self._recorder.add_events(self._session_id, result.new_objects)
            for event_id, obj in zip(event_ids, result.new_objects, strict=True):
                await self._send(
                    {
                        "type": "new_object",
                        "event_id": event_id,
                        "track_id": obj.track_id,
                        "class_name": obj.class_name,
                        "confidence": obj.confidence,
                        "detected_at": obj.detected_at.isoformat(),
                    }
                )
        await self._store_clips(result.finished_clips)

    async def _store_clips(self, clips: list[FinishedClip]) -> None:
        for clip in clips:
            key = f"{self._clip_prefix}/{clip.relative_name}"
            await self._storage.save(key, await anyio.Path(clip.path).read_bytes())
            await anyio.Path(clip.path).unlink(missing_ok=True)
            await self._recorder.attach_clip(self._session_id, clip.track_id, key)

    def _end(self, reason: str) -> None:
        if not self._stop.is_set():
            self._reason = reason
            self._stop.set()

    @staticmethod
    def _is_stop(text: str | None) -> bool:
        if not text:
            return False
        try:
            return bool(json.loads(text).get("type") == "stop")
        except (ValueError, AttributeError):
            return False

    async def _send(self, payload: dict[str, Any]) -> None:
        await self._ws.send_json(payload)

    async def _send_error(self, code: str, detail: str) -> None:
        await self._send({"type": "error", "code": code, "detail": detail})
