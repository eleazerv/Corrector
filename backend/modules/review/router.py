"""Review hasil AI oleh DOSEN.

GET  /student-tests/{id}                  detail 1 lembar: foto, jawaban, nilai, alasan, bbox
POST /test-answers/{id}/override          ganti nilai 1 soal + alasan  -> memicu build_trait
POST /student-tests/{id}/approve          tandai lembar sudah diperiksa
POST /student-tests/{id}/regrade          nilai ulang (semua / soal tertentu)
POST /class-tests/{id}/grade              coba lagi semua lembar yang gagal dinilai
GET  /class-tests/{id}/grading-runs       log run: token, durasi, status, error

LATIHAN: 6 endpoint, makin ke bawah makin banyak yang kamu tulis sendiri.
  Endpoint 1 = contoh lengkap.   2-3 = isi badan fungsinya.   4-5 = tulis parameter + badan.
  6 = tulis semuanya dari deskripsi.

Ingat 6 pertanyaan tiap endpoint:
  1) method + URL   2) data dari client   3) role   4) alat (db / storage / arq)
  5) id mana yang dicek aksesnya   6) fungsi service mana yang dipanggil
"""
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from core import jobs
from core.access import ensure_class_test_access, ensure_student_test_access, ensure_test_answer_access
from core.deps import CurrentUser, TeacherUser, get_arq, get_pool, get_storage
from core.logging import log
from core.ratelimit import rate_limit

from . import service
from .schemas import OverrideIn, OverrideOut, RegradeIn

router = APIRouter(tags=["review"])
regrade_limit = Depends(rate_limit("regrade", 5))       # 5 per menit per user


@router.get("/student-tests/{student_test_id}")
async def sheet_detail(
    student_test_id: UUID,
    include_ocr: bool = Query(False, description="true = sertakan blok OCR mentah per halaman"),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    storage=Depends(get_storage),
):
    """Bentuk response DOSEN (ada rubrik, kunci jawaban, grading_internal)."""
    await ensure_student_test_access(db, user, student_test_id)
    return await service.sheet_detail(db, storage, student_test_id, include_ocr)


@router.post("/student-tests/{student_test_id}/approve")
async def approve(
    student_test_id: UUID,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    await ensure_student_test_access(db,user,student_test_id)
    return await service.approve_sheet(db,student_test_id)

@router.post("/test-answers/{test_answer_id}/override", response_model=OverrideOut)
async def override_grade(
    test_answer_id: UUID,
    body: OverrideIn,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    arq=Depends(get_arq),
):
    """Dosen cukup mengisi nilai baru + alasan. Trait dosen dipelajari di belakang layar."""
    await ensure_test_answer_access(db,user,test_answer_id)
    async with db.acquire() as conn, conn.transaction(): 
        result = await service.apply_override(conn,test_answer_id=test_answer_id,teacher_id=user.profile_id,new_grade=body.new_grade,reason=body.reason.strip())
    
    try: 
        await jobs.enqueue_build_trait(arq,result.override_id)
    except Exception as e : 
        log.warning("build_trait failed to enqueue override_id = %s  %s",result.override_id,e)
    
    return result 
    


@router.get("/class-tests/{class_test_id}/grading-runs")
async def grading_runs(

    class_test_id:UUID, 
    limit:int = Query(200, ge=1, le=1000),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),   
    
):
    await ensure_class_test_access(db,user,class_test_id=class_test_id)
    return await service.grading_runs(db, class_test_id, limit)


@router.post("/student-tests/{student_test_id}/regrade", status_code=202, dependencies=[regrade_limit])
async def regrade(
    student_test_id: UUID ,
    body: RegradeIn | None = None,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool), 
    arq=Depends(get_arq)
):
    """202 = masuk antrean, belum selesai. Pantau lewat /progress atau /events."""
    await ensure_student_test_access(db,user,student_test_id)
    question_ids = body.question_ids if body else None
    await service.check_regradable(db, student_test_id, question_ids)
    queued = await jobs.enqueue_grade_student(arq, student_test_id,"regrade",question_ids)
    return {"student_test_id": student_test_id, "queued": queued}



@router.post("/class-tests/{class_test_id}/grade",status_code=202,dependencies=[regrade_limit])
async def regrade_class(
  class_test_id: UUID, 
  db: asyncpg.Pool=Depends(get_pool),
  include_quota_exceeded: bool = False,  
  arq=Depends(get_arq),
  user:CurrentUser = TeacherUser
):
    await ensure_class_test_access(db,user,class_test_id)
    statuses = ["failed"]
    if include_quota_exceeded:
        statuses.append("quota_exceeded")
    ids = await db.fetch(service.RETRYABLE_SHEETS_SQL, class_test_id, statuses)
    queued = 0
    for row in ids:
        queued += await jobs.enqueue_grade_student(arq, row["id"], "manual")
    return {"class_test_id": class_test_id, "found": len(ids), "queued": queued}