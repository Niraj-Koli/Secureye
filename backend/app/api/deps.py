"""Shared FastAPI dependencies: settings, services, current user."""

from types import MappingProxyType
from typing import Annotated

from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core import security
from app.core.config import Settings
from app.core.errors import AppError
from app.db.session import SessionDep
from app.ml.registry import ModelRegistry
from app.models.user import User
from app.services.auth import AuthService
from app.services.email import EmailSender
from app.services.image_detection import ImageDetectionService
from app.services.job_events import JobEvents
from app.services.job_queue import JobQueue
from app.services.live import CameraService, LiveHistoryService
from app.services.storage import FileSigner, Storage
from app.services.video_jobs import VideoJobService


class NotAuthenticatedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "not_authenticated"
    headers = MappingProxyType({"WWW-Authenticate": "Bearer"})


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


def get_email_sender(request: Request) -> EmailSender:
    sender: EmailSender = request.app.state.email_sender
    return sender


EmailSenderDep = Annotated[EmailSender, Depends(get_email_sender)]


def get_auth_service(db: SessionDep, settings: SettingsDep) -> AuthService:
    return AuthService(db, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]

# auto_error=False so a missing header yields our JSON error shape instead of FastAPI's 403.
_bearer = HTTPBearer(auto_error=False, description="Access token from POST /auth/login.")


async def get_current_user(
    db: SessionDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise NotAuthenticatedError("Authentication required.")
    try:
        user_id = security.decode_access_token(
            credentials.credentials, secret=settings.secret_key.get_secret_value()
        )
    except security.InvalidTokenError as exc:
        raise NotAuthenticatedError("Invalid or expired access token.") from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise NotAuthenticatedError("Invalid or expired access token.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


class ModelsUnavailableError(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "models_unavailable"


def get_storage(request: Request) -> Storage:
    storage: Storage = request.app.state.storage
    return storage


StorageDep = Annotated[Storage, Depends(get_storage)]


def get_file_signer(request: Request) -> FileSigner:
    signer: FileSigner = request.app.state.file_signer
    return signer


FileSignerDep = Annotated[FileSigner, Depends(get_file_signer)]


def get_models(request: Request) -> ModelRegistry:
    models: ModelRegistry | None = getattr(request.app.state, "models", None)
    if models is None:
        raise ModelsUnavailableError("Detection models are not loaded.")
    return models


ModelsDep = Annotated[ModelRegistry, Depends(get_models)]


def get_image_detection_service(
    db: SessionDep,
    storage: StorageDep,
    signer: FileSignerDep,
    models: ModelsDep,
    settings: SettingsDep,
) -> ImageDetectionService:
    return ImageDetectionService(db, storage, signer, models, settings)


ImageDetectionServiceDep = Annotated[ImageDetectionService, Depends(get_image_detection_service)]


def get_job_events(request: Request) -> JobEvents:
    events: JobEvents = request.app.state.job_events
    return events


JobEventsDep = Annotated[JobEvents, Depends(get_job_events)]


def get_job_queue(request: Request) -> JobQueue:
    queue: JobQueue | None = getattr(request.app.state, "job_queue", None)
    if queue is None:
        raise ModelsUnavailableError("Video processing is not available.")
    return queue


def get_video_job_service(
    db: SessionDep,
    storage: StorageDep,
    signer: FileSignerDep,
    queue: Annotated[JobQueue, Depends(get_job_queue)],
    events: JobEventsDep,
    settings: SettingsDep,
) -> VideoJobService:
    model_name = settings.models_dir.joinpath(settings.image_model_file).stem
    return VideoJobService(db, storage, signer, queue, events, settings, model_name)


VideoJobServiceDep = Annotated[VideoJobService, Depends(get_video_job_service)]


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


async def get_current_superuser(user: CurrentUser) -> User:
    if not user.is_superuser:
        raise ForbiddenError("Administrator access required.")
    return user


CurrentSuperuser = Annotated[User, Depends(get_current_superuser)]


def get_live_history_service(
    db: SessionDep, storage: StorageDep, signer: FileSignerDep
) -> LiveHistoryService:
    return LiveHistoryService(db, storage, signer)


LiveHistoryServiceDep = Annotated[LiveHistoryService, Depends(get_live_history_service)]


def get_camera_service(db: SessionDep) -> CameraService:
    return CameraService(db)


CameraServiceDep = Annotated[CameraService, Depends(get_camera_service)]
