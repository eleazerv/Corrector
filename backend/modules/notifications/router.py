"""Notifikasi dosen. Hanya penunjuk (payload berisi id + pilihan aksi); logikanya tetap di modul asal.

GET  /notifications                 daftar notifikasi sendiri
POST /notifications/read-all        tandai semua sudah dibaca
POST /notifications/{id}/read       tandai satu sudah dibaca
"""
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.deps import CurrentUser, TeacherUser, get_pool

from . import service

router = APIRouter(tags=["notifications"])  


@router.get("/notifications")  
async def getNotifications (
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    return await service.list_notifications(db, user.profile_id, unread_only, limit)


@router.post("/notifications/read-all") 
async def readAllNotifications (
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    return await service.mark_all_read(db, user.profile_id)


@router.post("/notifications/{notification_id}/read")  
async def readNotification (
    notification_id: UUID,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    return await service.mark_read(db, user.profile_id, notification_id)
