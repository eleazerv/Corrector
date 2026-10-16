from uuid import UUID

import asyncpg

from core.errors import not_found
from db.pool import as_user


async def _allowed(db: asyncpg.Pool, user, sql: str, target_id: UUID) -> bool:
    """Jalankan 1 fungsi SQL teacher_can_* atas nama user (auth.uid() terisi)."""
    async with as_user(db, user.user_id) as conn:
        return bool(await conn.fetchval(sql, target_id))


async def ensure_class_test_access(db: asyncpg.Pool, user, class_test_id: UUID) -> None:
    """ cek akses kelas dari guru """
    if not await _allowed(db, user, "select teacher_can_access_class_test($1)", class_test_id):
        raise not_found("Class test")


async def ensure_student_test_access(db: asyncpg.Pool, user, student_test_id: UUID) -> None:
    if not await _allowed(db, user, "select teacher_can_access_student_test($1)", student_test_id):
        raise not_found("Student test")


async def ensure_test_manage(db: asyncpg.Pool, user, test_id: UUID) -> None:
    if not await _allowed(db, user, "select teacher_can_manage_test($1)", test_id):
        raise not_found("Test")


async def ensure_test_answer_access(db: asyncpg.Pool, user, test_answer_id: UUID) -> UUID:
    """Return student_test_id pemilik jawaban ini (dipakai override untuk hitung ulang total)."""
    student_test_id = await db.fetchval(
        "select student_test_id from test_answers where id = $1", test_answer_id)
    if student_test_id is None:
        raise not_found("Test answer")
    await ensure_student_test_access(db, user, student_test_id)
    return student_test_id


async def ensure_complaint_access(db: asyncpg.Pool, user, complaint_id: UUID) -> UUID:
    """Return student_test_id dari keberatan ini."""
    student_test_id = await db.fetchval(
        "select student_test_id from student_complaints where id = $1", complaint_id)
    if student_test_id is None:
        raise not_found("Complaint")
    await ensure_student_test_access(db, user, student_test_id)
    return student_test_id
