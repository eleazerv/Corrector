"""Rilis nilai ke mahasiswa. Untuk DOSEN.

POST /class-tests/{id}/publish        rilis nilai
GET  /class-tests/{id}/export.csv     unduh nilai per mahasiswa
"""
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query
from core.ratelimit import rate_limit
from fastapi.responses import Response

from core.access import ensure_class_test_access
from core.deps import CurrentUser, TeacherUser, get_pool

from . import service

router = APIRouter(tags=["publish"])


@router.post("/class-tests/{class_test_id}/publish", dependencies=[Depends(rate_limit("publish", 5))])
async def publish(
  class_test_id : UUID ,
  user:CurrentUser=TeacherUser,
  allow_needs_review:bool=False,
  db: asyncpg.Pool=Depends(get_pool)
):
  await ensure_class_test_access(db,user,class_test_id)
  return await service.publish(db, class_test_id, allow_needs_review)


@router.get("/class-tests/{class_test_id}/export.csv", dependencies=[Depends(rate_limit("export_csv", 10))])
async def export_csv(
  class_test_id: UUID,
  user: CurrentUser = TeacherUser,
  db: asyncpg.Pool = Depends(get_pool),
):
  await ensure_class_test_access(db,user,class_test_id)
  content = await service.export_csv(db, class_test_id)
  return Response(content=content,media_type="text/csv; charset=utf-8",headers={"Content-Disposition": f'attachment; filename="nilai-{class_test_id}.csv"'})