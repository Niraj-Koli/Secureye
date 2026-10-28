"""Aggregates all v1 routers."""

from fastapi import APIRouter

from app.api.v1 import auth, files, health, images, live, users, videos

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(images.router)
api_router.include_router(videos.router)
api_router.include_router(live.router)
api_router.include_router(files.router)
