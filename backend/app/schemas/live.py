from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.live import LiveSource


class CameraPublic(BaseModel):
    """What every signed-in user sees: enough to pick a camera, not where it lives."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CameraAdmin(CameraPublic):
    source: str
    enabled: bool


class CameraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    source: str = Field(
        min_length=1,
        max_length=500,
        description='OpenCV source: device index (e.g. "0") or stream URL (rtsp://…).',
    )
    enabled: bool = True


class LiveEventRead(BaseModel):
    """A row of the live report: an object seen for the first time, and its clip."""

    id: int
    track_id: int
    class_name: str
    confidence: float
    detected_at: datetime
    clip_url: str | None


class LiveSessionRead(BaseModel):
    id: int
    source: LiveSource
    camera_id: int | None
    started_at: datetime
    ended_at: datetime | None
    end_reason: str | None
    model: str
    confidence_threshold: float
    iou_threshold: float
    frames_processed: int
    events: list[LiveEventRead] | None = Field(default=None, description="Session detail only.")


class LiveSessionPage(BaseModel):
    items: list[LiveSessionRead]
    total: int
    limit: int
    offset: int
