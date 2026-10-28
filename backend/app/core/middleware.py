"""Request IDs, access logs and security headers.

Plain ASGI rather than Starlette's BaseHTTPMiddleware, which would get in the way of streamed
responses (video progress over SSE) and of context variables (the request ID in log lines).
"""

import re
import time
import uuid

import structlog
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import Settings

logger = structlog.get_logger("app.access")

REQUEST_ID_HEADER = "X-Request-ID"
# Accept a caller's ID (e.g. from a load balancer) only if it's short and plain.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
# Health probes run every few seconds; logging each would drown everything else.
_QUIET_PATHS = ("/api/v1/health",)

# The API only returns JSON and files: nothing on it should run scripts, load resources or be
# framed. The interactive docs (/docs, development only) load Swagger UI from a CDN, so they
# get no CSP; the admin site serves its own scripts and styles.
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
_ADMIN_CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


def current_request_id() -> str | None:
    """The ID of the request being handled (bound into every log line), if any."""
    value = structlog.contextvars.get_contextvars().get("request_id")
    return value if isinstance(value, str) else None


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.api_prefix = settings.api_v1_prefix
        self.hsts = settings.is_production

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER.lower(), "")
        request_id = incoming if _VALID_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        path: str = scope["path"]
        status = 500  # unless the app gets as far as starting a response
        started = time.perf_counter()

        async def send_with_headers(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
                self._add_security_headers(headers, path)
            await send(message)

        with structlog.contextvars.bound_contextvars(request_id=request_id):
            try:
                await self.app(scope, receive, send_with_headers)
            finally:
                if scope["type"] == "http" and not path.startswith(_QUIET_PATHS):
                    logger.info(
                        "request",
                        method=scope["method"],
                        path=path,
                        status=status,
                        duration_ms=round((time.perf_counter() - started) * 1000, 1),
                    )

    def _add_security_headers(self, headers: MutableHeaders, path: str) -> None:
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if self.hsts:
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if path.startswith("/admin"):
            headers.setdefault("Content-Security-Policy", _ADMIN_CSP)
        elif path.startswith(self.api_prefix) and not path.endswith("/openapi.json"):
            headers.setdefault("Content-Security-Policy", _API_CSP)
