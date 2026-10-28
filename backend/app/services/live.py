"""Live detection: session bookkeeping, history and camera management."""

from collections import Counter
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, NotFoundError
from app.ml.live import NewObject
from app.models.live import Camera, LiveEvent, LiveSession, LiveSource
from app.models.user import User
from app.schemas.live import LiveEventRead, LiveSessionPage, LiveSessionRead
from app.services.storage import FileSigner, Storage


class CameraNameTakenError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "camera_name_taken"


class SessionStillActiveError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "session_still_active"


class ActiveSessions:
    """Counts open live sessions per user (per API process)."""

    def __init__(self, limit_per_user: int) -> None:
        self._limit = limit_per_user
        self._counts: Counter[int] = Counter()

    def try_acquire(self, user_id: int) -> bool:
        if self._counts[user_id] >= self._limit:
            return False
        self._counts[user_id] += 1
        return True

    def release(self, user_id: int) -> None:
        self._counts[user_id] -= 1
        if self._counts[user_id] <= 0:
            del self._counts[user_id]


class LiveSessionRecorder:
    """Database writes made while a live session runs (each in its own short transaction)."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = session_factory

    async def start(
        self,
        user_id: int,
        *,
        source: LiveSource,
        camera_id: int | None,
        model: str,
        confidence: float,
        iou: float,
    ) -> int:
        async with self._sessions() as db:
            session = LiveSession(
                user_id=user_id,
                source=source,
                camera_id=camera_id,
                model=model,
                confidence_threshold=confidence,
                iou_threshold=iou,
            )
            db.add(session)
            await db.commit()
            return session.id

    async def add_events(self, session_id: int, objects: list[NewObject]) -> list[int]:
        async with self._sessions() as db:
            events = [
                LiveEvent(
                    session_id=session_id,
                    track_id=o.track_id,
                    class_name=o.class_name,
                    confidence=o.confidence,
                    detected_at=o.detected_at,
                )
                for o in objects
            ]
            db.add_all(events)
            await db.commit()
            return [e.id for e in events]

    async def attach_clip(self, session_id: int, track_id: int, clip_key: str) -> None:
        async with self._sessions() as db:
            await db.execute(
                update(LiveEvent)
                .where(LiveEvent.session_id == session_id, LiveEvent.track_id == track_id)
                .values(clip_key=clip_key)
            )
            await db.commit()

    async def finish(self, session_id: int, *, reason: str, frames_processed: int) -> None:
        async with self._sessions() as db:
            session = await db.get(LiveSession, session_id)
            if session is not None:
                session.ended_at = datetime.now(UTC)
                session.end_reason = reason
                session.frames_processed = frames_processed
                await db.commit()


class LiveHistoryService:
    def __init__(self, db: AsyncSession, storage: Storage, signer: FileSigner) -> None:
        self._db = db
        self._storage = storage
        self._signer = signer

    async def list(self, user: User, *, limit: int, offset: int) -> LiveSessionPage:
        total = await self._db.scalar(
            select(func.count()).select_from(LiveSession).where(LiveSession.user_id == user.id)
        )
        rows = await self._db.scalars(
            select(LiveSession)
            .where(LiveSession.user_id == user.id)
            .order_by(LiveSession.started_at.desc(), LiveSession.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return LiveSessionPage(
            items=[self._present(s, with_events=False) for s in rows],
            total=total or 0,
            limit=limit,
            offset=offset,
        )

    async def get(self, user: User, session_id: int) -> LiveSessionRead:
        return self._present(await self._owned(user, session_id), with_events=True)

    async def delete(self, user: User, session_id: int) -> None:
        session = await self._owned(user, session_id)
        if session.ended_at is None:
            raise SessionStillActiveError("Stop the live session before deleting it.")
        keys = [e.clip_key for e in session.events if e.clip_key]
        await self._db.delete(session)
        await self._db.commit()
        for key in keys:
            await self._storage.delete(key)

    async def _owned(self, user: User, session_id: int) -> LiveSession:
        session = await self._db.scalar(
            select(LiveSession)
            .where(LiveSession.id == session_id)
            .options(selectinload(LiveSession.events))
        )
        if session is None or session.user_id != user.id:
            raise NotFoundError("Live session not found.")
        return session

    def _present(self, session: LiveSession, *, with_events: bool) -> LiveSessionRead:
        events = None
        if with_events:
            events = [
                LiveEventRead(
                    id=e.id,
                    track_id=e.track_id,
                    class_name=e.class_name,
                    confidence=e.confidence,
                    detected_at=e.detected_at,
                    clip_url=self._signer.url(e.clip_key) if e.clip_key else None,
                )
                for e in session.events
            ]
        return LiveSessionRead(
            id=session.id,
            source=session.source,
            camera_id=session.camera_id,
            started_at=session.started_at,
            ended_at=session.ended_at,
            end_reason=session.end_reason,
            model=session.model,
            confidence_threshold=session.confidence_threshold,
            iou_threshold=session.iou_threshold,
            frames_processed=session.frames_processed,
            events=events,
        )


class CameraService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list(self, *, include_disabled: bool) -> list[Camera]:
        query = select(Camera).order_by(Camera.name)
        if not include_disabled:
            query = query.where(Camera.enabled)
        return list(await self._db.scalars(query))

    async def get_enabled(self, camera_id: int) -> Camera:
        camera = await self._db.get(Camera, camera_id)
        if camera is None or not camera.enabled:
            raise NotFoundError("Camera not found.")
        return camera

    async def create(self, *, name: str, source: str, enabled: bool) -> Camera:
        camera = Camera(name=name, source=source, enabled=enabled)
        self._db.add(camera)
        try:
            await self._db.commit()
        except IntegrityError as exc:
            await self._db.rollback()
            raise CameraNameTakenError("A camera with this name already exists.") from exc
        return camera

    async def delete(self, camera_id: int) -> None:
        camera = await self._db.get(Camera, camera_id)
        if camera is None:
            raise NotFoundError("Camera not found.")
        await self._db.delete(camera)
        await self._db.commit()
