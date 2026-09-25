import json 

from contextlib import asynccontextmanager
from urllib.parse import urlparse 
from uuid import UUID 
import asyncpg 

from core.config import settings 


async def _init_conn(conn:asyncpg.Connection) -> None : 
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


def _uses_transaction_pooler(dsn: str) -> bool:
    """Supabase pooler mode transaction (port 6543) tidak mendukung prepared statement cache."""
    return urlparse(dsn).port == 6543

async def create_db_pool (dsn: str | None = None , * , min_size: int = 2 , max_size : int = 10 ) -> asyncpg.Pool : 
    dsn = dsn or settings.DATABASE_URL
    return await asyncpg.create_pool(
        dsn=dsn,
        min_size=min_size,
        max_size=max_size,
        init=_init_conn,
        command_timeout=30,
        max_inactive_connection_lifetime=300,
        statement_cache_size=0 if _uses_transaction_pooler(dsn) else 100,
        server_settings={"application_name": f"joints-{settings.ENV}"},
    )

@asynccontextmanager
async def as_user(pool: asyncpg.Pool, user_id: UUID):
    """    
    Pinjam koneksi yang berjalan ATAS NAMA user → semua policy RLS berlaku,
    dan auth.uid() di SQL mengembalikan user_id ini.
    """
    
    claims = json.dumps({"sub": str(user_id), "role": "authenticated"})
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("set local role authenticated")
            await conn.execute("select set_config('request.jwt.claims', $1, true)", claims)
            await conn.execute("select set_config('request.jwt.claim.sub', $1, true)", str(user_id))
            yield conn
            
