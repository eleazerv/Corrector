"""event realtime ke dosen (SSE /notifications/events) lewat Redis pub/sub.

Notifikasinya sendiri tetap disimpan di tabel notifications; publish hanya "colekan" supaya
frontend langsung memuat ulang. Gagal publish != gagal job (data tetap ada di DB).
"""
import json
from uuid import UUID

from core.logging import log


def teacher_channel(teacher_id: UUID | str) -> str:
    return f"notifications:{teacher_id}"


async def publish_teacher(redis, teacher_id: UUID | str | None, payload: dict) -> None:
    if redis is None or teacher_id is None:
        return
    try:
        await redis.publish(teacher_channel(teacher_id), json.dumps(payload, default=str))
    except Exception as e:
        log.warning("publish_teacher %s gagal: %s", teacher_id, e)
