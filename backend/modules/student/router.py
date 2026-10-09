"""Rute MAHASISWA: nilai sendiri dan keberatan.

GET  /me/tests                                  daftar ujian yang nilainya sudah dirilis
GET  /me/tests/{student_test_id}                detail nilai sendiri per soal
POST /me/tests/{student_test_id}/complaints     ajukan keberatan
GET  /me/complaints                             status keberatan sendiri

Hanya kolom aman yang keluar dari sini (lihat dto.py). Rubrik tidak pernah ikut.

Beda besar dengan router dosen: di sini TIDAK ADA ensure_...(). Pengecekan "ini milik siapa"
dilakukan service lewat user.profile_id (id baris di tabel students).
"""
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from core import jobs
from core.deps import CurrentUser, StudentUser, get_arq, get_pool, get_storage
from core.logging import log
from core.ratelimit import rate_limit

from . import service
from .schemas import ComplaintIn

router = APIRouter(tags=["student"])

@router.get("/me/tests")
async def my_tests(user: CurrentUser = StudentUser, db: asyncpg.Pool = Depends(get_pool)):
    return await service.my_tests(db, user.profile_id)

@router.get("/me/tests/{student_test_id}")
async def my_test_detail(
    student_test_id: UUID,
    user: CurrentUser = StudentUser,
    db: asyncpg.Pool = Depends(get_pool),
    storage=Depends(get_storage),
):
    return await service.my_test_detail(db, storage, student_test_id, user.profile_id)

@router.post("/me/tests/{student_test_id}/complaints", status_code=201, dependencies=[Depends(rate_limit("complaint", 3))])
async def create_complaint(
    student_test_id: UUID,
    body: ComplaintIn,
    user: CurrentUser = StudentUser,
    db: asyncpg.Pool = Depends(get_pool),
    arq=Depends(get_arq),
):
    row = await service.create_complaint(db, student_test_id, user.profile_id, body.test_answer_id, body.complaint.strip())
    try :
        await jobs.enqueue_summarize_complaint(arq, row["id"])
    except Exception as e :
        log.warning("create_complaint %s: failed to enqueue summarize_complaint: %s", row["id"], e)
    return row


@router.get("/me/complaints")
async def getComplaints(user: CurrentUser = StudentUser, db: asyncpg.Pool = Depends(get_pool)):
    return await service.my_complaints(db, user.profile_id)