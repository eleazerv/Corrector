"""Logika + SQL keberatan dari sisi DOSEN (ringkasan + rekomendasi AI ikut ditampilkan).
"""
from uuid import UUID

import asyncpg

from core.errors import AppError, conflict, not_found
from modules.review.service import apply_override      # fungsi yang KAMU tulis di modul review
from modules.shared import num

# SQL dipecah 3 potong supaya 2 query di bawah bisa memakai SELECT + ORDER yang sama
_SELECT = """
select c.id, c.status, c.complaint, c.ai_summary, c.ai_recommendation,
       c.teacher_response, c.resolved_at, c.student_test_id, c.test_answer_id,
       st.class_test_id, t.name as test_name,
       s.nim, s.name as student_name,
       q.number as question_number, q.max_points, ta.grade as current_grade
from student_complaints c
join student_tests st on st.id = c.student_test_id
join class_tests ct on ct.id = st.class_test_id
join classes cl on cl.id = ct.class_id
join tests t on t.id = ct.test_id
join students s on s.id = c.student_id
left join test_answers ta on ta.id = c.test_answer_id
left join test_questions q on q.id = ta.question_id
"""
# yang pending tampil paling atas
_ORDER = " order by (c.status = 'pending') desc, c.resolved_at desc nulls last, s.nim"

# `$2::text is null or c.status = $2` = filter opsional: kalau $2 None, semua status ikut
BY_CLASS_TEST_SQL = _SELECT + " where st.class_test_id = $1 and ($2::text is null or c.status = $2)" + _ORDER

# kotak masuk lintas ujian: semua ujian yang dosen ini koreksi / kelasnya dia ajar
INBOX_SQL = (_SELECT + " where (ct.corrector_id = $1 or cl.teacher_id = $1)"
             " and ($2::text is null or c.status = $2)" + _ORDER + " limit $3")

def _row(r) -> dict:
    """Record -> dict, kolom numeric dijadikan float."""
    return {**dict(r), "max_points": num(r["max_points"]), "current_grade": num(r["current_grade"])}


async def list_for_class_test(db, class_test_id: UUID, status: str | None) -> dict:
    """Keberatan 1 ujian + berapa yang masih pending."""
    rows = [_row(r) for r in await db.fetch(BY_CLASS_TEST_SQL, class_test_id, status)]
    return {"items": rows, "pending": sum(1 for r in rows if r["status"] == "pending")}


async def inbox(db, teacher_id: UUID, limit: int , status: str | None) -> dict:
    """Keberatan dari SEMUA ujian yang dosen ini pegang."""

    rows = [_row(r) for r in await db.fetch(INBOX_SQL,teacher_id,status,limit)]
    return {"items": rows, "pending": sum(1 for r in rows if r["status"] == "pending")}


async def resolve(db: asyncpg.Pool, complaint_id: UUID, teacher_id: UUID, status: str,
                  teacher_response: str, new_grade: float | None) -> dict:
    """Terima / tolak keberatan. Return dict berisi `override_id` (None kalau nilai tidak berubah).

    accepted + keberatan menunjuk soal -> nilai soal itu diganti lewat apply_override
    (jalur yang sama dengan override biasa, tapi complaint_id-nya terisi).
    """
    async with db.acquire() as conn, conn.transaction():
        c = await conn.fetchrow(
            "select id, status, test_answer_id from student_complaints where id = $1 for update",
            complaint_id)
        if c is None:
            raise not_found("Complaint")
        if c["status"] != "pending":
            raise conflict(f"Complaint is already {c['status']}")

        override = None      # tetap None kalau nilai tidak diubah

        if status == "accepted" and c["test_answer_id"] is not None:
            if new_grade is None:
                raise AppError("VALIDATION_ERROR", "new_grade is required when accepting this complaint", 422)

            override = await apply_override(
                conn,test_answer_id=c["test_answer_id"],teacher_id=teacher_id,new_grade=new_grade,reason=teacher_response,complaint_id=c["id"]
            )
        elif new_grade is not None:
            raise AppError("VALIDATION_ERROR",
                           "new_grade is only allowed when accepting a complaint about one question", 422)
        row =  await conn.fetchrow("""
                         update student_complaints
                         set status = $2 , teacher_response = $3 , resolved_at= now()
                         where id = $1
                         returning id , status , teacher_response, resolved_at,student_test_id, test_answer_id
                         """
                        ,complaint_id,status,teacher_response)

    return {**dict(row),
            "override_id": override.override_id if override else None,
            "new_grade": override.new_grade if override else None,
            "total_grade": override.total_grade if override else None}
