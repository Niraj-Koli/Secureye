import io

import numpy as np
import pytest
from PIL import Image

from app.services.images import (
    InvalidImageError,
    UnsupportedImageTypeError,
    decode_image,
    encode_jpeg,
)

MAX = 50_000_000


def _encode(img: Image.Image, fmt: str, **kwargs: object) -> bytes:
    buffer = io.BytesIO()
    img.save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


@pytest.mark.parametrize(
    ("fmt", "ext"), [("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp"), ("BMP", "bmp")]
)
def test_supported_formats_decode_to_bgr(fmt: str, ext: str) -> None:
    data = _encode(
        Image.new("RGB", (40, 30), (255, 0, 0)),
        fmt,
        **({"lossless": True} if fmt == "WEBP" else {}),
    )

    decoded = decode_image(data, max_pixels=MAX)

    assert (decoded.width, decoded.height, decoded.extension) == (40, 30, ext)
    assert decoded.bgr.shape == (30, 40, 3)
    assert decoded.bgr.dtype == np.uint8
    b, g, r = decoded.bgr[15, 20]
    assert r > 200 and g < 50 and b < 50  # red in RGB is the last channel in BGR


def test_png_with_alpha_is_flattened_to_three_channels() -> None:
    data = _encode(Image.new("RGBA", (10, 10), (0, 0, 255, 128)), "PNG")

    assert decode_image(data, max_pixels=MAX).bgr.shape == (10, 10, 3)


def test_exif_orientation_is_applied() -> None:
    img = Image.new("RGB", (40, 20))
    exif = img.getexif()
    exif[0x0112] = 6  # "rotate 90° clockwise to display"

    decoded = decode_image(_encode(img, "JPEG", exif=exif), max_pixels=MAX)

    assert (decoded.width, decoded.height) == (20, 40)


def test_non_image_is_rejected() -> None:
    with pytest.raises(InvalidImageError):
        decode_image(b"%PDF-1.7 definitely not an image", max_pixels=MAX)


def test_truncated_image_is_rejected() -> None:
    data = _encode(Image.new("RGB", (200, 200), (1, 2, 3)), "PNG")

    with pytest.raises(InvalidImageError):
        decode_image(data[: len(data) // 2], max_pixels=MAX)


def test_unsupported_format_is_rejected() -> None:
    data = _encode(Image.new("RGB", (10, 10)), "GIF")

    with pytest.raises(UnsupportedImageTypeError):
        decode_image(data, max_pixels=MAX)


def test_too_many_pixels_is_rejected_before_decoding() -> None:
    data = _encode(Image.new("RGB", (100, 100)), "PNG")

    with pytest.raises(InvalidImageError, match="too large"):
        decode_image(data, max_pixels=9_999)


def test_encode_jpeg_roundtrip() -> None:
    image = np.zeros((20, 30, 3), dtype=np.uint8)

    data = encode_jpeg(image)

    assert data[:3] == b"\xff\xd8\xff"  # JPEG magic number
    assert Image.open(io.BytesIO(data)).size == (30, 20)
