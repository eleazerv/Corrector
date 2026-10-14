"""Notifikasi dosen. Hanya penunjuk (payload berisi id + pilihan aksi); logikanya tetap di modul asal.

GET  /notifications                 daftar notifikasi sendiri
POST /notifications/read-all        tandai semua sudah dibaca
POST /notifications/{id}/read       tandai satu sudah dibaca
GET  /notifications/events          SSE
"""
import asyncio  
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query, Request  
from fastapi.responses import StreamingResponse  

from core.deps import CurrentUser, TeacherUser, get_current_user_sse, get_pool, get_redis  
from core.errors import forbidden  
from core.notify import teacher_channel  

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


# SSE notifikasi dosen

SSE_PING_SECONDS = 15


@router.get("/notifications/events")
async def notificationEvents(
    request: Request,
    user: CurrentUser = Depends(get_current_user_sse),
    redis=Depends(get_redis),
):
    """Server-Sent Events. Frontend: new EventSource(`.../notifications/events?access_token=${token}`)

    Pesan = JSON dari worker ke channel Redis notifications:{teacher_id}, mis.
    {"event": "notification", "kind": "trait_duplicate", "title": "..."} atau {"event": "traits_changed"}.
    """
    if user.role != "teacher":
        raise forbidden()
    channel = teacher_channel(user.profile_id)

    async def stream():
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            yield "retry:5000\n\n"
            while not await request.is_disconnected():
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=SSE_PING_SECONDS)
                if msg is None:
                    yield ":ping\n\n"
                    continue
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8", "replace")
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
