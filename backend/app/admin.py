"""Superuser-only admin site at /admin (replaces the original Django admin).

Browse users, detections, video jobs, live sessions and cameras. Detections, jobs and sessions
are read-only here: deleting them must also delete their stored files, which the API does
(`DELETE /images/{id}` and friends). Users can be edited (activate, deactivate, change roles) but
not created (use `python -m app.cli create-superuser`) or deleted (deactivate them instead, so
their stored files aren't orphaned).
"""

import hashlib
from typing import Any, ClassVar

from fastapi import FastAPI
from limits import parse
from markupsafe import Markup, escape
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.middleware import Middleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request

from app.core.config import Settings
from app.core.rate_limit import RateLimiter, RateLimitExceededError
from app.models.image_detection import ImageDetection
from app.models.live import Camera, LiveEvent, LiveSession
from app.models.user import User
from app.models.video import VideoJob, VideoTrack
from app.services.auth import AuthService, InvalidCredentialsError
from app.services.storage import FileSigner

ADMIN_PATH = "/admin"
_LOGIN_LIMIT = parse("5/minute")
_SESSION_HOURS = 8


def _admin_stamp(user: User) -> str:
    """Changes when the password or admin rights change, which ends existing admin sessions."""
    raw = f"{user.id}:{user.password_hash}:{user.is_superuser}:{user.is_active}"
    return hashlib.sha256(raw.encode()).hexdigest()


class SuperuserAuth(AuthenticationBackend):
    """Email + password login for superusers, kept in a signed, /admin-only session cookie."""

    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        rate_limiter: RateLimiter,
    ) -> None:
        super().__init__(secret_key=settings.secret_key.get_secret_value())
        self.middlewares = [
            Middleware(
                SessionMiddleware,
                secret_key=settings.secret_key.get_secret_value(),
                session_cookie="secureye_admin",
                max_age=_SESSION_HOURS * 3600,
                path=ADMIN_PATH,
                same_site="strict",
                https_only=settings.use_secure_cookies,
            )
        ]
        self._settings = settings
        self._session_factory = session_factory
        self._rate_limiter = rate_limiter

    async def login(self, request: Request) -> bool:
        form = await request.form()
        email, password = form.get("username"), form.get("password")
        if not isinstance(email, str) or not isinstance(password, str):
            return False
        client_ip = request.client.host if request.client else "unknown"
        try:
            await self._rate_limiter.check(_LOGIN_LIMIT, "admin_login", client_ip)
        except RateLimitExceededError:
            return False
        async with self._session_factory() as db:
            try:
                user = await AuthService(db, self._settings).authenticate(email, password)
            except InvalidCredentialsError:
                return False
            if not user.is_superuser:
                return False
            request.session.update({"admin_user": user.id, "stamp": _admin_stamp(user)})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        # Checked on every request, so revoking admin rights or deactivating takes effect at once.
        user_id = request.session.get("admin_user")
        if not isinstance(user_id, int):
            return False
        async with self._session_factory() as db:
            user = await db.get(User, user_id)
        if user is None or not (user.is_active and user.is_superuser):
            request.session.clear()
            return False
        if request.session.get("stamp") != _admin_stamp(user):
            request.session.clear()
            return False
        return True


class _ReadOnlyView(ModelView):
    can_create = False
    can_edit = False
    can_delete = False
    can_export = True
    page_size = 50


class _FileLinks:
    """Column formatters that turn stored file keys into signed links."""

    signer: ClassVar[FileSigner | None] = None

    @classmethod
    def link(cls, key: str | None, label: str = "open") -> Markup | str:
        if not key or cls.signer is None:
            return "—"
        return Markup('<a href="{}" target="_blank" rel="noopener">{}</a>').format(
            cls.signer.url(key), escape(label)
        )


def _file(attribute: str) -> Any:
    return lambda model, _name: _FileLinks.link(getattr(model, attribute))


class UserAdmin(ModelView, model=User):
    name_plural = "Users"
    icon = "fa-solid fa-user"
    can_create = False
    can_delete = False
    column_list = [
        User.id,
        User.email,
        User.name,
        User.is_active,
        User.is_staff,
        User.is_superuser,
        User.last_login,
        User.created_at,
    ]
    column_searchable_list = [User.email, User.name]
    column_sortable_list = [User.id, User.email, User.created_at, User.last_login]
    column_default_sort = (User.id, True)
    column_details_exclude_list = [User.password_hash]
    form_columns = [User.name, User.is_active, User.is_staff, User.is_superuser]


class ImageDetectionAdmin(_ReadOnlyView, model=ImageDetection):
    name_plural = "Image detections"
    icon = "fa-solid fa-image"
    column_list = [
        ImageDetection.id,
        ImageDetection.user_id,
        ImageDetection.original_filename,
        "objects",
        ImageDetection.inference_ms,
        ImageDetection.created_at,
        ImageDetection.annotated_key,
    ]
    column_labels = {ImageDetection.annotated_key: "annotated image"}
    column_searchable_list = [ImageDetection.original_filename]
    column_sortable_list = [ImageDetection.id, ImageDetection.created_at, ImageDetection.user_id]
    column_default_sort = (ImageDetection.id, True)
    column_formatters = {
        "objects": lambda model, _name: len(model.detections),
        ImageDetection.annotated_key: _file("annotated_key"),
    }
    column_formatters_detail = {
        ImageDetection.original_key: _file("original_key"),
        ImageDetection.annotated_key: _file("annotated_key"),
    }


class VideoJobAdmin(_ReadOnlyView, model=VideoJob):
    name_plural = "Video jobs"
    icon = "fa-solid fa-film"
    column_list = [
        VideoJob.id,
        VideoJob.user_id,
        VideoJob.original_filename,
        VideoJob.status,
        VideoJob.duration_seconds,
        VideoJob.frames_processed,
        VideoJob.created_at,
        VideoJob.error,
    ]
    column_searchable_list = [VideoJob.original_filename]
    column_sortable_list = [VideoJob.id, VideoJob.created_at, VideoJob.status, VideoJob.user_id]
    column_default_sort = (VideoJob.id, True)
    column_details_exclude_list = [VideoJob.tracks]
    column_formatters_detail = {VideoJob.source_key: _file("source_key")}


class VideoTrackAdmin(_ReadOnlyView, model=VideoTrack):
    name_plural = "Video tracks"
    icon = "fa-solid fa-crosshairs"
    column_list = [
        VideoTrack.id,
        VideoTrack.job_id,
        VideoTrack.track_id,
        VideoTrack.class_name,
        VideoTrack.first_seen_seconds,
        VideoTrack.best_confidence,
        VideoTrack.clip_key,
    ]
    column_labels = {VideoTrack.clip_key: "clip"}
    column_searchable_list = [VideoTrack.class_name]
    column_sortable_list = [VideoTrack.id, VideoTrack.job_id]
    column_default_sort = (VideoTrack.id, True)
    column_details_exclude_list = [VideoTrack.job]
    column_formatters = {VideoTrack.clip_key: _file("clip_key")}
    column_formatters_detail = {VideoTrack.clip_key: _file("clip_key")}


class LiveSessionAdmin(_ReadOnlyView, model=LiveSession):
    name_plural = "Live sessions"
    icon = "fa-solid fa-video"
    column_list = [
        LiveSession.id,
        LiveSession.user_id,
        LiveSession.source,
        LiveSession.camera_id,
        LiveSession.started_at,
        LiveSession.ended_at,
        LiveSession.end_reason,
        LiveSession.frames_processed,
    ]
    column_sortable_list = [LiveSession.id, LiveSession.started_at, LiveSession.user_id]
    column_default_sort = (LiveSession.id, True)
    column_details_exclude_list = [LiveSession.events]


class LiveEventAdmin(_ReadOnlyView, model=LiveEvent):
    name_plural = "Live events"
    icon = "fa-solid fa-bell"
    column_list = [
        LiveEvent.id,
        LiveEvent.session_id,
        LiveEvent.track_id,
        LiveEvent.class_name,
        LiveEvent.confidence,
        LiveEvent.detected_at,
        LiveEvent.clip_key,
    ]
    column_labels = {LiveEvent.clip_key: "clip"}
    column_searchable_list = [LiveEvent.class_name]
    column_sortable_list = [LiveEvent.id, LiveEvent.session_id, LiveEvent.detected_at]
    column_default_sort = (LiveEvent.id, True)
    column_details_exclude_list = [LiveEvent.session]
    column_formatters = {LiveEvent.clip_key: _file("clip_key")}
    column_formatters_detail = {LiveEvent.clip_key: _file("clip_key")}


class CameraAdmin(ModelView, model=Camera):
    name_plural = "Cameras"
    icon = "fa-solid fa-camera"
    column_list = [Camera.id, Camera.name, Camera.source, Camera.enabled, Camera.created_at]
    column_searchable_list = [Camera.name]
    form_columns = [Camera.name, Camera.source, Camera.enabled]
    form_args = {
        "source": {
            "description": 'A device index (e.g. "0") or a stream URL (rtsp://…). '
            "The server connects to it, so only add sources you trust."
        }
    }

    async def on_model_change(
        self, data: dict[str, Any], model: Any, is_created: bool, request: Request
    ) -> None:
        # Checked here so a duplicate gets a plain message instead of the database's error
        # (which SQLAdmin would show with the SQL statement and its parameters).
        for field in ("name", "source"):
            if isinstance(data.get(field), str):
                data[field] = data[field].strip()
        name = data.get("name")
        if not name or not data.get("source"):
            raise ValueError("A camera needs a name and a source.")
        query = select(Camera.id).where(Camera.name == name)
        if not is_created:
            query = query.where(Camera.id != model.id)
        async with self.session_maker() as db:
            if await db.scalar(query) is not None:
                raise ValueError(f'A camera named "{name}" already exists.')


def mount_admin(
    app: FastAPI,
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    rate_limiter: RateLimiter,
    signer: FileSigner,
) -> Admin:
    _FileLinks.signer = signer
    admin = Admin(
        app,
        session_maker=session_factory,
        base_url=ADMIN_PATH,
        title="Secureye admin",
        authentication_backend=SuperuserAuth(settings, session_factory, rate_limiter),
    )
    for view in (
        UserAdmin,
        ImageDetectionAdmin,
        VideoJobAdmin,
        VideoTrackAdmin,
        LiveSessionAdmin,
        LiveEventAdmin,
        CameraAdmin,
    ):
        admin.add_view(view)
    return admin
