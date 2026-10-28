from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ImageDetection(Base):
    """One image detection run: the uploaded image, the annotated result and what was found."""

    __tablename__ = "image_detections"
    # Serves "my detections, newest first" (the history list) from one index.
    __table_args__ = (Index("ix_image_detections_user_id_created_at", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    original_filename: Mapped[str] = mapped_column(String(255))
    original_key: Mapped[str] = mapped_column(String(512))
    annotated_key: Mapped[str] = mapped_column(String(512))
    width: Mapped[int]
    height: Mapped[int]

    model: Mapped[str] = mapped_column(String(64))
    confidence_threshold: Mapped[float]
    iou_threshold: Mapped[float]
    inference_ms: Mapped[float]
    # [{"class_name": str, "confidence": float, "box": {"x1", "y1", "x2", "y2"}}, ...]
    detections: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
