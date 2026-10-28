"""RateLimiter against a real Redis (the docker-compose service, database 15), as in production.

The API tests use in-memory counters; this checks the Redis storage they would otherwise skip.
"""

import os
from collections.abc import AsyncIterator

import pytest
import redis.asyncio as redis
from limits import parse

from app.core.config import Settings
from app.core.rate_limit import RateLimiter, RateLimitExceededError

REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


@pytest.fixture
async def limiter() -> AsyncIterator[RateLimiter]:
    client = redis.Redis.from_url(REDIS_URL)
    try:
        await client.ping()
    except OSError as exc:
        pytest.exit(f"Test Redis unreachable ({exc}); start it with `docker compose up -d redis`.")
    yield RateLimiter(Settings(_env_file=None, redis_url=REDIS_URL))
    await client.flushdb()
    await client.aclose()


async def test_counts_hits_in_redis_and_blocks_over_the_limit(limiter: RateLimiter) -> None:
    item = parse("3/minute")
    for _ in range(3):
        await limiter.check(item, "test_endpoint", "203.0.113.1")

    with pytest.raises(RateLimitExceededError) as raised:
        await limiter.check(item, "test_endpoint", "203.0.113.1")
    assert raised.value.headers is not None
    assert 1 <= int(raised.value.headers["Retry-After"]) <= 60


async def test_counts_each_client_and_endpoint_separately(limiter: RateLimiter) -> None:
    item = parse("1/minute")
    await limiter.check(item, "test_endpoint", "203.0.113.1")

    await limiter.check(item, "test_endpoint", "203.0.113.2")
    await limiter.check(item, "other_endpoint", "203.0.113.1")
    with pytest.raises(RateLimitExceededError):
        await limiter.check(item, "test_endpoint", "203.0.113.1")
