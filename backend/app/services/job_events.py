"""Progress events for background video jobs.

The worker publishes events; the API relays them to the browser over SSE. With Celery the worker
is another process, so events travel over Redis pub/sub. `InMemoryJobEvents` serves tests and the
single-process `inline` runner.

Event shapes (all JSON objects with a "type"):
    {"type": "status",   "status": "running"}
    {"type": "progress", "progress": 0.42, "time_seconds": 12.3, "tracks_found": 4}
    {"type": "frame",    "image": "<base64 JPEG>", "time_seconds": 12.3}
    {"type": "completed" | "failed" | "cancelled", "status": ..., "error": ...}

Cancellation is a flag the worker polls between frames.
"""

import asyncio
import json
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any, Protocol

import redis.asyncio as aioredis

Event = dict[str, Any]
TERMINAL_EVENTS = frozenset({"completed", "failed", "cancelled"})
_TTL_SECONDS = 24 * 3600


class JobEvents(Protocol):
    async def publish(self, job_id: int, event: Event) -> None: ...

    def subscribe(self, job_id: int) -> AbstractAsyncContextManager[AsyncIterator[Event]]:
        """`async with events.subscribe(id) as stream: async for event in stream: ...`"""
        ...

    async def latest_progress(self, job_id: int) -> Event | None: ...

    async def request_cancel(self, job_id: int) -> None: ...

    async def is_cancel_requested(self, job_id: int) -> bool: ...

    async def close(self) -> None: ...


# ------------------------------------------------------------------ Redis


class RedisJobEvents:
    def __init__(self, url: str) -> None:
        self._redis = aioredis.Redis.from_url(url, decode_responses=True)

    @staticmethod
    def _channel(job_id: int) -> str:
        return f"secureye:video-job:{job_id}"

    async def publish(self, job_id: int, event: Event) -> None:
        payload = json.dumps(event)
        channel = self._channel(job_id)
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.publish(channel, payload)
            if event["type"] == "progress":
                # Late subscribers (page reload) start from the latest progress, not from zero.
                pipe.set(f"{channel}:progress", payload, ex=_TTL_SECONDS)
            await pipe.execute()

    @asynccontextmanager
    async def subscribe(self, job_id: int) -> AsyncIterator[AsyncIterator[Event]]:
        pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
        await pubsub.subscribe(self._channel(job_id))

        async def events() -> AsyncIterator[Event]:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield json.loads(message["data"])

        try:
            yield events()
        finally:
            await pubsub.unsubscribe()
            await pubsub.aclose()

    async def latest_progress(self, job_id: int) -> Event | None:
        raw = await self._redis.get(f"{self._channel(job_id)}:progress")
        return json.loads(raw) if raw else None

    async def request_cancel(self, job_id: int) -> None:
        await self._redis.set(f"{self._channel(job_id)}:cancel", "1", ex=_TTL_SECONDS)

    async def is_cancel_requested(self, job_id: int) -> bool:
        return bool(await self._redis.exists(f"{self._channel(job_id)}:cancel"))

    async def ping(self) -> bool:
        return bool(await self._redis.ping())

    async def close(self) -> None:
        await self._redis.aclose()


# ------------------------------------------------------------------ in memory


class InMemoryJobEvents:
    """Single-process implementation (tests, the inline runner)."""

    def __init__(self) -> None:
        self._queues: dict[int, set[asyncio.Queue[Event]]] = defaultdict(set)
        self._progress: dict[int, Event] = {}
        self._cancelled: set[int] = set()
        self.published: list[tuple[int, Event]] = []  # for assertions in tests

    async def publish(self, job_id: int, event: Event) -> None:
        self.published.append((job_id, event))
        if event["type"] == "progress":
            self._progress[job_id] = event
        for queue in self._queues[job_id]:
            queue.put_nowait(event)

    @asynccontextmanager
    async def subscribe(self, job_id: int) -> AsyncIterator[AsyncIterator[Event]]:
        queue: asyncio.Queue[Event] = asyncio.Queue()
        self._queues[job_id].add(queue)

        async def events() -> AsyncIterator[Event]:
            while True:
                yield await queue.get()

        try:
            yield events()
        finally:
            self._queues[job_id].discard(queue)

    async def latest_progress(self, job_id: int) -> Event | None:
        return self._progress.get(job_id)

    async def request_cancel(self, job_id: int) -> None:
        self._cancelled.add(job_id)

    async def is_cancel_requested(self, job_id: int) -> bool:
        return job_id in self._cancelled

    async def close(self) -> None:
        return None
