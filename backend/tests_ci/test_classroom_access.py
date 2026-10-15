""" dosen hanya boleh melihat kelas miliknya atau kelas yang
ia koreksi; admin sekolah melihat semua kelas di sekolahnya."""
import uuid

from modules.classroom import service as classroom

from conftest import run

SCHOOL = uuid.uuid4()
OWNER = uuid.uuid4()
OTHER = uuid.uuid4()
CLASS_ID = uuid.uuid4()

CLASS_ROW = {"id": CLASS_ID, "school_id": SCHOOL, "teacher_id": OWNER, "teacher_name": "Pemilik",
             "name": "Kalkulus A", "code": "KAL-A", "description": None}


class Db:
    """DB tiruan: jawab berdasarkan potongan SQL, catat semua panggilan."""

    def __init__(self, corrector=False):
        self.corrector, self.calls = corrector, []

    def _log(self, sql, args):
        self.calls.append((" ".join(sql.split()), args))

    async def fetchrow(self, sql, *a):
        self._log(sql, a)
        return CLASS_ROW if "FROM classes c" in sql else None

    async def fetchval(self, sql, *a):
        self._log(sql, a)
        if "ct.corrector_id = $2" in sql:          # TEACHER_CAN_VIEW_SQL
            return self.corrector
        return 0                                    # COUNT(*)

    async def fetch(self, sql, *a):
        self._log(sql, a)
        return []


def test_list_teacher_filtered_to_own_or_corrected_classes():
    db = Db()
    run(classroom.list_classes(db, SCHOOL, "teacher", OTHER))
    sql, args = db.calls[-1]
    assert "c.teacher_id = $3" in sql and "ct2.corrector_id = $3" in sql
    assert args == (SCHOOL, True, OTHER)


def test_list_admin_sees_whole_school():
    db = Db()
    run(classroom.list_classes(db, SCHOOL, "school_admin", uuid.uuid4()))
    assert db.calls[-1][1][1] is False             # only_mine = False


def test_detail_other_teacher_gets_none():
    assert run(classroom.get_class_detail(Db(), CLASS_ID, SCHOOL, "teacher", OTHER)) is None


def test_detail_owner_and_corrector_and_admin_allowed():
    assert run(classroom.get_class_detail(Db(), CLASS_ID, SCHOOL, "teacher", OWNER)) is not None
    assert run(classroom.get_class_detail(Db(corrector=True), CLASS_ID, SCHOOL, "teacher", OTHER)) is not None
    assert run(classroom.get_class_detail(Db(), CLASS_ID, SCHOOL, "school_admin", uuid.uuid4())) is not None


def test_students_other_teacher_gets_none():
    assert run(classroom.list_class_students(Db(), CLASS_ID, SCHOOL, "teacher", OTHER)) is None
    assert run(classroom.list_class_students(Db(), CLASS_ID, SCHOOL, "teacher", OWNER)) == ([], 0)
