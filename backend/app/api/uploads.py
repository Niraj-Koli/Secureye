"""Reading multipart uploads with a hard size cap."""

import os
import tempfile
from pathlib import Path

import anyio
from fastapi import UploadFile, status

from app.core.errors import AppError

_CHUNK = 1024 * 1024


class UploadTooLargeError(AppError):
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    code = "upload_too_large"


class EmptyUploadError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "empty_upload"


async def read_upload(upload: UploadFile, *, max_bytes: int) -> bytes:
    """Read the whole upload, failing as soon as it exceeds `max_bytes`."""
    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(_CHUNK):
        size += len(chunk)
        if size > max_bytes:
            raise UploadTooLargeError(
                f"File is too large; the maximum is {max_bytes // (1024 * 1024)} MB."
            )
        chunks.append(chunk)
    if size == 0:
        raise EmptyUploadError("The uploaded file is empty.")
    return b"".join(chunks)


async def save_upload_to_temp(upload: UploadFile, *, max_bytes: int, directory: Path) -> Path:
    """Stream the upload to a temporary file (large videos never sit in memory).

    The caller owns the returned file and must move or delete it.
    """
    await anyio.Path(directory).mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=directory, suffix=".upload")
    os.close(fd)
    path = Path(name)
    size = 0
    try:
        async with await anyio.open_file(path, "wb") as out:
            while chunk := await upload.read(_CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise UploadTooLargeError(
                        f"File is too large; the maximum is {max_bytes // (1024 * 1024)} MB."
                    )
                await out.write(chunk)
        if size == 0:
            raise EmptyUploadError("The uploaded file is empty.")
    except BaseException:
        await anyio.Path(path).unlink(missing_ok=True)
        raise
    return path
