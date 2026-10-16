"""Catat pemakaian token LLM di luar grading ke tabel llm_usage.
Token grading TIDAK lewat sini (sudah dicatat grading_runs).

Yang memanggil record_usage:
  job                    file                          ref_id          teacher_id
  "build_trait"          tasks/build_trait.py          override.id     override.teacher_id
  "summarize_complaint"  tasks/summarize_complaint.py  complaint_id    korektor ujian (atau dosen kelas)
  "trait_patch"          modules/traits/service.py     trait_id        dosen yang mengedit
"""
from uuid import UUID

import asyncpg

from core.logging import log

ACTIVE_PLAN_SQL = """
select sp.id
from school_plans sp
join teachers t on t.school_id = sp.school_id
where t.id = $1
  and sp.plan_status = 'on'
  and now() between sp.start_date and sp.end_date
order by sp.start_date desc
limit 1
"""

INSERT_USAGE_SQL = """
insert into llm_usage (teacher_id, school_plan_id, job, ref_id, model, input_tokens, output_tokens)
values ($1, $2, $3, $4, $5, $6, $7)
"""


async def record_usage(pool: asyncpg.Pool, *, job: str, teacher_id: UUID | None, ref_id: UUID | None, res) -> None:
    usage = getattr(res, "usage", None)  # res = LlmJson (punya .usage dan .model)
    if usage is None or usage.total == 0:  # tidak ada token -> lewati
        return
    try:
        plan_id = None
        if teacher_id is not None:
            plan_id = await pool.fetchval(ACTIVE_PLAN_SQL, teacher_id)
        await pool.execute(INSERT_USAGE_SQL, teacher_id, plan_id, job, ref_id,
                           getattr(res, "model", "") or None, usage.input_tokens, usage.output_tokens)
    except Exception as e:  # gagal mencatat tidak boleh menggagalkan job
        log.warning("llm_usage %s ref=%s gagal dicatat: %s", job, ref_id, e)
