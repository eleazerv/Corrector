"""SQL notifikasi. Tabel notifications RLS tanpa policy -> selalu lewat pool biasa + filter teacher_id."""
from uuid import UUID

from core.errors import not_found


LIST_SQL = """
select id, kind, title, body, payload, read_at, created_at
from notifications
where teacher_id = $1
  and (not $2 or read_at is null)
order by created_at desc
limit $3
"""

COUNT_UNREAD_SQL = """
select count(*) from notifications where teacher_id = $1 and read_at is null
"""


MARK_READ_SQL = """
update notifications set read_at = coalesce(read_at, now())
where id = $1 and teacher_id = $2
returning id, read_at
"""

MARK_ALL_READ_SQL = """
update notifications set read_at = now() where teacher_id = $1 and read_at is null
"""


async def list_notifications(db, teacher_id: UUID, unread_only: bool, limit: int) -> dict:
    rows = await db.fetch(LIST_SQL, teacher_id, unread_only, limit) 
    unread = await db.fetchval(COUNT_UNREAD_SQL, teacher_id)  
    return {"items": [dict(r) for r in rows], "unread": unread}


async def mark_read(db, teacher_id: UUID, notification_id: UUID) -> dict:
    row = await db.fetchrow(MARK_READ_SQL, notification_id, teacher_id) 
    if row is None:
        raise not_found("Notification")
    return dict(row)


async def mark_all_read(db, teacher_id: UUID) -> dict:
    status = await db.execute(MARK_ALL_READ_SQL, teacher_id)
    return {"updated": int(status.split()[-1])}  
