"""Kalibrasi buta: dosen menilai tanpa melihat nilai AI, lalu dibandingkan. Untuk DOSEN.

GET  /class-tests/{id}/calibration            contoh jawaban (tanpa nilai AI, tanpa nama mahasiswa)
POST /class-tests/{id}/calibration            simpan nilai dosen untuk 1 jawaban
GET  /class-tests/{id}/calibration/result     perbandingan dosen vs AI
"""
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.access import ensure_class_test_access
from core.deps import CurrentUser, TeacherUser, get_pool, get_storage
from core.ratelimit import rate_limit

from . import service
from .schemas import CalibrationIn

router = APIRouter(tags=["calibration"])

@router.get("/class-tests/{class_test_id}/calibration")
async def sample(
    class_test_id: UUID,
    n: int = Query(10, ge=1, le=30, description="jumlah jawaban contoh"),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    storage=Depends(get_storage),
):
    await ensure_class_test_access(db, user, class_test_id)
    return await service.sample(db, storage, class_test_id, user.profile_id, n)


@router.post("/class-tests/{class_test_id}/calibration",
             dependencies=[Depends(rate_limit("calibration", 60))])
async def save_grade(
    class_test_id: UUID,
    body: CalibrationIn,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    await ensure_class_test_access(db, user, class_test_id)
    return await service.save_grade(db, class_test_id, user.profile_id, body)


@router.get("/class-tests/{class_test_id}/calibration/result")
async def result(
    class_test_id: UUID,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    await ensure_class_test_access(db, user, class_test_id)
    return await service.result(db, class_test_id, user.profile_id)
