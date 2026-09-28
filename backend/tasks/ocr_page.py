import asyncio
import json

from providers.storage.base import StorageNotFound 
from providers.ocr.base import PermanentOcrError, TransientOcrError
from dataclasses import asdict, dataclass , is_dataclass
from uuid import UUID
 
import asyncpg
from arq import Retry
 
from core.logging import log

OCR_TIMEOUT_SEC = 180
MIN_TEXT_CHARS = 5
MAX_TRIES = 3
RETRY_BASE_DELAY = 30
CLAIMABLE_STATUSES = ["pending", "failed", "processing"]
GRADING_QUEUE = "joints:default" 


@dataclass
class PageInfo:
    id: UUID
    status: str
    image_path: str
    student_test_id: UUID
    class_test_id: UUID
 
 
@dataclass
class SaveResult:
    pages_done: int
    total_pages: int
    all_done: bool

LOAD_PAGE_SQL= """
select tp.id , tp.status , tp.image_path, tp.student_test_id , st.class_test_id
from test_pages tp 
join student_tests st on st.id = tp.student_test_id 
where tp.id = $1
"""

CLAIM_PAGE_SQL = """
update test_pages 
set status = 'processing', error = null 
where id = $1 and status = any($2::text[])
returning id 
"""

MARK_STUDENT_PROCESSING_SQL = """
update student_tests
set status = 'ocr_processing'
where id = $1 and status = 'ocr_queued'
"""


LOCK_STUDENT_TEST_SQL = """
select id, total_pages, status
from student_tests
where id = $1
for update
"""

SAVE_PAGE_SQL = """
update test_pages 
set status = 'success', ocr_result = $2, error = null 
where id = $1
"""

COUNT_DONE_SQL = """
select count(*)
from test_pages 
where student_test_id = $1 and status = 'success'
"""

UPDATE_PAGES_DONE_SQL = """
update student_tests set pages_done =$2 where id = $1
"""

MARK_STUDENT_GRADING_SQL ="""
update student_tests set status = 'grading' where id = $1
"""

MARK_PAGE_SQL = """
update test_pages set status = $2, error = $3 where id = $1
"""

MARK_STUDENT_REUPLOAD_SQL = """
update student_tests set status = 'needs_reupload' where id = $1
"""

async def ocr_page(ctx: dict, page_id: str) -> dict:
    try : 
        pid = UUID(page_id)
    except ValueError :
        log.error("ocr_page: page_id is not uuid %s", page_id)
        return {"page_id": page_id, "ok": False, "error": "invalid_page_id"}   
    
    job_try = ctx.get("job_try",1)
    
    try: 
        return await _process(ctx, pid)
    except TransientOcrError as e : 
        if job_try >= MAX_TRIES :
            await _mark_failed(ctx, pid, f"transient after {job_try} tries: {e}")
            return {"page_id": page_id, "ok": False, "error": "max_tries"}

        await ctx["db"].execute(MARK_PAGE_SQL,pid,"pending", str(e)[:1000])
        raise Retry(defer=RETRY_BASE_DELAY * job_try)
    except StorageNotFound as e:
        await _mark_failed(ctx, pid, str(e))   # file hilang, retry percuma
        return {"page_id": page_id, "ok": False, "error": "image_not_found"}
    except PermanentOcrError as e :
        await _mark_failed(ctx, pid,str(e))
        return {"page_id": page_id, "ok": False, "error": str(e)[:1000]}
    except Exception as e : 
        log.exception("ocr_page %s unexpected error", page_id)
        await _mark_failed(ctx, pid, repr(e))
        raise
    
async def _process(ctx: dict, page_id: UUID) -> dict:
    pool : asyncpg.Pool = ctx["db"]
    
    page = await _load_page(pool, page_id)
    if page is None :
        log.warning("ocr_page %s : page not found", page_id)
        return {"page_id": str(page_id), "skipped": "not_found"}
    if page.status == "success":
        return {"page_id": str(page_id), "skipped": "success"}
    
    if not await _claim_page(pool,page): 
        return {"page_id": str(page_id), "skipped": "not_claimable"}
    # update status ke processing 
    await _publish(ctx, page, {"event": "page_processing"})
    # download dari storage
    image_bytes = await ctx["storage"].download(page.image_path)
    # Ocr Process 
    blocks = await _run_ocr(ctx["ocr"],image_bytes)
    
    if _is_empty(blocks):
        await _mark_needs_reupload(pool,page)
        await _publish(ctx, page, {"event": "page_needs_reupload"})
        return {"page_id": str(page_id), "skipped": "empty"}
    
    result = await _save_result_and_count(pool,page,blocks)
    
    await _after_commit(ctx, page, result)
    return { 
        "page_id": str(page_id),
        "ok": True,
        "blocks": len(blocks),
        "pages_done": result.pages_done,
        "total_pages": result.total_pages,
        "enqueued_grading": result.all_done,
    }
            

async def _load_page(pool: asyncpg.Pool, page_id: UUID) -> PageInfo | None:
    row = await pool.fetchrow(LOAD_PAGE_SQL, page_id)
    return PageInfo(**dict(row)) if row else None

async def _claim_page(pool, page):
    async with pool.acquire() as conn, conn.transaction():
        claimed = await conn.fetchval(CLAIM_PAGE_SQL, page.id, CLAIMABLE_STATUSES)
        if claimed is None:
            return False
        await conn.execute(MARK_STUDENT_PROCESSING_SQL, page.student_test_id)
    return True

async def _run_ocr(ocr, image_bytes: bytes) -> list:
    try:
        return await asyncio.wait_for(ocr.extract(image_bytes), timeout=OCR_TIMEOUT_SEC)
    except asyncio.TimeoutError as e:
        raise TransientOcrError(f"ocr timeout > {OCR_TIMEOUT_SEC}s") from e

def _block_text(block) -> str : 
    text = getattr(block, "text", None)
    if text is None and isinstance(block, dict) :
        text = block.get("text")
    return text or ""

def _is_empty(blocks: list) -> bool:
    total = sum(len(_block_text(b).strip()) for b in blocks)
    return total < MIN_TEXT_CHARS

def _to_dict(block) -> dict : 
    if is_dataclass(block): 
        return asdict(block)
    if hasattr(block,"model_dump"): 
        return block.model_dump()
    return dict(block)

async def _mark_needs_reupload(pool, page):
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(MARK_PAGE_SQL, page.id, "needs_reupload", "ocr returned no text")
        await conn.execute(MARK_STUDENT_REUPLOAD_SQL, page.student_test_id)
        
async def _save_result_and_count(pool: asyncpg.Pool, page: PageInfo, blocks: list) -> SaveResult:
    payload = [_to_dict(b) for b in blocks]     
    async with pool.acquire() as conn , conn.transaction() : 
        st = await conn.fetchrow(LOCK_STUDENT_TEST_SQL, page.student_test_id)
        await conn.execute(SAVE_PAGE_SQL, page.id , payload)
        done = await conn.fetchval(COUNT_DONE_SQL,page.student_test_id)
        await conn.execute(UPDATE_PAGES_DONE_SQL, page.student_test_id, done)
        
        all_done = done >= st["total_pages"]
        
        if all_done :
            await conn.execute(MARK_STUDENT_GRADING_SQL, page.student_test_id
    )
        
    return SaveResult(total_pages=st["total_pages"],pages_done=done, all_done=all_done)        
        


async def _after_commit(ctx: dict, page: PageInfo, result: SaveResult) -> None:
    await _publish(ctx, page, {
        "event":"page_done",
        "pages_done": result.pages_done,
        "total_pages": result.total_pages,
    })
    if result.all_done:
        await ctx["redis"].enqueue_job(
            "grade_student",
            str(page.student_test_id),
            _job_id=f"grade:{page.student_test_id}",
            _queue_name=GRADING_QUEUE,
        )
        await _publish(ctx,page, {"event": "grading_queued"})


async def _mark_failed(ctx: dict, page_id: UUID, error: str) -> None:
    try : 
        await ctx["db"].execute(MARK_PAGE_SQL, page_id, "failed", error[:1000])
        page = await _load_page(ctx["db"], page_id)
        if page : 
            await _publish(ctx, page, {"event": "page_failed", "error": error[:200]})
    except Exception as e :
        log.exception("ocr_page: gagal mark failed %s", page_id)



async def _publish(ctx: dict, page: PageInfo, payload: dict) -> None:
    """Push progress ke SSE /events lewat Redis pub/sub. Gagal publish != gagal job."""
    try:
        msg = {
            "page_id": str(page.id),
            "student_test_id": str(page.student_test_id),
            **payload,
        }
        await ctx["redis"].publish(f"class_test:{page.class_test_id}", json.dumps(msg))
    except Exception:
        log.warning("ocr_page: publish gagal untuk page %s", page.id)
 