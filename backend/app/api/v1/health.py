"""Liveness and readiness probes."""

from typing import Literal

import structlog
from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import SessionDep

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]


class ReadinessResponse(BaseModel):
    status: Literal["ok", "unavailable"]
    database: Literal["ok", "unavailable"]


@router.get("", response_model=HealthResponse, summary="Liveness probe")
async def liveness() -> HealthResponse:
    """The process is up and serving requests. Does not touch dependencies."""
    return HealthResponse(status="ok")


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessResponse}},
)
async def readiness(session: SessionDep, response: Response) -> ReadinessResponse:
    """The service can do useful work: the database answers a trivial query."""
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        logger.warning("readiness_database_unavailable", exc_info=True)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(status="unavailable", database="unavailable")
    return ReadinessResponse(status="ok", database="ok")
