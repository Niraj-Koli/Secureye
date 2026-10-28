from datetime import datetime

from pydantic import BaseModel, Field

from app.models.video import VideoJobStatus


class VideoTrackRead(BaseModel):
    track_id: int
    class_name: str
    first_seen_seconds: float = Field(description="Shown as the report's 'Timestamps' column.")
    last_seen_seconds: float
    best_confidence: float
    frames: int
    clip_url: str | None = Field(description="Signed link to this object's H.264 clip.")


class VideoJobRead(BaseModel):
    id: int
    status: VideoJobStatus
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    original_filename: str
    width: int
    height: int
    fps: float
    duration_seconds: float
    model: str
    confidence_threshold: float
    iou_threshold: float
    target_fps: float
    frames_processed: int
    source_url: str
    tracks: list[VideoTrackRead] | None = Field(
        default=None, description="Tracked objects, ordered by track id (job detail only)."
    )


class VideoJobPage(BaseModel):
    items: list[VideoJobRead]
    total: int
    limit: int
    offset: int
