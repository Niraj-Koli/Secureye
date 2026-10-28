from datetime import datetime
from enum import StrEnum

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VideoJobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def is_active(self) -> bool:
        return self in {VideoJobStatus.QUEUED, VideoJobStatus.RUNNING}


class VideoJob(Base):
    """An uploaded video and its (background) detection + tracking run."""

    __tablename__ = "video_jobs"
    __table_args__ = (Index("ix_video_jobs_user_id_created_at", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]

    # Stored as VARCHAR (not a PostgreSQL enum type): adding a status later needs no
    # enum-altering migration. Loaded back as VideoJobStatus.
    status: Mapped[VideoJobStatus] = mapped_column(
        Enum(
            VideoJobStatus,
            native_enum=False,
            length=16,
            values_callable=lambda statuses: [s.value for s in statuses],
        ),
        default=VideoJobStatus.QUEUED,
    )
    error: Mapped[str | None] = mapped_column(String(500))

    original_filename: Mapped[str] = mapped_column(String(255))
    source_key: Mapped[str] = mapped_column(String(512))
    width: Mapped[int]
    height: Mapped[int]
    fps: Mapped[float]
    duration_seconds: Mapped[float]

    model: Mapped[str] = mapped_column(String(64))
    confidence_threshold: Mapped[float]
    iou_threshold: Mapped[float]
    target_fps: Mapped[float]
    frames_processed: Mapped[int] = mapped_column(default=0)

    tracks: Mapped[list["VideoTrack"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="VideoTrack.track_id",
        lazy="raise",  # always load explicitly (async: no implicit lazy loads)
    )


class VideoTrack(Base):
    """One tracked object in a video: what it is, when it first appeared, and its clip."""

    __tablename__ = "video_tracks"
    __table_args__ = (UniqueConstraint("job_id", "track_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("video_jobs.id", ondelete="CASCADE"))
    track_id: Mapped[int]
    class_name: Mapped[str] = mapped_column(String(64))
    first_seen_seconds: Mapped[float]
    last_seen_seconds: Mapped[float]
    best_confidence: Mapped[float]
    frames: Mapped[int]
    clip_key: Mapped[str | None] = mapped_column(String(512))

    job: Mapped[VideoJob] = relationship(back_populates="tracks", lazy="raise")
