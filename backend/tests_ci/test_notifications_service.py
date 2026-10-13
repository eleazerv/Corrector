"""modules.notifications.service: daftar, tandai dibaca, tandai semua."""
import pytest

from core.errors import AppError
from modules.notifications import service

from conftest import FakeDb, run, uid


def test_list_returns_items_and_unread_count():
    teacher = uid()
    db = FakeDb({service.LIST_SQL: [{"id": 1}, {"id": 2}], service.COUNT_UNREAD_SQL: 5})
    assert run(service.list_notifications(db, teacher, True, 20)) == {"items": [{"id": 1}, {"id": 2}], "unread": 5}
    assert db.args_of(service.LIST_SQL) == [(teacher, True, 20)]
    assert db.args_of(service.COUNT_UNREAD_SQL) == [(teacher,)]


def test_list_sql_filter_order_limit():
    sql = " ".join(service.LIST_SQL.lower().split())
    assert "teacher_id = $1" in sql
    assert "(not $2 or read_at is null)" in sql               # unread_only=true -> hanya yang belum dibaca
    assert "order by created_at desc" in sql and "limit $3" in sql


def test_mark_read_returns_row_and_is_scoped_to_teacher():
    teacher, nid = uid(), uid()
    db = FakeDb({service.MARK_READ_SQL: {"id": nid, "read_at": "2026-10-11"}})
    assert run(service.mark_read(db, teacher, nid)) == {"id": nid, "read_at": "2026-10-11"}
    assert db.args_of(service.MARK_READ_SQL) == [(nid, teacher)]
    sql = " ".join(service.MARK_READ_SQL.lower().split())
    assert "coalesce(read_at, now())" in sql and "teacher_id = $2" in sql and "returning" in sql


def test_mark_read_unknown_or_foreign_notification_is_404():
    with pytest.raises(AppError) as e:
        run(service.mark_read(FakeDb(), uid(), uid()))
    assert e.value.status == 404


@pytest.mark.parametrize("status, expected", [("UPDATE 3", 3), ("UPDATE 0", 0)])
def test_mark_all_read_returns_number_updated(status, expected):
    teacher = uid()
    db = FakeDb({service.MARK_ALL_READ_SQL: status})
    assert run(service.mark_all_read(db, teacher)) == {"updated": expected}
    assert db.args_of(service.MARK_ALL_READ_SQL) == [(teacher,)]
