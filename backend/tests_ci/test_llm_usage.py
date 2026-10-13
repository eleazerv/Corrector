"""core.llm_usage.record_usage: 1 baris per panggilan LLM, tidak boleh menggagalkan pemanggilnya."""
from core import llm_usage

from conftest import FakeDb, llm_result, run, uid


def test_records_tokens_with_active_plan():
    teacher, ref, plan = uid(), uid(), uid()
    db = FakeDb({llm_usage.ACTIVE_PLAN_SQL: plan})
    run(llm_usage.record_usage(db, job="build_trait", teacher_id=teacher, ref_id=ref,
                               res=llm_result({}, 120, 30, "deepseek-x")))
    assert db.args_of(llm_usage.ACTIVE_PLAN_SQL) == [(teacher,)]
    assert db.args_of(llm_usage.INSERT_USAGE_SQL) == [(teacher, plan, "build_trait", ref, "deepseek-x", 120, 30)]


def test_no_active_plan_or_no_teacher_still_recorded():
    db = FakeDb()                                              # tidak ada paket aktif
    run(llm_usage.record_usage(db, job="j", teacher_id=uid(), ref_id=None, res=llm_result({})))
    assert db.args_of(llm_usage.INSERT_USAGE_SQL)[0][1] is None

    db = FakeDb({llm_usage.ACTIVE_PLAN_SQL: uid()})
    run(llm_usage.record_usage(db, job="j", teacher_id=None, ref_id=None, res=llm_result({})))
    assert db.count(llm_usage.ACTIVE_PLAN_SQL) == 0           # tanpa dosen -> tidak mencari paket
    assert db.args_of(llm_usage.INSERT_USAGE_SQL)[0][:2] == (None, None)


def test_zero_tokens_or_missing_usage_is_skipped():
    db = FakeDb()
    run(llm_usage.record_usage(db, job="j", teacher_id=uid(), ref_id=None, res=llm_result({}, 0, 0)))
    run(llm_usage.record_usage(db, job="j", teacher_id=uid(), ref_id=None, res=object()))
    run(llm_usage.record_usage(db, job="j", teacher_id=uid(), ref_id=None, res=None))
    assert db.calls == []


def test_database_failure_is_swallowed():
    db = FakeDb({llm_usage.INSERT_USAGE_SQL: RuntimeError("db down")})
    run(llm_usage.record_usage(db, job="j", teacher_id=uid(), ref_id=None, res=llm_result({})))   # tidak raise


def test_active_plan_sql_filters():
    sql = " ".join(llm_usage.ACTIVE_PLAN_SQL.lower().split())
    assert "plan_status = 'on'" in sql and "between sp.start_date and sp.end_date" in sql
