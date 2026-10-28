"""ORM models.

Every model module is imported here, so importing *any* model registers *all* tables on
`Base.metadata`. Foreign keys are resolved by table name, so a process that only imported
`VideoJob` (e.g. the Celery worker) would otherwise fail to find the `users` table on flush.
"""

from app.models.image_detection import ImageDetection
from app.models.live import Camera, LiveEvent, LiveSession, LiveSource
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.video import VideoJob, VideoJobStatus, VideoTrack

__all__ = [
    "Camera",
    "ImageDetection",
    "LiveEvent",
    "LiveSession",
    "LiveSource",
    "RefreshToken",
    "User",
    "VideoJob",
    "VideoJobStatus",
    "VideoTrack",
]
