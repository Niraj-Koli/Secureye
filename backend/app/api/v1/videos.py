"""Video detection: upload a video, follow its processing live, get the tracked objects."""

from collections.abc import AsyncIterable
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.api.deps import (
    CurrentUser,
    JobEventsDep,
    SettingsDep,
    VideoJobServiceDep,
)
from app.api.uploads import save_upload_to_temp
from app.core.rate_limit import rate_limit
from app.models.video import VideoJob, VideoJobStatus
from app.schemas.video import VideoJobPage, VideoJobRead
from app.services.job_events import TERMINAL_EVENTS

router = APIRouter(prefix="/videos", tags=["video detection"])

# Re-check the job in the database after this long without events.
_QUIET_RECHECK_SECONDS = 20.0

_TERMINAL_EVENT_FOR = {
    VideoJobStatus.SUCCEEDED: "completed",
    VideoJobStatus.FAILED: "failed",
    VideoJobStatus.CANCELLED: "cancelled",
}


@router.post(
    "",
    response_model=VideoJobRead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a video for detection and tracking",
    description=(
        "Validates the video, stores it and queues it for background processing. Follow "
        "progress with `GET /videos/{id}/events`; results appear on `GET /videos/{id}`."
    ),
    dependencies=[Depends(rate_limit("10/minute"))],
)
async def upload_video(
    user: CurrentUser,
    service: VideoJobServiceDep,
    settings: SettingsDep,
    video: Annotated[UploadFile, File(description="The video to analyze.")],
) -> VideoJobRead:
    path = await save_upload_to_temp(
        video,
        max_bytes=settings.max_video_upload_mb * 1024 * 1024,
        directory=settings.storage_dir / ".uploads",
    )
    try:
        return await service.create(user, path, video.filename)
    finally:
        # Moved into storage on success; this removes the leftover on failure.
        await anyio.Path(path).unlink(missing_ok=True)


@router.get("", response_model=VideoJobPage, summary="Your video jobs, newest first")
async def list_videos(
    user: CurrentUser,
    service: VideoJobServiceDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> VideoJobPage:
    return await service.list(user, limit=limit, offset=offset)


@router.get(
    "/{job_id}", response_model=VideoJobRead, summary="A video job with its tracked objects"
)
async def get_video(job_id: int, user: CurrentUser, service: VideoJobServiceDep) -> VideoJobRead:
    return await service.get(user, job_id)


@router.post(
    "/{job_id}/cancel",
    response_model=VideoJobRead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Stop a queued or running job",
)
async def cancel_video(job_id: int, user: CurrentUser, service: VideoJobServiceDep) -> VideoJobRead:
    return await service.cancel(user, job_id)


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a finished job, its video and clips",
)
async def delete_video(job_id: int, user: CurrentUser, service: VideoJobServiceDep) -> None:
    await service.delete(user, job_id)


async def _owned_job(job_id: int, user: CurrentUser, service: VideoJobServiceDep) -> VideoJob:
    # Resolved as a dependency so a 404 is a normal JSON response, before streaming starts.
    return await service.owned(user, job_id)


@router.get(
    "/{job_id}/events",
    response_class=EventSourceResponse,
    summary="Live progress (Server-Sent Events)",
    description=(
        "Events: `status`, `progress` {progress, time_seconds, tracks_found}, "
        "`frame` {image: base64 JPEG, time_seconds}, then one of `completed`, `failed` or "
        "`cancelled`, after which the stream ends. Send the access token as "
        "`Authorization: Bearer` (use a fetch-based SSE client; `EventSource` can't set headers)."
    ),
)
async def video_events(
    request: Request,
    job: Annotated[VideoJob, Depends(_owned_job)],
    events: JobEventsDep,
) -> AsyncIterable[ServerSentEvent]:
    job_id, current = job.id, job.status
    latest = await events.latest_progress(job_id)
    yield ServerSentEvent(
        event="status",
        data={"type": "status", "status": current, "progress": (latest or {}).get("progress")},
    )
    if not current.is_active:
        yield _terminal(current, job.error)
        return

    async with events.subscribe(job_id) as stream:
        # The job may have finished between the read above and subscribing: re-check.
        async with request.app.state.session_factory() as db:
            refreshed = await db.get(VideoJob, job_id)
        if refreshed is None or not refreshed.status.is_active:
            if refreshed is None:
                yield _terminal(VideoJobStatus.CANCELLED, None)
            else:
                yield _terminal(refreshed.status, refreshed.error)
            return

        events_iter = aiter(stream)
        while True:
            try:
                with anyio.fail_after(_QUIET_RECHECK_SECONDS):
                    event = await anext(events_iter)
            except TimeoutError:
                # No news for a while: if the job ended without us hearing about it
                # (worker crash, missed message), finish the stream instead of waiting forever.
                async with request.app.state.session_factory() as db:
                    current_job = await db.get(VideoJob, job_id)
                if current_job is None:
                    yield _terminal(VideoJobStatus.CANCELLED, None)
                    return
                if not current_job.status.is_active:
                    yield _terminal(current_job.status, current_job.error)
                    return
                continue
            yield ServerSentEvent(event=event["type"], data=event)
            if event["type"] in TERMINAL_EVENTS:
                return


def _terminal(job_status: VideoJobStatus, error: str | None) -> ServerSentEvent:
    event = _TERMINAL_EVENT_FOR[job_status]
    return ServerSentEvent(event=event, data={"type": event, "status": job_status, "error": error})
