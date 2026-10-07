"""Logika + SQL rute MAHASISWA.

Tiap query difilter DUA hal sekaligus: milik mahasiswa yang login (student_id) DAN lembar
sudah dirilis (status = 'published'). Lembar orang lain / belum dirilis -> 404.
Bentuk keluaran selalu lewat dto.py (daftar putih).
"""
import asyncio
from uuid import UUID

import asyncpg

from core.errors import conflict, not_found
from core.logging import log
from modules.shared import SIGNED_URL_TTL, num

from . import dto

LIST_SQL = """
select st.id as student_test_id, t.name as test_name, t.test_type,
       sub.name as subject_name, sub.code as subject_code, c.name as class_name,
       st.total_grade, t.max_score, ct.test_date, ct.published_at
from student_tests st
join class_tests ct on ct.id = st.class_test_id
join tests t on t.id = ct.test_id
join subjects sub on sub.id = t.subject_id
join classes c on c.id = ct.class_id
where st.student_id = $1 and st.status = 'published'
order by ct.published_at desc nulls last, t.name
"""

OWN_SHEET_SQL = """
select st.id, st.total_grade, ct.test_id, ct.published_at, ct.test_date,
       t.name as test_name, t.max_score, sub.name as subject_name
from student_tests st
join class_tests ct on ct.id = st.class_test_id
join tests t on t.id = ct.test_id
join subjects sub on sub.id = t.subject_id
where st.id = $1 and st.student_id = $2 and st.status = 'published'
"""

QUESTIONS_SQL = """
select q.number, q.question_text, q.max_points,
       ta.id as answer_id, ta.answer_status, ta.answer_text, ta.bbox, ta.grade, ta.student_feedback,
       exists (select 1 from grade_overrides o where o.test_answer_id = ta.id) as adjusted
from test_questions q
left join test_answers ta on ta.question_id = q.id and ta.student_test_id = $1
where q.test_id = $2
order by q.number
"""

PAGES_SQL = "select page_no, image_path from test_pages where student_test_id = $1 order by page_no"

SHEET_COMPLAINTS_SQL = """
select id, test_answer_id, status from student_complaints
where student_test_id = $1 and student_id = $2
"""


async def my_tests(db, student_id: UUID) -> dict:
    """[CONTOH] Daftar ujian yang nilainya sudah dirilis."""
    rows = await db.fetch(LIST_SQL, student_id)
    return {"items": [{**dict(r), "total_grade": num(r["total_grade"]), "max_score": num(r["max_score"])}
                      for r in rows]}


async def _own_sheet(db, student_test_id: UUID, student_id: UUID):
    """ Ambil lembar INI kalau memang milik mahasiswa ini dan sudah dirilis; selain itu 404.

    Ini pengganti ensure_... untuk mahasiswa: pengecekan aksesnya ada di WHERE query-nya sendiri.
    """
    sheet = await db.fetchrow(OWN_SHEET_SQL, student_test_id, student_id)
    if sheet is None:
        raise not_found("Test result")
    return sheet


async def _sign(storage, path: str) -> str | None:
    """Signed URL 1 foto. Gagal -> None."""
    try: 
        url = await storage.signed_url(path,SIGNED_URL_TTL)
    except Exception as e : 
        log.warning("sign url failed %s %s",path,e)
        return None 
    return url 


async def my_test_detail(db, storage, student_test_id: UUID, student_id: UUID) -> dict:
    """Detail nilai sendiri per soal + foto lembar + keberatan yang sudah diajukan."""
    
    sheet = await _own_sheet(db,student_test_id,student_id)
    q_rows = await db.fetch(QUESTIONS_SQL,student_test_id,sheet["test_id"]) 
    page_rows = await db.fetch(PAGES_SQL,student_test_id)
    complaints = await db.fetch(SHEET_COMPLAINTS_SQL,student_test_id,student_id)
    urls = await asyncio.gather(*(_sign(storage, p["image_path"]) for p in page_rows))

    row = {"student_test_id":student_test_id,
           "test_name": sheet["test_name"],
           "subject_name": sheet["subject_name"],
           "test_date": sheet["test_date"],
           "published_at": sheet["published_at"],
           "total_grade": num(sheet["total_grade"]),
           "max_score": num(sheet["max_score"]),
           "pages": [{"page_no": p["page_no"], "image_url": u} for p, u in zip(page_rows, urls)],
           "answers": [dto.answer_out(q, bool(q["adjusted"])) for q in q_rows],
           "complaints": [dict(c) for c in complaints],
           }    

    return row 


async def create_complaint(db: asyncpg.Pool, student_test_id: UUID, student_id: UUID,
                           test_answer_id: UUID | None, text: str) -> dict:
    """Keberatan hanya untuk lembar sendiri yang sudah dirilis. 1 keberatan pending per soal."""
    await _own_sheet(db, student_test_id, student_id)

    async with db.acquire() as conn, conn.transaction():
        if test_answer_id is not None:
            belongs = await conn.fetchval(
                "select 1 from test_answers where id = $1 and student_test_id = $2",
                test_answer_id, student_test_id)
            if not belongs:
                raise not_found("Test answer")

        complaint = await conn.fetchval("""select 1 from student_complaints where student_test_id = $1 and student_id = $2 and status = 'pending' and test_answer_id is not distinct from $3 
                      """,student_test_id,student_id,test_answer_id)
        if complaint: 
            raise conflict("You already have a pending complaint for this item")
        
        row = await conn.fetchrow(""" insert into student_complaints(student_id, student_test_id, test_answer_id,complaint,status)
                                  values($1,$2,$3,$4,'pending')
                                  returning id, student_test_id, test_answer_id, complaint, status""",
                                  student_id,student_test_id,test_answer_id,text)

    return dict(row)


MY_COMPLAINTS_SQL = """
select c.id, c.student_test_id, c.test_answer_id, c.complaint, c.status,
       c.teacher_response, c.resolved_at,
       t.name as test_name, q.number as question_number
from student_complaints c
join student_tests st on st.id = c.student_test_id
join class_tests ct on ct.id = st.class_test_id
join tests t on t.id = ct.test_id
left join test_answers ta on ta.id = c.test_answer_id
left join test_questions q on q.id = ta.question_id
where c.student_id = $1
order by (c.status = 'pending') desc, c.resolved_at desc nulls last
"""


async def my_complaints(db, student_id: UUID) -> dict:
    """Status semua keberatan milik mahasiswa ini."""

    complaints = await db.fetch(MY_COMPLAINTS_SQL,student_id)
    return {"items": [dict(c) for c in complaints]}
