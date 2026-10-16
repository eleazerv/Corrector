"""Perbaikan di modul school dan test: akun login ikut diubah/dihapus, soal terkunci setelah ada
lembar jawaban, PATCH class-test tidak menghapus korektor, data kembar jadi 409."""
import types
import uuid

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from core.errors import AppError, register_error_handlers
from modules.school import service as school
from modules.school.schemas import CreateStudentBulkRequest, CreateStudentRequest, CreateTeacherRequest
from modules.test import service as tests
from modules.test.schemas import CreateQuestionRequest, CriteriaRequest, UpdateClassTestRequest, UpdateQuestionRequest

from conftest import run, uid


class Db:
    """DB tiruan yang mencocokkan potongan teks SQL (SQL di modul ini ditulis langsung di fungsi)."""

    def __init__(self, rules=()):
        self.rules, self.calls = list(rules), []

    def _answer(self, sql, args, default):
        self.calls.append((" ".join(sql.split()), args))
        for needle, value in self.rules:
            if needle in " ".join(sql.split()):
                if isinstance(value, BaseException):
                    raise value
                return value(*args) if callable(value) else value
        return default

    async def fetchrow(self, sql, *a): return self._answer(sql, a, None)
    async def fetchval(self, sql, *a): return self._answer(sql, a, None)
    async def fetch(self, sql, *a): return self._answer(sql, a, [])
    async def execute(self, sql, *a): return self._answer(sql, a, "OK")
    def transaction(self): return self
    async def __aenter__(self): return self
    async def __aexit__(self, *e): return False
    def ran(self, needle): return [a for s, a in self.calls if needle in s]


class Sb:
    """Supabase Auth admin tiruan."""

    def __init__(self, fail_create=False, fail_update_to=None):
        self.created, self.updated, self.deleted = [], [], []
        self.fail_create, self.fail_update_to = fail_create, fail_update_to
        admin = types.SimpleNamespace(create_user=self._create, update_user_by_id=self._update,
                                      delete_user=self._delete)
        self.auth = types.SimpleNamespace(admin=admin)

    async def _create(self, attrs):
        if self.fail_create:
            raise AuthApiError("email already registered", 422, "email_exists")
        self.created.append(attrs)
        return types.SimpleNamespace(user=types.SimpleNamespace(id=str(uuid.uuid4())))

    async def _update(self, user_id, attrs):
        if attrs["email"] == self.fail_update_to:
            raise AuthApiError("email already registered", 422, "email_exists")
        self.updated.append((user_id, attrs["email"]))

    async def _delete(self, user_id):
        self.deleted.append(user_id)


# ================================================================ school: akun login
def test_delete_student_and_teacher_also_delete_login_account():
    user = uid()
    for fn, table in ((school.delete_student, "students"), (school.delete_teacher, "teachers")):
        sb, db = Sb(), Db([(f"SELECT id, user_id FROM {table}", {"id": 1, "user_id": user}),
                           ("SELECT EXISTS", False)])
        assert run(fn(db, sb, uid(), uid())) is True
        assert db.ran(f"DELETE FROM {table}") and sb.deleted == [str(user)]


def test_delete_blocked_or_missing_keeps_login_account():
    sb = Sb()
    db = Db([("SELECT id, user_id FROM students", {"id": 1, "user_id": uid()}), ("SELECT EXISTS", True)])
    with pytest.raises(AppError) as e:
        run(school.delete_student(db, sb, uid(), uid()))
    assert e.value.status == 409 and sb.deleted == [] and not db.ran("DELETE FROM students")
    assert run(school.delete_teacher(Db(), sb, uid(), uid())) is False and sb.deleted == []


def test_delete_survives_auth_failure_and_missing_user_id():
    sb = Sb()
    async def boom(user_id): raise RuntimeError("supabase down")
    sb.auth.admin.delete_user = boom
    db = Db([("SELECT id, user_id FROM students", {"id": 1, "user_id": uid()}), ("SELECT EXISTS", False)])
    assert run(school.delete_student(db, sb, uid(), uid())) is True          # baris tabel tetap terhapus
    db = Db([("SELECT id, user_id FROM teachers", {"id": 1, "user_id": None}), ("SELECT EXISTS", False)])
    assert run(school.delete_teacher(db, Sb(), uid(), uid())) is True


def update_student(new_email, *, old="lama@x.test", user=True, update_result="ok", sb=None):
    user_id, sid, school_id = (uid() if user else None), uid(), uid()
    row = {"id": sid, "user_id": user_id, "school_id": school_id, "nim": "1", "name": "n", "email": new_email}
    db = Db([("SELECT user_id, email FROM students", {"user_id": user_id, "email": old}),
             ("UPDATE students", row if update_result == "ok" else update_result)])
    sb = sb or Sb()
    req = types.SimpleNamespace(nim="1", name="n", email=new_email)
    return db, sb, user_id, lambda: run(school.update_student(db, sb, sid, school_id, req))


def test_update_email_also_changes_login_email():
    db, sb, user_id, call = update_student("baru@x.test")
    assert call().email == "baru@x.test" and sb.updated == [(str(user_id), "baru@x.test")]


def test_update_without_email_change_or_without_account_skips_auth():
    _, sb, _, call = update_student("lama@x.test")
    call()
    assert sb.updated == []
    _, sb, _, call = update_student("baru@x.test", user=False)
    call()
    assert sb.updated == []


def test_update_email_rejected_by_auth_does_not_touch_table():
    db, sb, _, call = update_student("dipakai@x.test", sb=Sb(fail_update_to="dipakai@x.test"))
    with pytest.raises(AppError) as e:
        call()
    assert e.value.status == 409 and not db.ran("UPDATE students")


def test_update_reverts_login_email_when_table_update_fails():
    db, sb, user_id, call = update_student("baru@x.test", update_result=asyncpg.UniqueViolationError("kembar"))
    with pytest.raises(asyncpg.UniqueViolationError):
        call()
    assert sb.updated == [(str(user_id), "baru@x.test"), (str(user_id), "lama@x.test")]


def test_update_unknown_teacher_returns_none():
    req = types.SimpleNamespace(name="n", email="e@x.test", code="c")
    assert run(school.update_teacher(Db(), Sb(), uid(), uid(), req)) is None


def test_create_with_taken_email_is_409_not_500():
    for fn, req in ((school.create_teacher, CreateTeacherRequest(name="n", email="e@x.test", code="c")),
                    (school.create_student, CreateStudentRequest(nim="1", name="n", email="e@x.test"))):
        db = Db()
        with pytest.raises(AppError) as e:
            run(fn(db, Sb(fail_create=True), uid(), req))
        assert e.value.status == 409 and db.calls == []


def test_create_rolls_back_login_account_when_insert_fails():
    sb, db = Sb(), Db([("INSERT INTO teachers", asyncpg.UniqueViolationError("kode kembar"))])
    with pytest.raises(asyncpg.UniqueViolationError):
        run(school.create_teacher(db, sb, uid(), CreateTeacherRequest(name="n", email="e@x.test", code="c")))
    assert len(sb.created) == 1 and len(sb.deleted) == 1


def test_bulk_request_size_is_limited():
    one = {"nim": "1", "name": "n", "email": "e@x.test"}
    assert len(CreateStudentBulkRequest(students=[one] * 200).students) == 200
    for bad in ([], [one] * 201):
        with pytest.raises(ValueError):
            CreateStudentBulkRequest(students=bad)


def test_unique_violation_becomes_409_response():
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    async def boom():
        raise asyncpg.UniqueViolationError("duplicate key value violates unique constraint")

    r = TestClient(app, raise_server_exceptions=False).get("/boom")
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


# ================================================================ test: soal terkunci setelah ada lembar jawaban
OWNER = uid()
TEST_ROW = {"id": uid(), "maker_id": OWNER, "status": "ready"}
QUESTION = CreateQuestionRequest(number=1, question_text="q", max_points=10, key_answer="k",
                                 criteria=[CriteriaRequest(description="d", points=5)])
LOCKED = ("FROM student_tests st JOIN class_tests ct", True)


def locked_db(*extra):
    return Db([LOCKED, *extra])


def assert_locked(call, db, forbidden_sql):
    with pytest.raises(AppError) as e:
        run(call)
    assert (e.value.status, e.value.code) == (409, "TEST_HAS_ANSWER_SHEETS")
    assert not any(db.ran(sql) for sql in forbidden_sql)


def test_question_changes_are_blocked_when_answer_sheets_exist(monkeypatch):
    async def owner(db, test_id, school_id, teacher_id): return TEST_ROW
    monkeypatch.setattr(tests, "validate_test_owner", owner)
    qid, tid = uid(), uid()

    db = locked_db()
    assert_locked(tests.add_question(db, tid, uid(), OWNER, QUESTION), db, ["INSERT INTO test_questions"])

    db = locked_db(("FROM test_questions WHERE id = $1 AND test_id = $2", {"id": qid}))
    upd = UpdateQuestionRequest(number=1, question_text="q", max_points=10, key_answer="k")
    assert_locked(tests.update_question(db, tid, qid, uid(), OWNER, upd), db, ["UPDATE test_questions"])

    db = locked_db(("FROM test_questions q JOIN tests t", {"id": qid, "test_id": tid, "max_points": 10}))
    assert_locked(tests.delete_question(db, qid, uid(), OWNER), db, ["DELETE FROM test_questions"])

    db = locked_db(("FROM test_questions q JOIN tests t", {"id": qid, "test_id": tid, "max_points": 10}))
    assert_locked(tests.replace_criteria(db, qid, uid(), OWNER, [CriteriaRequest(description="d", points=5)]),
                  db, ["DELETE FROM question_criteria", "INSERT INTO question_criteria"])


def test_delete_question_still_works_before_any_answer_sheet():
    qid, tid = uid(), uid()
    db = Db([("FROM test_questions q JOIN tests t", {"id": qid, "test_id": tid}),
             ("FROM student_tests st JOIN class_tests ct", False)])
    assert run(tests.delete_question(db, qid, uid(), OWNER)) is True
    assert db.ran("DELETE FROM test_questions") == [(qid,)]
    assert db.ran("FROM student_tests st JOIN class_tests ct") == [(tid,)]


# ================================================================ test: PATCH /class-tests/{id}
def patch_class_test(monkeypatch, body: dict, current_status="scheduled", corrector="same"):
    teacher, old_corrector, ctid, school_id = uid(), uid(), uid(), uid()
    current = {"id": ctid, "class_id": uid(), "corrector_id": teacher if corrector == "same" else old_corrector,
               "status": current_status}

    async def get(db, class_test_id, sid): return current
    async def response(db, row): return "RESPONSE"

    monkeypatch.setattr(tests, "get_class_test", get)
    monkeypatch.setattr(tests, "class_test_response", response)
    db = Db([("UPDATE class_tests", {"id": ctid}), ("FROM classes", True), ("FROM teachers", True)])
    req = UpdateClassTestRequest(test_date="2026-11-01T08:00:00Z", **body)
    call = lambda: run(tests.update_class_test(db, ctid, school_id, teacher, req))
    return db, current, call


def test_patch_without_corrector_keeps_existing_corrector(monkeypatch):
    db, current, call = patch_class_test(monkeypatch, {}, corrector="other")
    assert call() == "RESPONSE"
    assert db.ran("UPDATE class_tests")[0][0] == current["corrector_id"]          # tidak jadi NULL


def test_patch_can_still_change_or_clear_corrector_explicitly(monkeypatch):
    new = uid()
    db, _, call = patch_class_test(monkeypatch, {"corrector_id": str(new)})
    call()
    assert db.ran("UPDATE class_tests")[0][0] == new
    db, _, call = patch_class_test(monkeypatch, {"corrector_id": None})
    call()
    assert db.ran("UPDATE class_tests")[0][0] is None


@pytest.mark.parametrize("status, code, http", [("ngawur", "INVALID_STATUS", 422),
                                                ("published", "USE_PUBLISH_ENDPOINT", 409)])
def test_patch_rejects_invalid_or_published_status(monkeypatch, status, code, http):
    db, _, call = patch_class_test(monkeypatch, {"status": status})
    with pytest.raises(AppError) as e:
        call()
    assert (e.value.code, e.value.status) == (code, http) and not db.ran("UPDATE class_tests")


def test_patch_allows_other_status_and_same_status(monkeypatch):
    db, _, call = patch_class_test(monkeypatch, {"status": "reviewing"})
    call()
    assert db.ran("UPDATE class_tests")[0][2] == "reviewing"
    db, _, call = patch_class_test(monkeypatch, {"status": "published"}, current_status="published")
    assert call() == "RESPONSE"                                                # mengirim status yang sama tidak ditolak
