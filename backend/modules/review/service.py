"""Logika + SQL modul review (dosen memeriksa hasil AI).

PENTING: bentuk data di sini untuk DOSEN (ada rubrik, kunci, catatan internal grader).
Jangan dipakai ulang untuk mahasiswa.

"""
import asyncio
from uuid import UUID

import asyncpg

from core.errors import AppError, conflict, not_found
from core.logging import log
from modules.shared import SHEET_GRADED, SIGNED_URL_TTL, num

from . import schemas
#  detail 1 lembar

SHEET_SQL = """
select st.id, st.status, st.total_grade, st.needs_review, st.total_pages, st.pages_done,
       st.class_test_id, ct.status as class_test_status,
       s.id as student_id, s.nim, s.name as student_name,
       t.id as test_id, t.name as test_name, t.max_score
from student_tests st
join students s on s.id = st.student_id
join class_tests ct on ct.id = st.class_test_id
join tests t on t.id = ct.test_id
where st.id = $1
"""

PAGES_SQL = """
select id, page_no, image_path, status, error, ocr_result
from test_pages where student_test_id = $1 order by page_no
"""

# semua SOAL ujian, jawaban boleh belum ada (lembar belum selesai dinilai)
QUESTIONS_WITH_ANSWERS_SQL = """
select q.id as question_id, q.number, q.question_type, q.question_text, q.max_points, q.key_answer,
       ta.id as answer_id, ta.answer_status, ta.answer_text, ta.bbox, ta.grade, ta.criteria_result,
       ta.grading_internal, ta.student_feedback, ta.confidence_grading, ta.needs_review, ta.ocr_issue
from test_questions q
left join test_answers ta on ta.question_id = q.id and ta.student_test_id = $1
where q.test_id = $2
order by q.number
"""

CRITERIA_SQL = """
select qc.id, qc.question_id, qc.description, qc.points
from question_criteria qc join test_questions q on q.id = qc.question_id
where q.test_id = $1
order by qc.id
"""

# override TERAKHIR per jawaban
LAST_OVERRIDES_SQL = """
select distinct on (o.test_answer_id)
       o.id, o.test_answer_id, o.old_grade, o.new_grade, o.reason, o.created_at, o.complaint_id,
       t.name as teacher_name
from grade_overrides o join teachers t on t.id = o.teacher_id
where o.student_test_id = $1
order by o.test_answer_id, o.created_at desc
"""


async def _sign(storage, path: str) -> str | None:
    """Signed URL 1 foto. Gagal -> None (1 foto hilang tidak boleh membuat halaman review gagal dibuka)."""
    try:
        url = await storage.signed_url(path,SIGNED_URL_TTL)
    except Exception as e :
        log.warning("sign url failed %s: %s", path, e)
        return None
    return url

def _merge_criteria(result, criteria: list[dict]) -> list[dict]:
    """Tempelkan deskripsi kriteria ke hasil per kriteria.

    `result`   = test_answers.criteria_result, list of dict: {"criterion_id", "points", "max_points", ...}
                 (bisa None kalau soal belum dinilai)
    `criteria` = kriteria soal itu: [{"id", "description", "points"}]
    Return     = list yang sama, tiap item ditambah key "description".
    """
    desc = {}
    for c in criteria :
        desc[str(c["id"])] = c["description"]

    out = []
    for item in result or []:
        cid = str(item.get("criterion_id",""))
        text = desc.get(cid)
        if text is None and cid.startswith("auto"):
            text = "Jawaban sesuai kunci jawaban"
        out.append({**item,"description": text})
    return out

async def sheet_detail(db, storage, student_test_id: UUID, include_ocr: bool = False) -> dict:
    """Semua yang dibutuhkan halaman review 1 mahasiswa. """
    sheet = await db.fetchrow(SHEET_SQL, student_test_id)
    if sheet is None:
        raise not_found("Student test")

    # 4 query sekaligus (tidak saling bergantung, jadi boleh paralel)
    page_rows, q_rows, c_rows, o_rows = await asyncio.gather(
        db.fetch(PAGES_SQL, student_test_id),
        db.fetch(QUESTIONS_WITH_ANSWERS_SQL, student_test_id, sheet["test_id"]),
        db.fetch(CRITERIA_SQL, sheet["test_id"]),
        db.fetch(LAST_OVERRIDES_SQL, student_test_id),
    )

    pages = []
    urls = await asyncio.gather(*(_sign(storage,p["image_path"])for p in page_rows))
    for p , url in zip(page_rows,urls):
        page = {
            "id": p["id"],
            "page_no": p["page_no"],
            "status": p["status"],
            "error": p["error"],
            "image_url": url,
        }
        if include_ocr:
            page["ocr_blocks"] = p["ocr_result"] or []
        pages.append(page)

    # kriteria dikelompokkan per soal: {"<question_id>": [{"id","description","points"}, ...]}
    criteria: dict[str, list[dict]] = {}
    for c in c_rows:
        criteria.setdefault(str(c["question_id"]), []).append(
            {"id": c["id"], "description": c["description"], "points": num(c["points"])})
    overrides = {o["test_answer_id"]: o for o in o_rows}       # {answer_id: baris override terakhir}

    answers = []
    for q in q_rows:
        crit = criteria.get(str(q["question_id"]),[])
        ov = overrides.get(q["answer_id"])
        answers.append({
            "id": q["answer_id"],
            "question": {
                "id": q["question_id"],
                "number": q["number"],
                "type": q["question_type"],
                "text": q["question_text"],
                "max_points": num(q["max_points"]),
                "key_answer": q["key_answer"],
                "criteria": crit,
            },
            "answer_status": q["answer_status"],
            "answer_text": q["answer_text"],
            "grade": num(q["grade"]),
            "confidence_grading":num(q["confidence_grading"]),
            "needs_review": bool(q["needs_review"]),
            "ocr_issue": bool(q["ocr_issue"]),
            "criteria_result": _merge_criteria(q["criteria_result"], crit),
            "bbox": q["bbox"] or [],
            "student_feedback": q["student_feedback"],
            "grading_internal": q["grading_internal"],
            "override": None if ov is None else {
                "id": ov["id"],
                "old_grade": num(ov["old_grade"]),
                "new_grade": num(ov["new_grade"]),
                "reason": ov["reason"],
                "by": ov["teacher_name"],
                "at": ov["created_at"],
                "complaint_id": ov["complaint_id"],
            }
        })

    return {
        "id": sheet["id"], "status": sheet["status"], "total_grade": num(sheet["total_grade"]),
        "needs_review": sheet["needs_review"],
        "pages_done": sheet["pages_done"], "total_pages": sheet["total_pages"],
        "class_test": {"id": sheet["class_test_id"], "status": sheet["class_test_status"]},
        "student": {"id": sheet["student_id"], "nim": sheet["nim"], "name": sheet["student_name"]},
        "test": {"id": sheet["test_id"], "name": sheet["test_name"], "max_score": num(sheet["max_score"])},
        "pages": pages, "answers": answers,
    }


# `for update of ta` = kunci baris jawaban ini sampai transaksi selesai,
# supaya 2 override bersamaan tidak saling menimpa old_grade
ANSWER_FOR_OVERRIDE_SQL = """
select ta.id, ta.grade, ta.student_test_id, q.max_points, st.status
from test_answers ta
join test_questions q on q.id = ta.question_id
join student_tests st on st.id = ta.student_test_id
where ta.id = $1
for update of ta
"""

# total & needs_review lembar SELALU dihitung ulang dari semua jawaban
RECALC_SHEET_SQL = """
update student_tests st
set total_grade = sub.total, needs_review = sub.any_review
from (select coalesce(sum(grade), 0) as total, coalesce(bool_or(needs_review), false) as any_review
      from test_answers where student_test_id = $1) sub
where st.id = $1
returning st.total_grade, st.needs_review
"""


async def apply_override(conn: asyncpg.Connection, *, test_answer_id: UUID, teacher_id: UUID,
                         new_grade: float, reason: str, complaint_id: UUID | None = None) -> schemas.OverrideOut:
    """Ganti nilai 1 soal. HARUS dipanggil di dalam transaksi (parameter-nya `conn`, bukan pool).

    Satu-satunya jalur ubah nilai oleh dosen: dipakai override biasa DAN keberatan yang diterima.
    """

    row = await conn.fetchrow(ANSWER_FOR_OVERRIDE_SQL, test_answer_id)
    if row is None :
        raise not_found("test_answer")
    if row["status"] not in SHEET_GRADED:
        raise conflict(f"Cannot override a sheet with status {row['status']}")
    max_points = float(row["max_points"])
    if new_grade < 0 or new_grade > max_points + 1e-9:
        raise AppError("VALIDATION_ERROR", f"new_grade must be between 0 and {max_points:g}", 422)
    override_id =await conn.fetchval (
            """insert into grade_overrides
                (student_test_id, test_answer_id, complaint_id, teacher_id, reason, old_grade, new_grade)
                values($1,$2,$3,$4,$5,$6,$7)
                returning id""",
            row["student_test_id"],test_answer_id,complaint_id ,teacher_id,reason, row["grade"],new_grade)
    await conn.execute(
        """ update test_answers set grade = $1, needs_review = false where id = $2 """,
        new_grade,test_answer_id)
    sheet = await conn.fetchrow(RECALC_SHEET_SQL, row["student_test_id"])

    return schemas.OverrideOut(
        override_id=override_id,
        test_answer_id=test_answer_id,
        student_test_id=row["student_test_id"],
        old_grade=num(row["grade"]),
        new_grade=new_grade,
        total_grade=num(sheet["total_grade"]),
        needs_review=sheet["needs_review"],
    )


async def approve_sheet(db: asyncpg.Pool, student_test_id: UUID) -> dict:
    """Dosen menyatakan lembar ini sudah diperiksa: status reviewed, semua tanda review dicabut."""
    async with db.acquire () as conn, conn.transaction() :
        student_test = await conn.fetchrow("""update student_tests set status = 'reviewed' , needs_review=false where id = $1 and status in('graded','reviewed')
                                returning id, status, total_grade""",student_test_id)
        if not student_test:
            student_test_status = await  conn.fetchval(" select status from student_tests where id = $1",student_test_id)
            if student_test_status is None:
                raise not_found("Student test")
            raise conflict(f"Only graded sheets can be approved (status : {student_test_status})")
        await conn.execute(""" update test_answers set needs_review = false where student_test_id = $1""",student_test_id )
        return {"student_test_id": student_test_id , "status": student_test["status"], "total_grade":num(student_test["total_grade"])}


REGRADABLE = ("graded", "reviewed", "failed", "quota_exceeded")

STUDENT_TEST_FOR_REGRADE_SQL = """
select st.status, st.total_pages, st.pages_done, ct.test_id
from student_tests st join class_tests ct on ct.id = st.class_test_id
where st.id = $1
"""


async def check_regradable(db, student_test_id: UUID, question_ids: list[UUID] | None) -> None:
    """Syarat nilai ulang. Dicek di API supaya dosen dapat pesan jelas,
    bukan job yang diam-diam dilewati worker. Tidak mengembalikan apa-apa; gagal = raise."""
    st = await db.fetchrow(STUDENT_TEST_FOR_REGRADE_SQL,student_test_id)
    if not st :
        raise not_found("student test")
    if st["status"] not in REGRADABLE :
        raise conflict(f"Cannot regrade a sheet with status {st['status']}")
    if st["total_pages"] <= 0 or st["pages_done"] < st["total_pages"] :
        raise conflict("OCR not complete")
    if question_ids is not None:
        valid ={r["id"]for r in await db.fetch("select id from test_questions where test_id = $1", st["test_id"])}
        unkown = [str(q) for q in question_ids if q not in valid ]
        if unkown:
            raise AppError("VALIDATION_ERROR","question_ids not in this test",422, {"unknown":unkown})

# lembar yang boleh dicoba lagi: statusnya ada di $2 DAN OCR-nya sudah lengkap
RETRYABLE_SHEETS_SQL = """
select id from student_tests
where class_test_id = $1 and status = any($2::text[])
  and total_pages > 0 and pages_done >= total_pages
"""

RUNS_SQL = """
select gr.id, gr.student_test_id, s.nim, s.name as student_name, gr.trigger_source, gr.attempt,
       gr.status, gr.model, gr.segment_method, gr.tokens_total, gr.questions_total,
       gr.questions_needs_review, gr.questions_error, gr.total_grade, gr.error,
       gr.started_at, gr.finished_at,
       round(extract(epoch from (gr.finished_at - gr.started_at)) * 1000)::bigint as duration_ms
from grading_runs gr
join student_tests st on st.id = gr.student_test_id
join students s on s.id = st.student_id
where st.class_test_id = $1
order by gr.started_at desc
limit $2
"""


async def grading_runs(db, class_test_id: UUID, limit: int) -> dict:
    """Log run 1 ujian + ringkasan token dan jumlah yang gagal."""
    rows = [{**dict(r), "total_grade": num(r["total_grade"])}
            for r in await db.fetch(RUNS_SQL, class_test_id, limit)]

    return {"items": rows, "tokens_total": sum(r["tokens_total"] or 0 for r in rows), "failed": sum(r["status"] == "failed" for r in rows)}
