"""Live detection: the WebSocket stream, session history and server cameras."""

from typing import Annotated

from fastapi import APIRouter, Query, WebSocket, status

from app.api.deps import (
    CameraServiceDep,
    CurrentSuperuser,
    CurrentUser,
    LiveHistoryServiceDep,
)
from app.api.live_socket import serve_live_session
from app.schemas.live import (
    CameraAdmin,
    CameraCreate,
    CameraPublic,
    LiveSessionPage,
    LiveSessionRead,
)

router = APIRouter(prefix="/live", tags=["live detection"])


@router.websocket("/ws")
async def live_socket(websocket: WebSocket) -> None:
    """Live detection stream. The protocol is documented in `app/api/live_socket.py`."""
    await serve_live_session(websocket)


# ------------------------------------------------------------------ cameras


@router.get(
    "/cameras",
    response_model=list[CameraPublic],
    summary="Server cameras available for live detection",
)
async def list_cameras(_: CurrentUser, cameras: CameraServiceDep) -> list[CameraPublic]:
    return [CameraPublic.model_validate(c) for c in await cameras.list(include_disabled=False)]


@router.get(
    "/admin/cameras",
    response_model=list[CameraAdmin],
    summary="All server cameras, with their sources (admin)",
)
async def admin_list_cameras(_: CurrentSuperuser, cameras: CameraServiceDep) -> list[CameraAdmin]:
    return [CameraAdmin.model_validate(c) for c in await cameras.list(include_disabled=True)]


@router.post(
    "/admin/cameras",
    response_model=CameraAdmin,
    status_code=status.HTTP_201_CREATED,
    summary="Register a server camera (admin)",
)
async def admin_create_camera(
    body: CameraCreate, _: CurrentSuperuser, cameras: CameraServiceDep
) -> CameraAdmin:
    camera = await cameras.create(name=body.name, source=body.source, enabled=body.enabled)
    return CameraAdmin.model_validate(camera)


@router.delete(
    "/admin/cameras/{camera_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a server camera (admin)",
)
async def admin_delete_camera(
    camera_id: int, _: CurrentSuperuser, cameras: CameraServiceDep
) -> None:
    await cameras.delete(camera_id)


# ------------------------------------------------------------------ history


@router.get("/sessions", response_model=LiveSessionPage, summary="Your live sessions, newest first")
async def list_sessions(
    user: CurrentUser,
    history: LiveHistoryServiceDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> LiveSessionPage:
    return await history.list(user, limit=limit, offset=offset)


@router.get(
    "/sessions/{session_id}",
    response_model=LiveSessionRead,
    summary="A live session with its report rows (objects and clips)",
)
async def get_session(
    session_id: int, user: CurrentUser, history: LiveHistoryServiceDep
) -> LiveSessionRead:
    return await history.get(user, session_id)


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a finished live session and its clips",
)
async def delete_session(
    session_id: int, user: CurrentUser, history: LiveHistoryServiceDep
) -> None:
    await history.delete(user, session_id)
