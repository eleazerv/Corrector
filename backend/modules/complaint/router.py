"""Keberatan mahasiswa dari sisi DOSEN.

GET  /complaints                        kotak masuk semua ujian yang dosen ini pegang
GET  /class-tests/{id}/complaints       keberatan 1 ujian + ringkasan & rekomendasi AI
POST /complaints/{id}/resolve           terima / tolak

(Pengajuan oleh mahasiswa ada di modules/student.)
"""
from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query
from core.ratelimit import rate_limit

from core import jobs
from core.access import ensure_class_test_access, ensure_complaint_access
from core.deps import CurrentUser, TeacherUser, get_arq, get_pool
from core.logging import log

from . import service
from .schemas import ResolveIn

router = APIRouter(tags=["complaint"])
StatusFilter = Literal["pending", "accepted", "rejected"]      # nilai yang boleh untuk ?status=


@router.get("/class-tests/{class_test_id}/complaints")
async def list_complaints(
    class_test_id: UUID,
    status: StatusFilter | None = Query(None),       # ?status=pending  (opsional)
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    await ensure_class_test_access(db, user, class_test_id)
    return await service.list_for_class_test(db, class_test_id, status)


@router.get("/complaints")
async def inbox(
    status: StatusFilter | None = Query("pending"),
    limit: int = Query(200, ge=1, le=1000),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    return await service.inbox(db, user.profile_id, status=status, limit=limit)


@router.post("/complaints/{complaint_id}/resolve", dependencies=[Depends(rate_limit("complaint_resolve", 30))])
async def resolve(
    complaint_id: UUID,
    body: ResolveIn,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    arq=Depends(get_arq),
):
    """`teacher_response` akan dibaca mahasiswa. Kalau accepted dan nilai berubah,
    perubahan itu tercatat sebagai override dan ikut dipelajari jadi trait dosen."""
    await ensure_complaint_access(db,user,complaint_id)

    result = await service.resolve(
        db, complaint_id=complaint_id, teacher_id=user.profile_id, status=body.status,
        teacher_response=body.teacher_response.strip(), new_grade=body.new_grade)
    if result["override_id"]:
        try:
            await jobs.enqueue_build_trait(arq, result["override_id"])
        except Exception as e:
            log.warning("complaint %s: gagal enqueue build_trait: %s", complaint_id, e)
    return result
