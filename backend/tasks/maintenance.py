from dataclasses import dataclass
from uuid import UUID

import asyncpg

from core.logging import log

STUCK_PAGE_MINUTES = 15          # halaman 'processing' lebih lama dari ini dianggap macet
STUCK_QUEUED_MINUTES = 30        # halaman 'pending' tanpa diproses
STUCK_GRADING_MINUTES = 30       # student_test 'grading' tanpa grading_run yang berjalan
BATCH_LIMIT = 200


@dataclass
class ReconcileReport:
    pages_requeued: int
    grading_requeued: int
    runs_marked_failed: int
    class_tests_updated: int


FIND_STUCK_PAGES_SQL = """
"""

RESET_STUCK_PAGES_SQL = """
"""

FIND_STUCK_GRADING_SQL = """
"""

FAIL_ORPHAN_RUNS_SQL = """
"""

FIX_PAGES_DONE_SQL = """
"""

UPDATE_CLASS_TEST_STATUS_SQL = """
"""


async def requeue_stuck(ctx: dict) -> dict:
    pass


async def reconcile_status(ctx: dict) -> dict:
    pass


async def refresh_plans(ctx: dict) -> dict:
    pass


async def _requeue_stuck_pages(ctx: dict) -> int:
    pass


async def _requeue_stuck_grading(ctx: dict) -> int:
    pass


async def _fail_orphan_runs(pool: asyncpg.Pool) -> int:
    pass


async def _fix_pages_done(pool: asyncpg.Pool) -> int:
    pass


async def _update_class_test_status(pool: asyncpg.Pool) -> int:
    pass

async def sweep_checkpoints(ctx: dict) -> dict:
    """Hapus checkpoint LangGraph dari grading run yang sudah selesai (tidak akan di-resume lagi)."""
    pool = ctx["db"]
    # 1. ambil thread_id yang boleh dihapus (pakai limit per batch)
    # 2. delete dari checkpoint_writes, checkpoint_blobs, checkpoints (urutan ini)
    # 3. return {"threads_swept": n}