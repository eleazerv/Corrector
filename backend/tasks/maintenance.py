"""
Cron maintenance (didaftarkan di core/worker.py -> WorkerSettings.cron_jobs).

  requeue_stuck     tiap 5 menit  : selamatkan halaman OCR & lembar grading yang macet
  reconcile_status  tiap 10 menit : rapikan pages_done, status student_tests & class_tests
  refresh_plans     tiap hari     : panggil refresh_school_plans() (paket habis -> ended)
  sweep_checkpoints tiap hari     : hapus checkpoint LangGraph run yang sudah selesai

Semua aman dijalankan berulang (idempotent): job yang masih hidup di Redis tidak di-enqueue
lagi (cek lewat core.jobs.*_job_alive), dan baris yang diproses di-"sentuh" (updated_at=now)
supaya tidak diambil lagi di putaran berikutnya.
"""
from uuid import UUID

import asyncpg

from core import jobs
from core.logging import log

STUCK_PAGE_MINUTES = 15          # halaman 'processing' lebih lama dari ini dianggap macet
STUCK_QUEUED_MINUTES = 30        # halaman 'pending' tanpa diproses
STUCK_GRADING_MINUTES = 30       # student_test 'grading' tanpa grading_run yang berjalan
ORPHAN_RUN_MINUTES = 30          # grading_run 'running' lebih lama dari ini (job_timeout cuma 10 menit)
BATCH_LIMIT = 200

SWEEP_SUCCEEDED_DAYS = 1         # checkpoint run sukses / quota / skipped dihapus setelah 1 hari
SWEEP_FAILED_DAYS = 7            # run gagal disimpan 7 hari (masih mungkin di-resume)
SWEEP_MAX_BATCHES = 10


# halaman macet: 'processing' > 15 menit ATAU 'pending' > 30 menit
FIND_STUCK_PAGES_SQL = """
select tp.id
from test_pages tp
join student_tests st on st.id = tp.student_test_id
where st.status in ('ocr_queued', 'ocr_processing')
  and (
        (tp.status = 'processing' and tp.updated_at < now() - make_interval(mins => $1))
     or (tp.status = 'pending'    and tp.updated_at < now() - make_interval(mins => $2))
  )
order by tp.updated_at
limit $3
"""

# sentuh updated_at supaya halaman yang sama tidak di-enqueue lagi di putaran berikutnya
RESET_STUCK_PAGES_SQL = """
update test_pages set updated_at = now() where id = any($1::uuid[])
"""

# lembar 'grading' yang semua halamannya sudah OCR, tapi tidak ada run yang berjalan
FIND_STUCK_GRADING_SQL = """
select st.id
from student_tests st
where st.status = 'grading'
  and st.total_pages > 0
  and st.pages_done >= st.total_pages
  and st.updated_at < now() - make_interval(mins => $1)
  and not exists (
        select 1 from grading_runs g
        where g.student_test_id = st.id and g.status = 'running'
  )
order by st.updated_at
limit $2
"""

TOUCH_STUDENT_TESTS_SQL = """
update student_tests set updated_at = now() where id = any($1::uuid[])
"""

# run 'running' yang ditinggal worker mati (crash / container di-kill) -> failed
FAIL_ORPHAN_RUNS_SQL = """
update grading_runs
set status = 'failed', finished_at = now(),
    error = jsonb_build_object('error', 'orphan run: worker berhenti sebelum selesai (requeue_stuck)')
where status = 'running'
  and started_at < now() - make_interval(mins => $1)
returning id
"""

# hitung ulang pages_done dari halaman yang benar-benar success
FIX_PAGES_DONE_SQL = """
with done as (
  select tp.student_test_id, count(*) filter (where tp.status = 'success')::int as n
  from test_pages tp
  group by tp.student_test_id
)
update student_tests st
set pages_done = least(d.n, st.total_pages)
from done d
where d.student_test_id = st.id
  and st.status in ('ocr_queued', 'ocr_processing', 'grading', 'needs_reupload', 'failed')
  and st.pages_done <> least(d.n, st.total_pages)
returning st.id
"""

# semua halaman sudah OCR tapi status masih ocr_* (worker mati di antara simpan & enqueue)
PROMOTE_TO_GRADING_SQL = """
update student_tests
set status = 'grading'
where status in ('ocr_queued', 'ocr_processing')
  and total_pages > 0
  and pages_done >= total_pages
returning id
"""

# class_test 'processing' -> 'reviewing' kalau tidak ada lagi lembar yang sedang diproses
UPDATE_CLASS_TEST_STATUS_SQL = """
update class_tests ct
set status = 'reviewing'
where ct.status = 'processing'
  and exists (select 1 from student_tests st where st.class_test_id = ct.id)
  and not exists (
        select 1 from student_tests st
        where st.class_test_id = ct.id
          and st.status in ('ocr_queued', 'ocr_processing', 'grading')
  )
returning ct.id
"""

REFRESH_PLANS_SQL = "select refresh_school_plans()"

CHECKPOINT_TABLES_EXIST_SQL = "select to_regclass('public.checkpoints') is not null"

# thread yang SEMUA run-nya sudah selesai & cukup lama, dan masih punya checkpoint
SWEEPABLE_THREADS_SQL = """
select g.thread_id
from grading_runs g
where exists (select 1 from checkpoints c where c.thread_id = g.thread_id)
group by g.thread_id
having bool_and(g.status <> 'running')
   and bool_and(
         case when g.status = 'failed'
              then g.finished_at < now() - make_interval(days => $2)
              else g.finished_at < now() - make_interval(days => $1)
         end)
limit $3
"""


# ------------------------------------------------------------------ cron
async def requeue_stuck(ctx: dict) -> dict:
    """Tiap 5 menit. Urutan penting: run yatim ditutup dulu, baru lembar 'grading' dicek."""
    pool: asyncpg.Pool = ctx["db"]
    runs_failed = await _fail_orphan_runs(pool)
    pages = await _requeue_stuck_pages(ctx)
    grading = await _requeue_stuck_grading(ctx)
    result = {"runs_marked_failed": runs_failed, "pages_requeued": pages, "grading_requeued": grading}
    if runs_failed or pages or grading:
        log.info("requeue_stuck %s", result)
    return result


async def reconcile_status(ctx: dict) -> dict:
    """Tiap 10 menit: perbaiki angka & status yang tidak sinkron."""
    pool: asyncpg.Pool = ctx["db"]
    fixed = await _fix_pages_done(pool)
    promoted = await _promote_to_grading(ctx)
    class_tests = await _update_class_test_status(pool)
    result = {"pages_done_fixed": fixed, "grading_enqueued": promoted, "class_tests_updated": class_tests}
    if fixed or promoted or class_tests:
        log.info("reconcile_status %s", result)
    return result


async def refresh_plans(ctx: dict) -> dict:
    """Tiap hari: paket lewat end_date -> ended, paket paused yang sudah dibayar -> on."""
    await ctx["db"].execute(REFRESH_PLANS_SQL)
    log.info("refresh_plans done")
    return {"ok": True}


async def sweep_checkpoints(ctx: dict) -> dict:
    """Hapus checkpoint LangGraph dari grading run yang sudah selesai (tidak akan di-resume lagi)."""
    pool: asyncpg.Pool = ctx["db"]
    if not await pool.fetchval(CHECKPOINT_TABLES_EXIST_SQL):
        return {"threads_swept": 0, "skipped": "no_checkpoint_tables"}

    total = 0
    for _ in range(SWEEP_MAX_BATCHES):
        threads = [r["thread_id"] for r in await pool.fetch(
            SWEEPABLE_THREADS_SQL, SWEEP_SUCCEEDED_DAYS, SWEEP_FAILED_DAYS, BATCH_LIMIT)]
        if not threads:
            break
        async with pool.acquire() as conn, conn.transaction():
            # urutan: writes -> blobs -> checkpoints
            await conn.execute("delete from checkpoint_writes where thread_id = any($1::text[])", threads)
            await conn.execute("delete from checkpoint_blobs where thread_id = any($1::text[])", threads)
            await conn.execute("delete from checkpoints where thread_id = any($1::text[])", threads)
        total += len(threads)
        if len(threads) < BATCH_LIMIT:
            break
    if total:
        log.info("sweep_checkpoints threads=%s", total)
    return {"threads_swept": total}


# ------------------------------------------------------------------ helpers
async def _requeue_stuck_pages(ctx: dict) -> int:
    pool: asyncpg.Pool = ctx["db"]
    rows = await pool.fetch(FIND_STUCK_PAGES_SQL, STUCK_PAGE_MINUTES, STUCK_QUEUED_MINUTES, BATCH_LIMIT)
    if not rows:
        return 0
    arq = ctx["redis"]
    requeued: list[UUID] = []
    for r in rows:
        page_id = r["id"]
        if await jobs.ocr_job_alive(arq, page_id):     # masih antre / sedang jalan / di-defer Retry
            continue
        # ocr_page bisa meng-claim status pending/failed/processing, jadi status tidak perlu direset
        if await jobs.enqueue_ocr_page(arq, page_id, again=True):
            requeued.append(page_id)
    if requeued:
        await pool.execute(RESET_STUCK_PAGES_SQL, requeued)
    return len(requeued)


async def _requeue_stuck_grading(ctx: dict) -> int:
    pool: asyncpg.Pool = ctx["db"]
    rows = await pool.fetch(FIND_STUCK_GRADING_SQL, STUCK_GRADING_MINUTES, BATCH_LIMIT)
    return await _enqueue_grading(ctx, [r["id"] for r in rows])


async def _promote_to_grading(ctx: dict) -> int:
    ids = [r["id"] for r in await ctx["db"].fetch(PROMOTE_TO_GRADING_SQL)]
    return await _enqueue_grading(ctx, ids)


async def _enqueue_grading(ctx: dict, student_test_ids: list[UUID]) -> int:
    """trigger 'retry': boleh dari status 'grading', dan resume thread run gagal kalau ada."""
    if not student_test_ids:
        return 0
    arq = ctx["redis"]
    enqueued: list[UUID] = []
    for sid in student_test_ids:
        if await jobs.grade_job_alive(arq, sid):
            continue
        if await jobs.enqueue_grade_student(arq, sid, "retry"):
            enqueued.append(sid)
    if enqueued:
        await ctx["db"].execute(TOUCH_STUDENT_TESTS_SQL, enqueued)
    return len(enqueued)


async def _fail_orphan_runs(pool: asyncpg.Pool) -> int:
    return len(await pool.fetch(FAIL_ORPHAN_RUNS_SQL, ORPHAN_RUN_MINUTES))


async def _fix_pages_done(pool: asyncpg.Pool) -> int:
    return len(await pool.fetch(FIX_PAGES_DONE_SQL))


async def _update_class_test_status(pool: asyncpg.Pool) -> int:
    return len(await pool.fetch(UPDATE_CLASS_TEST_STATUS_SQL))
