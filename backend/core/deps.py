from uuid import UUID 

import asyncpg 
from arq.connections import ArqRedis 
from fastapi import Depends , Header , Query , Request  
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel 
from supabase import AsyncClient

from core.config import settings 
from core.errors import AppError, forbidden 
from core.security import verify_supabase_token

from db.pool import as_user
from providers.storage.base import StorageProvider
 
def get_supabase(request: Request) -> AsyncClient:
    return request.app.state.supabase

def get_arq(request: Request) -> ArqRedis: 
    return request.app.state.arq

def get_redis(request: Request): 
    return request.app.state.redis


# auth
bearer = HTTPBearer(auto_error=False)

class CurrentUser(BaseModel): 
    user_id : UUID 
    role : str 
    profile_id : UUID 
    school_id : UUID 
    
    
RESOLVE_ROLE_SQL = """
select role, id, school_id from (
    select 1 as prio, 'school_admin' as role, id, school_id
      from school_admins where user_id = $1 and is_active
    union all
    select 2, 'teacher', id, school_id from teachers where user_id = $1
    union all
    select 3, 'student', id, school_id from students where user_id = $1
) r
order by prio
limit 1
"""

async def get_db(request: Request):
    async with request.app.state.db.acquire() as conn:
        yield conn

async def get_current_user(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    sb: AsyncClient = Depends(get_supabase),
) -> CurrentUser:
    
    if cred is None:
        raise AppError("UNAUTHORIZED", "Header Authorization not found", 401)

    auth_user = await verify_supabase_token(sb, cred.credentials)
    user_id = UUID(auth_user.id)

    row = await request.app.state.db.fetchrow(RESOLVE_ROLE_SQL, user_id)
    if row is None:
        raise forbidden("Account has not been activated yet")

    return CurrentUser(user_id=user_id, role=row["role"],
                       profile_id=row["id"], school_id=row["school_id"])

def require_role(*roles: str):
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise forbidden()
        return user
    return checker

TeacherUser = Depends(require_role("teacher"))
StudentUser = Depends(require_role("student"))
AdminUser = Depends(require_role("school_admin"))

import secrets

        
async def get_storage(request:Request) -> StorageProvider:
    return request.app.state.storage


# Pool admin (service role) untuk baca/tulis data di endpoint.
def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db


# EventSource di browser tidak bisa mengirim header Authorization,
# jadi endpoint SSE menerima token lewat ?access_token=... (header tetap diterima kalau ada).
async def get_current_user_sse(
    request: Request,
    access_token: str | None = Query(None),
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    sb: AsyncClient = Depends(get_supabase),
) -> CurrentUser:
    if cred is None and access_token:
        cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials=access_token)
    return await get_current_user(request, cred, sb)
