"""Logika + SQL kalibrasi buta.

Tujuan: mengukur selisih nilai AI vs dosen SEBELUM dosen mempercayai hasil AI.
  1. GET    -> ~10 jawaban contoh, TANPA nilai AI dan TANPA identitas mahasiswa
  2. POST   -> dosen mengisi nilainya sendiri per jawaban
  3. result -> baru di sini nilai AI dibuka dan dibandingkan
Nilai kalibrasi TIDAK mengubah nilai mahasiswa (tabelnya terpisah: calibration_grades).
"""
from uuid import UUID

import asyncpg

from core.errors import AppError, not_found
from core.logging import log
from modules.shared import SIGNED_URL_TTL, num

# Contoh dipilih TETAP (urut md5 id jawaban), jadi dosen bisa berhenti lalu melanjutkan
# dan mendapat jawaban yang sama. Perhatikan: kolom grade (nilai AI) dan nama mahasiswa TIDAK dipilih.
SAMPLE_SQL = """
select ta.id as test_answer_id, ta.student_test_id, ta.answer_text, ta.bbox,
       q.id as question_id, q.number, q.question_type, q.question_text, q.key_answer, q.max_points,
       cg.teacher_grade
from test_answers ta
join student_tests st on st.id = ta.student_test_id
join test_questions q on q.id = ta.question_id
left join calibration_grades cg on cg.test_answer_id = ta.id and cg.teacher_id = $2
where st.class_test_id = $1
  and st.status in ('graded', 'reviewed', 'published')
  and ta.answer_status = 'answered'
  and q.question_type <> 'objective'
order by md5(ta.id::text)
limit $3
"""

CRITERIA_SQL = """
select qc.id, qc.question_id, qc.description, qc.points
from question_criteria qc
join test_questions q on q.id = qc.question_id
join class_tests ct on ct.test_id = q.test_id
where ct.id = $1 order by qc.id
"""

PAGES_SQL = """
select tp.student_test_id, tp.page_no, tp.image_path
from test_pages tp join student_tests st on st.id = tp.student_test_id
where st.class_test_id = $1 and tp.student_test_id = any($2::uuid[])
order by tp.page_no
"""


async def _sign(storage, path: str) -> str | None:
    """sama dengan yang kamu tulis di review dan student."""
    try:
        return await storage.signed_url(path, SIGNED_URL_TTL)
    except Exception as e:
        log.warning("calibration: signed_url gagal %s: %s", path, e)
        return None


async def sample(db, storage, class_test_id: UUID, teacher_id: UUID, n: int) -> dict:
    """Jawaban contoh untuk dinilai dosen, tanpa nilai AI dan tanpa nama mahasiswa."""
    rows = await db.fetch(SAMPLE_SQL, class_test_id, teacher_id, n)
    
    data = await db.fetch(CRITERIA_SQL,class_test_id)
    criteria: dict[str, list[dict]] = {}
    for d in data : 
        criteria.setdefault(d["question_id"],[]).append(
            {"id":d["id"], "description": d["description"],"points":num(d["points"])})

    pages: dict[tuple, str] = {}
    for p in await db.fetch(PAGES_SQL, class_test_id, list({r["student_test_id"] for r in rows})):
        pages[(p["student_test_id"], p["page_no"])] = p["image_path"]

    items = []
    for r in rows:
        wanted = sorted({b.get("page_no") for b in (r["bbox"] or []) if isinstance(b, dict)} - {None})
        if not wanted:
            wanted = sorted(no for (sid, no) in pages if sid == r["student_test_id"])
        images = [{"page_no": no, "image_url": await _sign(storage, pages[(r["student_test_id"], no)])}
                  for no in wanted if (r["student_test_id"], no) in pages]


        items.append(
            {
                "test_answer_id": r["test_answer_id"],
                "question": { 
                    "number": num(r["number"]),
                    "type": r["question_type"],
                    "text": r["question_text"], 
                    "key_answer": r["key_answer"],
                    "max_points": num(r["max_points"]),
                    "criteria": criteria.get(r["question_id"],[])
                    },
                "answer_text" : r["answer_text"],
                "pages": images, 
                "teacher_grade": num(r["teacher_grade"]),  
                
            }
    
        )
  
    done = sum(1 for i in items if i["teacher_grade"] is not None)
    return {"total": len(items), "done": done, "items": items}


async def save_grade(db: asyncpg.Pool, class_test_id: UUID, teacher_id: UUID, body) -> dict:
    """Simpan / perbarui nilai dosen untuk 1 jawaban."""
    async with db.acquire() as conn, conn.transaction():
       
        row = await conn.fetchrow(
            """select q.max_points
               from test_answers ta
               join test_questions q on q.id = ta.question_id
               join student_tests st on st.id = ta.student_test_id
               where ta.id = $1 and st.class_test_id = $2""",
            body.test_answer_id, class_test_id)
        if row is None:
            raise not_found("Test answer")
        max_points = float(row["max_points"])
        if body.teacher_grade > max_points + 1e-9:
            raise AppError("VALIDATION_ERROR", f"teacher_grade must be between 0 and {max_points:g}", 422)

      
        await conn.execute("""insert into calibration_grades (test_answer_id, teacher_id, teacher_grade, teacher_criteria_result)
                           values ($1, $2, $3, $4)
                           on conflict (test_answer_id, teacher_id)
                           do update set teacher_grade = excluded.teacher_grade, teacher_criteria_result = excluded.teacher_criteria_result
                           """,
                           body.test_answer_id, teacher_id, body.teacher_grade, body.teacher_criteria_result
                           )
        
    return {"test_answer_id": body.test_answer_id, "teacher_grade": body.teacher_grade}


RESULT_SQL = """
select cg.test_answer_id, q.number, q.max_points, cg.teacher_grade,
       coalesce((select o.old_grade from grade_overrides o
                 where o.test_answer_id = ta.id order by o.created_at limit 1), ta.grade) as ai_grade
from calibration_grades cg
join test_answers ta on ta.id = cg.test_answer_id
join student_tests st on st.id = ta.student_test_id
join test_questions q on q.id = ta.question_id
where st.class_test_id = $1 and cg.teacher_id = $2
order by q.number
"""


async def result(db, class_test_id: UUID, teacher_id: UUID) -> dict:
    """Banding nilai dosen vs AI. diff = ai - dosen (negatif = AI lebih pelit)."""
    items = []
    for r in await db.fetch(RESULT_SQL, class_test_id, teacher_id):
        teacher = float(r["teacher_grade"])
        ai = num(r["ai_grade"])
        mx = float(r["max_points"])
        if ai is None:                      
            continue
        diff = round(ai - teacher, 2)
        items.append({
            "test_answer_id": r["test_answer_id"],
            "question_number": r["number"],
            "max_points": mx,
            "teacher_grade": teacher,
            "ai_grade": ai,
            "diff": diff,
            "diff_pct": round(diff / mx * 100, 1) if mx else 0.0,
        })

    n = len(items)
    if n == 0:
        return {"count": 0, "items": [], "summary": None}

    # 
    summary = {
        "mean_teacher_pct": round(sum(i["teacher_grade"] / i["max_points"] for i in items) / n * 100, 1),
        "mean_ai_pct": round(sum(i["ai_grade"] / i["max_points"] for i in items) / n * 100, 1),
        "mean_diff_pct": round(sum(i["diff_pct"] for i in items) / n, 1),
        "mae_pct": round(sum(abs(i["diff_pct"]) for i in items) / n, 1),
        "within_10_pct": sum(1 for i in items if abs(i["diff_pct"]) <= 10),
    }
    return {"count": n, "items": items, "summary": summary}
