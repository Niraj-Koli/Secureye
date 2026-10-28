"""Async rate limiting as a FastAPI dependency, backed by the `limits` library.

Usage:  @router.post("/login", dependencies=[Depends(rate_limit("10/minute"))])

Counters are keyed by endpoint function + client IP and stored in Redis (shared by all workers),
or in memory for tests.
"""

import math
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, status
from limits import RateLimitItem, parse
from limits.aio.storage import Storage
from limits.aio.strategies import MovingWindowRateLimiter
from limits.storage import storage_from_string

from app.core.config import Settings
from app.core.errors import AppError


class RateLimitExceededError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"

    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many requests. Please try again later.")
        self.retry_after = retry_after
        self.headers = {"Retry-After": str(retry_after)}


class RateLimiter:
    def __init__(self, settings: Settings) -> None:
        self.enabled = settings.rate_limit_enabled
        uri = settings.rate_limit_storage
        # Redis through redis-py (already used by Celery and the job events), not limits' default
        # coredis client: one Redis library instead of two.
        options = {"implementation": "redispy"} if uri.startswith("async+redis") else {}
        storage = storage_from_string(uri, **options)
        if not isinstance(storage, Storage):
            raise ValueError("RATE_LIMIT_STORAGE_URL must use an async storage (async+…://).")
        self._limiter = MovingWindowRateLimiter(storage)

    async def check(self, item: RateLimitItem, *identifiers: str) -> None:
        if not self.enabled:
            return
        if not await self._limiter.hit(item, *identifiers):
            stats = await self._limiter.get_window_stats(item, *identifiers)
            raise RateLimitExceededError(
                retry_after=max(1, math.ceil(stats.reset_time - time.time()))
            )


def rate_limit(limit: str) -> Callable[[Request], Awaitable[None]]:
    """Dependency enforcing `limit` (e.g. "5/minute") per client IP for the decorated route."""
    item = parse(limit)

    async def dependency(request: Request) -> None:
        limiter: RateLimiter = request.app.state.rate_limiter
        client_ip = request.client.host if request.client else "unknown"
        endpoint = request.scope["endpoint"]
        await limiter.check(item, f"{endpoint.__module__}.{endpoint.__qualname__}", client_ip)

    return dependency
