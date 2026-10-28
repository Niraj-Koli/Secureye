"""Image detection use case: validate → detect → store files → record → present."""

import uuid
from dataclasses import asdict
from pathlib import PurePath

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import NotFoundError
from app.ml.registry import ModelRegistry
from app.models.image_detection import ImageDetection
from app.models.user import User
from app.schemas.detection import ImageDetectionPage, ImageDetectionRead
from app.services.images import decode_image, encode_jpeg
from app.services.storage import FileSigner, Storage

logger = structlog.get_logger(__name__)


def _display_filename(filename: str | None) -> str:
    """Keep only the base name of the client's filename; it's shown back to the user."""
    name = PurePath((filename or "").replace("\\", "/")).name.strip()
    return (name or "image")[:255]


class ImageDetectionService:
    def __init__(
        self,
        db: AsyncSession,
        storage: Storage,
        signer: FileSigner,
        models: ModelRegistry,
        settings: Settings,
    ) -> None:
        self._db = db
        self._storage = storage
        self._signer = signer
        self._models = models
        self._settings = settings

    async def detect(self, user: User, data: bytes, filename: str | None) -> ImageDetectionRead:
        image = decode_image(data, max_pixels=self._settings.max_image_pixels)
        detector = self._models.image
        result = await self._models.detect(
            detector,
            image.bgr,
            confidence=self._settings.image_confidence,
            iou=self._settings.image_iou,
        )

        prefix = f"images/{user.id}/{uuid.uuid4().hex}"
        original_key = f"{prefix}/original.{image.extension}"
        annotated_key = f"{prefix}/annotated.jpg"
        await self._storage.save(original_key, data)
        try:
            await self._storage.save(annotated_key, encode_jpeg(result.annotated))
            record = ImageDetection(
                user_id=user.id,
                original_filename=_display_filename(filename),
                original_key=original_key,
                annotated_key=annotated_key,
                width=image.width,
                height=image.height,
                model=detector.name,
                confidence_threshold=self._settings.image_confidence,
                iou_threshold=self._settings.image_iou,
                inference_ms=round(result.inference_ms, 1),
                detections=[asdict(d) for d in result.detections],
            )
            self._db.add(record)
            await self._db.commit()
            await self._db.refresh(record)  # load server-generated created_at
        except BaseException:
            # Don't leave orphaned files behind if storing or recording fails.
            for key in (original_key, annotated_key):
                await self._storage.delete(key)
            raise

        logger.info(
            "image_detected",
            detection_id=record.id,
            user_id=user.id,
            objects=len(result.detections),
            inference_ms=record.inference_ms,
        )
        return self._present(record)

    async def list(self, user: User, *, limit: int, offset: int) -> ImageDetectionPage:
        total = await self._db.scalar(
            select(func.count())
            .select_from(ImageDetection)
            .where(ImageDetection.user_id == user.id)
        )
        rows = await self._db.scalars(
            select(ImageDetection)
            .where(ImageDetection.user_id == user.id)
            .order_by(ImageDetection.created_at.desc(), ImageDetection.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return ImageDetectionPage(
            items=[self._present(r) for r in rows], total=total or 0, limit=limit, offset=offset
        )

    async def get(self, user: User, detection_id: int) -> ImageDetectionRead:
        return self._present(await self._owned(user, detection_id))

    async def delete(self, user: User, detection_id: int) -> None:
        record = await self._owned(user, detection_id)
        await self._db.delete(record)
        await self._db.commit()
        for key in (record.original_key, record.annotated_key):
            await self._storage.delete(key)

    async def _owned(self, user: User, detection_id: int) -> ImageDetection:
        record = await self._db.get(ImageDetection, detection_id)
        # Someone else's record is reported as missing, not forbidden: don't confirm it exists.
        if record is None or record.user_id != user.id:
            raise NotFoundError("Image detection not found.")
        return record

    def _present(self, record: ImageDetection) -> ImageDetectionRead:
        return ImageDetectionRead.model_validate(
            {
                "id": record.id,
                "created_at": record.created_at,
                "original_filename": record.original_filename,
                "width": record.width,
                "height": record.height,
                "model": record.model,
                "confidence_threshold": record.confidence_threshold,
                "iou_threshold": record.iou_threshold,
                "inference_ms": record.inference_ms,
                "detections": record.detections,
                "original_url": self._signer.url(record.original_key),
                "annotated_url": self._signer.url(record.annotated_key),
            }
        )
