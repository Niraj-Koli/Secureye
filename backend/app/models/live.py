from datetime import datetime
from enum import StrEnum

from sqlalchemy import Enum, ForeignKey, Index, String, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class LiveSource(StrEnum):
    BROWSER = "browser"  # frames captured by the user's browser and sent over the socket
    CAMERA = "camera"  # a camera attached to / reachable from the server


def _str_enum(enum: type[StrEnum], length: int) -> Enum:
    return Enum(
        enum, native_enum=False, length=length, values_callable=lambda e: [m.value for m in e]
    )


class Camera(TimestampMixin, Base):
    """A server-side camera an admin registered (the original app's only live source)."""

    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    # OpenCV source: a device index ("0"), or a stream URL (rtsp://, http://).
    source: Mapped[str] = mapped_column(String(500))
    enabled: Mapped[bool] = mapped_column(default=True, server_default=true())


class LiveSession(Base):
    __tablename__ = "live_sessions"
    __table_args__ = (Index("ix_live_sessions_user_id_started_at", "user_id", "started_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source: Mapped[LiveSource] = mapped_column(_str_enum(LiveSource, 16))
    camera_id: Mapped[int | None] = mapped_column(ForeignKey("cameras.id", ondelete="SET NULL"))
    started_at: Mapped[datetime] = mapped_column(server_default=func.now())
    ended_at: Mapped[datetime | None]
    end_reason: Mapped[str | None] = mapped_column(String(32))

    model: Mapped[str] = mapped_column(String(64))
    confidence_threshold: Mapped[float]
    iou_threshold: Mapped[float]
    frames_processed: Mapped[int] = mapped_column(default=0)

    events: Mapped[list["LiveEvent"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="LiveEvent.detected_at",
        lazy="raise",
    )


class LiveEvent(Base):
    """A newly seen object during a live session (the original report row + alert)."""

    __tablename__ = "live_events"
    __table_args__ = (Index("ix_live_events_session_id_detected_at", "session_id", "detected_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("live_sessions.id", ondelete="CASCADE"))
    track_id: Mapped[int]
    class_name: Mapped[str] = mapped_column(String(64))
    confidence: Mapped[float]
    detected_at: Mapped[datetime]
    clip_key: Mapped[str | None] = mapped_column(String(512))

    session: Mapped[LiveSession] = relationship(back_populates="events", lazy="raise")
