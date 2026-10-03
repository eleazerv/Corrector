"""ARQ task: nilai 1 mahasiswa (1 student_test) lewat pipeline LangGraph.

Alur:
  1. load student_test, cek siap (semua halaman OCR selesai & status cocok)
  2. buat baris grading_runs (status running). Unique index "1 running per student_test"
     -> job dobel otomatis ditolak DB.
  3. pilih thread_id checkpoint:
       - lanjutan run yang gagal (retry)  -> pakai thread_id lama (resume)
       - auto / regrade / manual baru     -> thread_id baru
  4. run_grading(...)  (persist ke test_answers + student_tests ada di node `persist`)
  5. tutup grading_runs (tokens, jumlah soal, dll). Trigger grading_runs yang
     menambahkan token ke school_plans / teacher_plans.

Error:
  TransientLlmError/Embedding (API down)  -> run 'failed', Retry job (resume checkpoint)
  lainnya / sudah MAX_TRIES               -> run 'failed', student_test 'failed'
"""



from dataclasses import dataclass, asdict
import uuid 
import json 
import time 
from uuid import UUID 

import asyncpg
import psycopg  #  error koneksi checkpointer (OperationalError) = sementara, di-retry
from arq import Retry

from core.logging import log
from pipeline import GradingDeps, run_grading, tokens_so_far
from providers.embedding import TransientEmbeddingError
from providers.llm import TransientLlmError
from providers.llm.base import PermanentLlmError

MAX_TRIES = 3
RETRY_BASE_DELAY = 60
GRADABLE_STATUSES = ["failed","grading", "graded", "reviewed", "published", "quota_exceeded"]
AUTO_STATUSES = ["grading"]  

class GradingError(Exception):
    """Error permanen saat grading (data tidak lengkap, soal tanpa kriteria, dll)."""


@dataclass
class StudentTestInfo:
    id: UUID
    class_test_id: UUID
    status: str
    total_pages: int
    pages_done: int
    school_id: UUID


@dataclass
class RunResult:
    status: str                 # succeeded | failed | quota_exceeded | skipped
    total_grade: float | None
    tokens_total: int
    questions_total: int
    questions_needs_review: int
    questions_error: int
    segment_method: str | None
    error: dict | None


LOAD_STUDENT_TEST_SQL = """
select st.id, st.class_test_id, st.status, st.total_pages, st.pages_done, c.school_id
from student_tests st
join class_tests ct on ct.id = st.class_test_id
join classes c on c.id = ct.class_id
where st.id = $1
"""

START_RUN_SQL = """
insert into grading_runs (student_test_id, thread_id, trigger_source, attempt, status, model)
values ($1, $2, $3, $4, 'running', $5)
on conflict do nothing
returning id
"""

FINISH_RUN_SQL = """
update grading_runs
set status = $2, finished_at = now(), tokens_total = $3, questions_total = $4,
    questions_needs_review = $5, questions_error = $6, total_grade = $7,
    segment_method = $8, error = $9
where id = $1 and status = 'running'"""

MARK_STUDENT_GRADING_SQL = """
update student_tests set status = 'grading' where id = $1 and status <> 'grading'

"""

MARK_STUDENT_FAILED_SQL = """
update student_tests set status = 'failed' where id = $1 and status = 'grading'

"""

MARK_STUDENT_QUOTA_EXCEEDED_SQL = """
update student_tests set status = 'quota_exceeded' where id = $1
"""

LAST_RUN_SQL = """
select thread_id, status, attempt from grading_runs
where student_test_id = $1 order by started_at desc limit 1
"""

THREAD_TOKENS_SQL = """
select coalesce(sum(tokens_total), 0) from grading_runs where thread_id = $1
"""


async def grade_student(ctx: dict, student_test_id: str, trigger_source: str = "auto", question_ids: list[str] | None = None ) -> dict:
    """question_ids: nilai ulang soal tertentu saja (jawaban soal lain tidak disentuh)."""
    try : 
        sid = UUID(student_test_id)
    except ValueError: 
        log.error("grade_student: id invalid %s", student_test_id)
        return {"student_test_id": student_test_id, "ok": False, "error": "invalid_id"}
    if trigger_source not in ("auto", "regrade", "manual", "retry"):
        trigger_source = "manual"
    
    job_try = ctx.get("job_try", 1)
    run_id: UUID | None = None
    try:
        return await _process(ctx, sid, trigger_source, job_try, question_ids)
    except (TransientLlmError, TransientEmbeddingError, psycopg.OperationalError) as e:  
        run_id = ctx.pop(f"_run:{sid}", None)
        tokens = await _failed_tokens(ctx, sid)
        if job_try >= MAX_TRIES:
            await _mark_failed(ctx, sid, run_id, f"transient after {job_try} tries: {e}", tokens)
            return {"student_test_id": student_test_id, "ok": False, "error": "max_tries"}
        await _finish_failed_run(ctx["db"], run_id, f"transient: {e}", tokens=tokens)
        raise Retry(defer=RETRY_BASE_DELAY * job_try)
    except Exception as e:
        run_id = ctx.pop(f"_run:{sid}", None)
        log.exception("grade_student %s error", sid)
        await _mark_failed(ctx, sid, run_id, repr(e), await _failed_tokens(ctx, sid))
        return {"student_test_id": student_test_id, "ok": False, "error": repr(e)[:500]}


async def _process(ctx: dict, student_test_id: UUID, trigger_source: str ,job_try : int ,question_ids: list[str]) -> dict:
    pool: asyncpg.Pool = ctx["db"]
    if ctx.get("llm") is None:
        raise GradingError("LLM belum di-setup di worker")

    st = await _load_student_test(pool, student_test_id)
    if st is None:
        return {"student_test_id": str(student_test_id), "skipped": "not_found"}
    if not _is_ready(st, trigger_source):
        return {"student_test_id": str(student_test_id), "skipped": f"not_ready:{st.status}"}

    if st.status != "grading":                      # regrade/manual dari status lain
        await pool.execute(MARK_STUDENT_GRADING_SQL, st.id)

    run_id, thread_id, prev_tokens = await _start_run(pool, st, trigger_source, job_try, ctx["llm"].model)
    if run_id is None:
        return {"student_test_id": str(student_test_id), "skipped": "already_running"}
    ctx[f"_run:{student_test_id}"] = run_id
    ctx[f"_thread:{student_test_id}"] = (thread_id, prev_tokens)

    await _publish(ctx, st, {"event": "grading_run_started", "run_id": str(run_id),
                             "trigger_source": trigger_source})
    started = time.monotonic()
    result = await _run_pipeline(ctx, st, run_id, thread_id, question_ids)
    # token yang sudah dicatat oleh run gagal sebelumnya (thread yang sama) tidak dihitung dua kali
    result.tokens_total = max(0, result.tokens_total - prev_tokens)
    await _finish_run(pool, run_id, st, result)
    ctx.pop(f"_run:{student_test_id}", None)
    ctx.pop(f"_thread:{student_test_id}", None)

    await _publish(ctx, st, {"event": "grading_run_finished", "status": result.status,
                             "total_grade": result.total_grade,
                             "needs_review": result.questions_needs_review > 0})
    log.info("grade_student %s %s total=%s tokens=%s %.1fs", student_test_id, result.status,
             result.total_grade, result.tokens_total, time.monotonic() - started)
    return {"student_test_id": str(student_test_id), "ok": result.status == "succeeded",
            **{k: v for k, v in asdict(result).items() if k != "error"}}


async def _load_student_test(pool: asyncpg.Pool, student_test_id: UUID) -> StudentTestInfo | None:
    row = await pool.fetchrow(LOAD_STUDENT_TEST_SQL, student_test_id)
    return StudentTestInfo(**dict(row)) if row else None



def _is_ready(st: StudentTestInfo, trigger_source: str ="auto") -> bool:
    if st.total_pages <= 0 or st.pages_done < st.total_pages:
        return False
    allowed = AUTO_STATUSES if trigger_source in ("auto", "retry") else GRADABLE_STATUSES
    return st.status in allowed

async def _start_run(pool: asyncpg.Pool, st: StudentTestInfo, trigger_source: str, attempt: int, model : str) -> UUID | None:
    last = await pool.fetchrow(LAST_RUN_SQL, st.id)
    resume = (last is not None and last["status"] == "failed" and last["thread_id"]
              and trigger_source in ("auto", "retry"))
    thread_id = last["thread_id"] if resume else f"{st.id}:{uuid.uuid4().hex[:12]}"
    attempt_no = (last["attempt"] + 1) if resume else attempt
    prev_tokens = int(await pool.fetchval(THREAD_TOKENS_SQL, thread_id)) if resume else 0
    run_id = await pool.fetchval(START_RUN_SQL, st.id, thread_id, trigger_source, attempt_no, model)
    return run_id, thread_id, prev_tokens

async def _run_pipeline(ctx: dict, st: StudentTestInfo, run_id: UUID, thread_id:str , question_ids: list[str] | None = None) -> RunResult:
    async def publish(payload: dict) -> None:
        await _publish(ctx, st, payload)
    deps = GradingDeps(pool=ctx["db"], llm=ctx["llm"], embedder=ctx.get("embedder"),
                       semaphore=ctx["llm_semaphore"], publish=publish)
    state = await run_grading(st.id, deps, checkpointer=ctx.get("checkpointer"), thread_id=thread_id,
                              question_ids=question_ids)
    
    results = state.get("results", [])
    if state.get("run_status") == "quota_exceeded":
        await ctx["db"].execute(MARK_STUDENT_QUOTA_EXCEEDED_SQL, st.id)
        return RunResult("quota_exceeded", None, int(state.get("tokens", 0) or 0), 0, 0, 0,
                         state.get("segment_method"), {"flags": state.get("flags", [])})
    
    return RunResult(
        status="succeeded" if state.get("run_status") == "graded" else "failed",
        total_grade=state.get("total_grade"),
        tokens_total=int(state.get("tokens", 0) or 0),
        questions_total=len(results),
        questions_needs_review=sum(1 for r in results if r.get("needs_review")),
        questions_error=sum(1 for r in results if r.get("error")),
        segment_method=state.get("segment_method"),
        error={"flags": state["flags"]} if state.get("flags") else None,
    )

async def _finish_run(pool: asyncpg.Pool, run_id: UUID, st: StudentTestInfo, result: RunResult) -> None:
    await pool.execute(
        FINISH_RUN_SQL, run_id, result.status, result.tokens_total, result.questions_total,
        result.questions_needs_review, result.questions_error, result.total_grade,
        result.segment_method, result.error,
    )

async def _finish_failed_run(pool: asyncpg.Pool, run_id: UUID | None, error: str,
                             tokens: int = 0) -> None:
    if run_id is None:
        return
    await pool.execute(FINISH_RUN_SQL, run_id, "failed", tokens, 0, 0, 0, None, None,
                       {"error": error[:1000]})


async def _mark_failed(ctx: dict, student_test_id: UUID, run_id: UUID | None, error: str, tokens :int = 0 ) -> None:
    try:
        await _finish_failed_run(ctx["db"], run_id, error, tokens)
        await ctx["db"].execute(MARK_STUDENT_FAILED_SQL, student_test_id)
        st = await _load_student_test(ctx["db"], student_test_id)
        if st:
            await _publish(ctx, st, {"event": "grading_failed", "error": error[:200]})
    except Exception:
        log.exception("grade_student: gagal mark failed %s", student_test_id)


async def _publish(ctx: dict, st: StudentTestInfo, payload: dict) -> None:
    """Event progres ke dosen via Redis pub/sub. Gagal publish != gagal job."""
    try:
        msg = {"student_test_id": str(st.id), **payload}
        await ctx["redis"].publish(f"class_test:{st.class_test_id}", json.dumps(msg, default=str))
    except Exception:
        log.warning("grade_student: publish gagal %s", st.id)


async def _failed_tokens(ctx: dict, student_test_id: UUID) -> int:
    """Token yang terpakai sebelum gagal (dari checkpoint), dikurangi yang sudah dicatat run lain."""
    thread_id, prev = ctx.pop(f"_thread:{student_test_id}", (None, 0))
    used = await tokens_so_far(ctx.get("checkpointer"), thread_id)
    return max(0, used - prev)
