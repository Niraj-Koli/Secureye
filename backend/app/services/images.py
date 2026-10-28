"""Decoding and validating uploaded images, and encoding results."""

import io
import sys
import warnings
from collections.abc import Callable
from dataclasses import dataclass

import cv2
import numpy as np
from fastapi import status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import AppError
from app.ml.detector import ImageBGR


def _pillow_open() -> Callable[..., Image.Image]:
    """Pillow's own `Image.open`, even if a library has monkey-patched it.

    Ultralytics replaces `PIL.Image.open` with a wrapper that, on an unrecognized file, tries to
    pip-install a HEIF plugin and retry. Uploads are untrusted input: they must go through plain
    Pillow and fail cleanly instead.
    """
    opener: Callable[..., Image.Image] = Image.open
    if opener.__module__ == Image.__name__:
        return opener
    original = getattr(sys.modules.get(opener.__module__), "_image_open", None)
    if original is None or original.__module__ != Image.__name__:
        raise RuntimeError(f"PIL.Image.open is patched by {opener.__module__}; cannot unwrap it.")
    return original  # type: ignore[no-any-return]


_open_image = _pillow_open()

# Pillow format name -> file extension used when storing the original upload.
ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "BMP": "bmp"}


class InvalidImageError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "invalid_image"


class UnsupportedImageTypeError(AppError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "unsupported_image_type"


@dataclass(frozen=True, slots=True)
class DecodedImage:
    bgr: ImageBGR
    format: str  # Pillow format name, e.g. "JPEG"
    extension: str
    width: int
    height: int


def decode_image(data: bytes, *, max_pixels: int) -> DecodedImage:
    """Validate an upload by actually decoding it (the filename and Content-Type can lie).

    Applies the EXIF orientation, so phone photos aren't sideways in the results.
    """
    try:
        with _open_image(io.BytesIO(data)) as img:
            if img.format not in ALLOWED_FORMATS:
                allowed = ", ".join(ALLOWED_FORMATS)
                raise UnsupportedImageTypeError(f"Unsupported image type. Allowed: {allowed}.")
            fmt = img.format
            if img.width * img.height > max_pixels:
                raise InvalidImageError(
                    f"Image is too large ({img.width}x{img.height}); "
                    f"maximum is {max_pixels:,} pixels."
                )
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                img.load()
            rgb = ImageOps.exif_transpose(img).convert("RGB")
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
    ) as exc:
        raise InvalidImageError("The file is not a valid image.") from exc

    bgr = np.ascontiguousarray(np.asarray(rgb)[:, :, ::-1])
    return DecodedImage(
        bgr=bgr, format=fmt, extension=ALLOWED_FORMATS[fmt], width=rgb.width, height=rgb.height
    )


def encode_jpeg(image: ImageBGR, *, quality: int = 90) -> bytes:
    ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encoding failed.")
    return buffer.tobytes()
