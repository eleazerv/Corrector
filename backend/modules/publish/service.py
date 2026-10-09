"""Logika + SQL modul publish (rilis nilai ke mahasiswa, ekspor CSV).
"""
import csv
import io
from uuid import UUID

import asyncpg

from core.errors import AppError, conflict, not_found
from modules.shared import SHEET_IN_PROGRESS, num

# 1 baris per status: {"status": "graded", "n": 12, "review": 3}
#   n      = jumlah lembar berstatus itu
#   review = berapa di antaranya yang bertanda needs_review
STATUS_COUNT_SQL = """
select status, count(*) as n, count(*) filter (where needs_review) as review
from student_tests where class_test_id = $1 group by status
"""


async def publish(db: asyncpg.Pool, class_test_id: UUID, allow_needs_review: bool) -> dict:
    """Rilis nilai. Boleh dipanggil lagi nanti untuk lembar yang menyusul (susulan / reupload).

    Ditolak (409) kalau:
      - masih ada lembar yang sedang OCR / dinilai
      - tidak ada lembar yang bisa dirilis
      - ada lembar bertanda needs_review dan allow_needs_review = false
    """
    async with db.acquire() as conn, conn.transaction():
        if await conn.fetchval("select id from class_tests where id = $1 for update", class_test_id) is None:
            raise not_found("Class test")
        rows = await conn.fetch(STATUS_COUNT_SQL, class_test_id)
        counts = {r["status"]: r["n"] for r in rows}
        busy = {s: counts[s] for s in SHEET_IN_PROGRESS if counts.get(s)}
        if busy :
            raise AppError("CONFLICT","some answer sheets are still being processed",409,{"in_progress": busy})
        ready = counts.get("graded",0) + counts.get("reviewed",0)
        if ready == 0 :
            raise conflict("No graded answer sheets to publish")
        flagged = sum(r["review"] for r in rows if r["status"] == "graded")
        if flagged and not allow_needs_review:
            raise AppError("NEEDS_REVIEW", f"{flagged} answer sheet(s) still need review", 409,
                        {"needs_review": flagged, "hint": "review them, or send allow_needs_review=true"})

        published = await conn.fetch(
        """update student_tests set status = 'published'
            where class_test_id = $1 and status in ('graded', 'reviewed') returning id""", class_test_id)
        head = await conn.fetchrow("update class_tests set status = 'published', published_at = coalesce(published_at, now()) where id = $1 returning status, published_at",class_test_id)

    not_published = {s: counts[s] for s in counts if s not in {"graded", "reviewed", "published"}}
    return {
        "class_test_id": class_test_id, "status": head["status"], "published_at": head["published_at"],
        "published_now": len(published), "published_total": len(published) + counts.get("published", 0),
        "not_published": not_published
    }


EXPORT_SHEETS_SQL = """
select st.id, s.nim, s.name, st.status, st.total_grade
from student_tests st join students s on s.id = st.student_id
where st.class_test_id = $1
order by s.nim
"""

EXPORT_QUESTIONS_SQL = """
select q.id, q.number, q.max_points
from test_questions q join class_tests ct on ct.test_id = q.test_id
where ct.id = $1 order by q.number
"""

EXPORT_ANSWERS_SQL = """
select ta.student_test_id, ta.question_id, ta.grade
from test_answers ta join student_tests st on st.id = ta.student_test_id
where st.class_test_id = $1
"""


async def export_csv(db, class_test_id: UUID) -> str:
    """1 baris per mahasiswa: nim, nama, status, total, lalu nilai tiap soal.

    Contoh hasil:
        nim,name,status,total_grade,q1 (max 10),q2 (max 20)
        2501,Budi,published,25,10,15
        2502,Sari,failed,,,
    """

    sheets, questions = await db.fetch(EXPORT_SHEETS_SQL, class_test_id), await db.fetch(EXPORT_QUESTIONS_SQL, class_test_id)
    grades = {(r["student_test_id"],r["question_id"]): num(r["grade"]) for r in await db.fetch(EXPORT_ANSWERS_SQL, class_test_id) if r["grade"] is not None}
    buf = io.StringIO()
    w =csv.writer(buf)
    w.writerow(["nim", "name", "status", "total_grade"] + [f"q{q['number']} (max {q['max_points']})" for q in questions])
    for s in sheets:
        w.writerow([s["nim"], s["name"], s["status"], s["total_grade"]] + [grades.get((s["id"], q["id"]), "") for q in questions])
    return "\ufeff" + buf.getvalue()