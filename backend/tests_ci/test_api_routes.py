"""Lapisan HTTP untuk endpoint konflik + notifikasi: login, role, validasi input, dan format error.

Service-nya diganti tiruan, jadi yang diuji di sini murni router + dependency (tanpa database).
"""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.deps import CurrentUser, get_current_user, get_pool
from core.errors import conflict, not_found, register_error_handlers
from modules.notifications import service as notif_service
from modules.notifications.router import router as notifications_router
from modules.traits import service as traits_service
from modules.traits.router import router as traits_router

API = "/api/v1"
TEACHER = CurrentUser(user_id=uuid.uuid4(), role="teacher", profile_id=uuid.uuid4(), school_id=uuid.uuid4())
STUDENT = CurrentUser(user_id=uuid.uuid4(), role="student", profile_id=uuid.uuid4(), school_id=uuid.uuid4())
ADMIN = CurrentUser(user_id=uuid.uuid4(), role="school_admin", profile_id=uuid.uuid4(), school_id=uuid.uuid4())


def make_app(user=None):
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(traits_router, prefix=API)
    app.include_router(notifications_router, prefix=API)
    app.state.supabase = object()                       # hanya supaya dependency get_supabase tidak error
    app.dependency_overrides[get_pool] = lambda: "POOL"
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def calls(monkeypatch):
    """Ganti semua fungsi service dengan perekam panggilan."""
    seen = []

    def fake(name, result):
        async def _f(*args):
            seen.append((name, args))
            if isinstance(result, BaseException):
                raise result
            return result
        return _f

    monkeypatch.setattr(traits_service, "list_conflicts", fake("list_conflicts", {"items": []}))
    monkeypatch.setattr(traits_service, "resolve_conflict", fake("resolve_conflict", {"status": "replace"}))
    monkeypatch.setattr(notif_service, "list_notifications", fake("list_notifications", {"items": [], "unread": 0}))
    monkeypatch.setattr(notif_service, "mark_read", fake("mark_read", {"id": "x", "read_at": "t"}))
    monkeypatch.setattr(notif_service, "mark_all_read", fake("mark_all_read", {"updated": 2}))
    return seen


CID = str(uuid.uuid4())
ENDPOINTS = [
    ("GET", "/traits/conflicts", None),
    ("POST", f"/traits/conflicts/{CID}/resolve", {"action": "replace"}),
    ("GET", "/notifications", None),
    ("POST", "/notifications/read-all", None),
    ("POST", f"/notifications/{CID}/read", None),
]


@pytest.mark.parametrize("method, path, body", ENDPOINTS)
def test_requires_login(calls, method, path, body):
    r = make_app().request(method, API + path, json=body)
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHORIZED"
    assert calls == []


@pytest.mark.parametrize("user", [STUDENT, ADMIN])
@pytest.mark.parametrize("method, path, body", ENDPOINTS)
def test_only_teachers_allowed(calls, user, method, path, body):
    r = make_app(user).request(method, API + path, json=body)
    assert r.status_code == 403 and calls == []


def test_list_conflicts_passes_teacher_and_filter(calls):
    client = make_app(TEACHER)
    assert client.get(API + "/traits/conflicts").json() == {"items": []}
    assert client.get(API + "/traits/conflicts", params={"status": "pending"}).status_code == 200
    assert calls == [("list_conflicts", ("POOL", TEACHER.profile_id, None)),
                     ("list_conflicts", ("POOL", TEACHER.profile_id, "pending"))]


def test_list_conflicts_rejects_unknown_status(calls):
    r = make_app(TEACHER).get(API + "/traits/conflicts", params={"status": "pending; drop table"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR" and calls == []


@pytest.mark.parametrize("action", ["keep_old", "replace", "keep_both"])
def test_resolve_accepts_the_three_actions(calls, action):
    r = make_app(TEACHER).post(API + f"/traits/conflicts/{CID}/resolve", json={"action": action})
    assert r.status_code == 200
    assert calls == [("resolve_conflict", ("POOL", TEACHER.profile_id, uuid.UUID(CID), action))]


@pytest.mark.parametrize("path, body", [
    (f"/traits/conflicts/{CID}/resolve", {"action": "hapus_semua"}),
    (f"/traits/conflicts/{CID}/resolve", {}),
    ("/traits/conflicts/bukan-uuid/resolve", {"action": "replace"}),
    ("/notifications/bukan-uuid/read", None),
])
def test_invalid_input_is_422(calls, path, body):
    assert make_app(TEACHER).post(API + path, json=body).status_code == 422 and calls == []


@pytest.mark.parametrize("error, status, code", [(not_found("Conflict"), 404, "NOT_FOUND"),
                                                 (conflict("Conflict already resolved"), 409, "CONFLICT")])
def test_service_errors_become_json_errors(monkeypatch, error, status, code):
    async def boom(*a): raise error
    monkeypatch.setattr(traits_service, "resolve_conflict", boom)
    r = make_app(TEACHER).post(API + f"/traits/conflicts/{CID}/resolve", json={"action": "replace"})
    assert r.status_code == status and r.json()["error"]["code"] == code


def test_unexpected_error_is_500_without_leaking_details(monkeypatch):
    async def boom(*a): raise RuntimeError("password=rahasia di pesan error")
    monkeypatch.setattr(traits_service, "list_conflicts", boom)
    r = make_app(TEACHER).get(API + "/traits/conflicts")
    assert r.status_code == 500 and r.json()["error"]["code"] == "INTERNAL"
    assert "rahasia" not in r.text


def test_notifications_query_params(calls):
    client = make_app(TEACHER)
    assert client.get(API + "/notifications").json() == {"items": [], "unread": 0}
    client.get(API + "/notifications", params={"unread_only": "true", "limit": 5})
    assert calls == [("list_notifications", ("POOL", TEACHER.profile_id, False, 50)),
                     ("list_notifications", ("POOL", TEACHER.profile_id, True, 5))]
    for bad in (0, 101, "banyak"):
        assert client.get(API + "/notifications", params={"limit": bad}).status_code == 422


def test_read_all_is_not_mistaken_for_notification_id(calls):
    client = make_app(TEACHER)
    assert client.post(API + "/notifications/read-all").json() == {"updated": 2}
    assert client.post(API + f"/notifications/{CID}/read").status_code == 200
    assert calls == [("mark_all_read", ("POOL", TEACHER.profile_id)),
                     ("mark_read", ("POOL", TEACHER.profile_id, uuid.UUID(CID)))]
