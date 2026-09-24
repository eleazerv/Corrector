# app/core/security.py
from supabase import AsyncClient
from supabase_auth.errors import AuthApiError   # versi lama: from gotrue.errors import AuthApiError
from supabase_auth.types import User

from core.errors import AppError


async def verify_supabase_token(sb: AsyncClient, token: str) -> User:
    """Minta Supabase Auth memverifikasi token, return user-nya."""
    try:
        res = await sb.auth.get_user(token)
    except AuthApiError:
        raise AppError("UNAUTHORIZED", "Token is not valid or expired", 401)

    if res is None or res.user is None:
        raise AppError("UNAUTHORIZED", "Token is not valid", 401)
    return res.user