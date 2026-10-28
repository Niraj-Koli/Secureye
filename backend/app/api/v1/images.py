"""Image detection: upload an image, get it back annotated with what the model found."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from app.api.deps import CurrentUser, ImageDetectionServiceDep, SettingsDep
from app.api.uploads import read_upload
from app.core.rate_limit import rate_limit
from app.schemas.detection import ImageDetectionPage, ImageDetectionRead

router = APIRouter(prefix="/images", tags=["image detection"])


@router.post(
    "",
    response_model=ImageDetectionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Detect threats in an image",
    description=(
        "Accepts JPEG, PNG, WebP or BMP. Runs the image model (confidence 0.2, IoU 0.3 by "
        "default), stores the upload and the annotated result, and returns the detections."
    ),
    dependencies=[Depends(rate_limit("30/minute"))],
)
async def detect_image(
    user: CurrentUser,
    service: ImageDetectionServiceDep,
    settings: SettingsDep,
    image: Annotated[UploadFile, File(description="The image to analyze.")],
) -> ImageDetectionRead:
    data = await read_upload(image, max_bytes=settings.max_image_upload_mb * 1024 * 1024)
    return await service.detect(user, data, image.filename)


@router.get("", response_model=ImageDetectionPage, summary="Your past image detections")
async def list_images(
    user: CurrentUser,
    service: ImageDetectionServiceDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ImageDetectionPage:
    return await service.list(user, limit=limit, offset=offset)


@router.get("/{detection_id}", response_model=ImageDetectionRead, summary="One image detection")
async def get_image(
    detection_id: int, user: CurrentUser, service: ImageDetectionServiceDep
) -> ImageDetectionRead:
    return await service.get(user, detection_id)


@router.delete(
    "/{detection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an image detection and its files",
)
async def delete_image(
    detection_id: int, user: CurrentUser, service: ImageDetectionServiceDep
) -> None:
    await service.delete(user, detection_id)
