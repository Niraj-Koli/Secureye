"""RedisJobEvents against a real Redis (the docker-compose service, database 15)."""

import asyncio
import os
from collections.abc import AsyncIterator

import pytest

from app.services.job_events import Event, RedisJobEvents

REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")


@pytest.fixture
async def events() -> AsyncIterator[RedisJobEvents]:
    events = RedisJobEvents(REDIS_URL)
    try:
        await events.ping()
    except OSError as exc:
        pytest.exit(f"Test Redis unreachable ({exc}); start it with `docker compose up -d redis`.")
    yield events
    await events._redis.flushdb()
    await events.close()


async def test_subscribers_receive_events_in_order(events: RedisJobEvents) -> None:
    received: list[Event] = []

    async with events.subscribe(7) as stream:

        async def read() -> None:
            async for event in stream:
                received.append(event)
                if event["type"] == "completed":
                    return

        reader = asyncio.create_task(read())
        await events.publish(7, {"type": "progress", "progress": 0.5})
        await events.publish(8, {"type": "progress", "progress": 0.9})  # other job: not received
        await events.publish(7, {"type": "completed", "status": "succeeded"})
        await asyncio.wait_for(reader, timeout=5)

    assert received == [
        {"type": "progress", "progress": 0.5},
        {"type": "completed", "status": "succeeded"},
    ]


async def test_latest_progress_survives_for_late_subscribers(events: RedisJobEvents) -> None:
    await events.publish(3, {"type": "progress", "progress": 0.2})
    await events.publish(3, {"type": "frame", "image": "..."})
    await events.publish(3, {"type": "progress", "progress": 0.4})

    assert await events.latest_progress(3) == {"type": "progress", "progress": 0.4}
    assert await events.latest_progress(4) is None


async def test_cancel_flag(events: RedisJobEvents) -> None:
    assert not await events.is_cancel_requested(5)

    await events.request_cancel(5)

    assert await events.is_cancel_requested(5)
    assert not await events.is_cancel_requested(6)
