from datetime import datetime

from pydantic import BaseModel, Field


class BoxRead(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class DetectionRead(BaseModel):
    class_name: str
    confidence: float = Field(ge=0, le=1, description="0..1; the UI shows it as a whole %.")
    box: BoxRead


class ImageDetectionRead(BaseModel):
    id: int
    created_at: datetime
    original_filename: str
    width: int
    height: int
    model: str
    confidence_threshold: float
    iou_threshold: float
    inference_ms: float
    detections: list[DetectionRead]
    original_url: str = Field(description="Signed, expiring link to the uploaded image.")
    annotated_url: str = Field(description="Signed, expiring link to the annotated JPEG.")


class ImageDetectionPage(BaseModel):
    items: list[ImageDetectionRead]
    total: int
    limit: int
    offset: int
