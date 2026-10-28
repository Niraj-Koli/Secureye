"""Serves stored files to holders of a valid signed link (see app.services.storage)."""

import time
from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse

from app.api.deps import FileSignerDep, StorageDep
from app.core.errors import AppError, NotFoundError
from app.services.storage import InvalidKeyError


class InvalidSignatureError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "invalid_or_expired_link"


router = APIRouter(prefix="/files", tags=["files"])


@router.get(
    "/{key:path}",
    response_class=FileResponse,
    summary="Download a stored file through a signed link",
    responses={403: {"description": "Missing, invalid or expired signature"}},
)
async def get_file(
    key: str,
    storage: StorageDep,
    signer: FileSignerDep,
    expires: Annotated[int, Query()],
    signature: Annotated[str, Query(max_length=128)],
) -> FileResponse:
    if not signer.verify(key, expires, signature):
        raise InvalidSignatureError("This link is invalid or has expired.")
    try:
        path = storage.local_path(key)
    except InvalidKeyError as exc:
        raise NotFoundError("File not found.") from exc
    if not path.is_file():
        raise NotFoundError("File not found.")
    return FileResponse(
        path,
        headers={
            # Stored files never change; let only the user's browser cache them, and never
            # for longer than the link itself is valid.
            "Cache-Control": f"private, max-age={max(0, expires - int(time.time()))}, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
