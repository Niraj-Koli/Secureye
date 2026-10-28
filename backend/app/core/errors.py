"""Consistent JSON error responses: `{"detail": <message or list>, "code": <machine code>}`."""

from collections.abc import Mapping
from typing import Any

import structlog
from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger(__name__)


class AppError(Exception):
    """Base class for expected, client-facing errors raised by services."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"
    headers: Mapping[str, str] | None = None

    def __init__(self, detail: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(detail)
        self.detail = detail
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


def _error_response(
    status_code: int, detail: Any, code: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": jsonable_encoder(detail), "code": code},
        headers=headers,
    )


async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return _error_response(exc.status_code, exc.detail, exc.code, exc.headers)


async def _http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = {
        status.HTTP_401_UNAUTHORIZED: "not_authenticated",
        status.HTTP_403_FORBIDDEN: "forbidden",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    }.get(exc.status_code, "http_error")
    return _error_response(exc.status_code, exc.detail, code, exc.headers)


async def _validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, exc.errors(), "validation_error")


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Full traceback goes to the logs; the client only gets a generic message, plus the request
    # ID that finds the traceback in the logs. Starlette runs this handler outside the other
    # middleware, so the request ID is added here explicitly (log line, body and header).
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        request_id=request_id,
    )
    content: dict[str, Any] = {"detail": "Internal server error.", "code": "internal_error"}
    headers: dict[str, str] = {}
    if isinstance(request_id, str):
        content["request_id"] = request_id
        headers["X-Request-ID"] = request_id
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=content, headers=headers
    )


def register_exception_handlers(app: FastAPI) -> None:
    # Starlette types every handler as taking `Exception`, although it only ever passes instances
    # of the registered class. The narrower signatures are correct, hence the targeted ignores.
    app.add_exception_handler(AppError, _app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled_exception_handler)
