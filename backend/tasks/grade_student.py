from dataclasses import dataclass
from uuid import UUID

import asyncpg
from arq import Retry

from core.logging import log

MAX_TRIES = 3
RETRY_BASE_DELAY = 60
GRADABLE_STATUSES = ["grading", "graded", "reviewed", "published", "quota_exceeded"]


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
"""

START_RUN_SQL = """
"""

FINISH_RUN_SQL = """
"""

MARK_STUDENT_GRADED_SQL = """
"""

MARK_STUDENT_FAILED_SQL = """
"""

MARK_STUDENT_QUOTA_EXCEEDED_SQL = """
"""


async def grade_student(ctx: dict, student_test_id: str, trigger_source: str = "auto") -> dict:
    pass


async def _process(ctx: dict, student_test_id: UUID, trigger_source: str) -> dict:
    pass


async def _load_student_test(pool: asyncpg.Pool, student_test_id: UUID) -> StudentTestInfo | None:
    pass


def _is_ready(st: StudentTestInfo) -> bool:
    pass


async def _start_run(pool: asyncpg.Pool, st: StudentTestInfo, trigger_source: str, attempt: int) -> UUID | None:
    pass


async def _run_pipeline(ctx: dict, st: StudentTestInfo, run_id: UUID) -> RunResult:
    pass


async def _finish_run(pool: asyncpg.Pool, run_id: UUID, st: StudentTestInfo, result: RunResult) -> None:
    pass


async def _mark_failed(ctx: dict, student_test_id: UUID, run_id: UUID | None, error: str) -> None:
    pass


async def _publish(ctx: dict, st: StudentTestInfo, payload: dict) -> None:
    pass