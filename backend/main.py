from contextlib import asynccontextmanager

import redis.asyncio as aioredis 
from arq import create_pool 
from arq.connections import RedisSettings
from supabase import acreate_client
from fastapi import FastAPI 
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.errors import register_error_handlers
from core.logging import setup_logging
from core.middleware import request_context_middleware
from db.pool import create_db_pool
from modules.submission.router import router as submission_router 
from providers.storage import get_storage_provider 



@asynccontextmanager
async def lifespan(app:FastAPI): 
    setup_logging()
    
    app.state.supabase = await acreate_client(settings.SUPABASE_URL,settings.SUPABASE_KEY)
    app.state.db = await create_db_pool()
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    app.state.arq = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    app.state.storage = get_storage_provider(app.state.supabase)
        
    yield
    
    await app.state.arq.close()
    await app.state.redis.aclose()
    await app.state.db.close()
    
def create_app() -> FastAPI : 
    
    is_prod = settings.ENV == "production"

    app = FastAPI(
        title="Joints API", version="1.0.0",
        lifespan=lifespan,
        docs_url=None if is_prod else "/docs",
        redoc_url=None if is_prod else "/redoc",
        openapi_url=None if is_prod else "/openapi.json",
    )
    
    app.middleware("http")(request_context_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    register_error_handlers(app)
    
    api ="/api/v1"
    app.include_router(submission_router, prefix=api) 
    

    @app.get("/health", tags=["health"])
    async def health(): 
        return {"status": "ok"}
    
    @app.get("/health/ready", tags=["health"])
    async def ready():
        try:
            await app.state.db.fetchval("select 1")
            await app.state.redis.ping()
        except Exception:
            return JSONResponse(status_code=503, content={"status": "not_ready"})
        return {"status": "ready"}
    
    return app


app = create_app()

