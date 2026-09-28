from arq import cron
from arq.connections import RedisSettings

from core.config import settings
from core.logging import log, setup_logging
from core.queues import DEFAULT_QUEUE,OCR_QUEUE
from db.pool import create_db_pool
from providers.ocr import get_ocr_provider 
from providers.storage import get_storage_provider 


from tasks.build_trait import build_trait
from tasks.grade_student import grade_student
from tasks.ingest_zip import ingest_zip
from tasks.maintenance import reconcile_status, refresh_plans, requeue_stuck
from tasks.ocr_page import MAX_TRIES as OCR_MAX_TRIES
from tasks.ocr_page import ocr_page
from tasks.summarize_complaint import summarize_complaint
import asyncio
from supabase import acreate_client

REDIS = RedisSettings.from_dsn(settings.REDIS_URL)
DEFAULT_MAX_JOBS = 10 
OCR_MAX_JOBS = 1 



async def _init_common (ctx: dict, pool_size: int) -> None : 
    """ worker perlu semua : logging , DB , supabase , storage"""
    setup_logging()
    ctx["db"] = await create_db_pool(min_size=1, max_size=10)
    ctx["supabase"] = await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    ctx["storage"] = get_storage_provider(ctx["supabase"])
    
    
async def _close_common (ctx:dict) -> None : 
    """" kalo worker selesai tutup semua yang ada di _init_common"""
    pool = ctx.get("db")
    if pool is not None:
        await pool.close()


async def startup(ctx: dict) -> None:
    """Dipanggil sekali saat worker umum start."""
    await _init_common(ctx, pool_size=DEFAULT_MAX_JOBS)
    ctx["llm_semaphore"] = asyncio.Semaphore(settings.LLM_CONCURRENCY)
    ctx["llm"] = None            # TODO: get_llm_provider()
    ctx["embedder"] = None       # TODO: get_embedding_provider()
    ctx["checkpointer"] = None   # TODO: LangGraph Postgres checkpointer
    log.info("worker started queue=%s max_jobs=%s", DEFAULT_QUEUE, DEFAULT_MAX_JOBS)
     
    

async def shutdown(ctx: dict) -> None:
    """ dipanggil saat mo tutup worker""" 
    #TODO: tutup checkpointer 
    #TODO: tutup client llm/embedder 
    await _close_common(ctx)
    log.info("worker stopped queue=%s", DEFAULT_QUEUE)


async def startup_ocr(ctx: dict) -> None:
    await _init_common(ctx, pool_size=2)
    ctx["ocr"] = get_ocr_provider()
    await ctx["ocr"].start()
    log.info("ocr worker started queue=%s provider=%s", OCR_QUEUE, ctx["ocr"].name)


async def shutdown_ocr(ctx: dict) -> None:
    ocr = ctx.get("ocr")
    if ocr is not None : 
        await ocr.close()
    await _close_common(ctx)
    log.info("ocr worker stopped queue=%s", OCR_QUEUE)
class WorkerSettings:
    functions = [ingest_zip, grade_student, build_trait, summarize_complaint]
    cron_jobs = [
        cron(requeue_stuck, minute=set(range(0, 60, 5))),
        cron(reconcile_status, minute=set(range(0, 60, 10))),
        cron(refresh_plans, hour={0}, minute={5}),
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = REDIS
    queue_name = DEFAULT_QUEUE
    max_jobs = DEFAULT_MAX_JOBS 
    max_tries = 3
    job_timeout = 600


class OcrWorkerSettings:
    functions = [ocr_page]
    on_startup = startup_ocr
    on_shutdown = shutdown_ocr
    redis_settings = REDIS
    queue_name = OCR_QUEUE
    max_jobs = OCR_MAX_JOBS
    max_tries = OCR_MAX_TRIES
    job_timeout = 300