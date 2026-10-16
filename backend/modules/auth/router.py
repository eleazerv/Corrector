from fastapi import APIRouter, Depends, Request

from core.deps import CurrentUser, get_current_user

from . import service
from .schemas import MeResponse  


router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
)


@router.get("/me", response_model=MeResponse) 
async def get_me(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    return await service.get_me(
        request.app.state.db,
        user,
    )