from .schemas import MeResponse


async def get_me(db, user) -> MeResponse:
    return MeResponse(
        user_id=user.user_id,
        role=user.role,
        profile_id=user.profile_id,
        school_id=user.school_id,
    )