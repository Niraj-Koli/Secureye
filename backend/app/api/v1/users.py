from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas.user import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead, summary="The signed-in user")
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
