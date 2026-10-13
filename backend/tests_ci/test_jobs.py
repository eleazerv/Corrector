"""core.jobs: id job dan antrean yang dipakai saat enqueue ke ARQ."""
from core import jobs
from core.queues import DEFAULT_QUEUE, OCR_QUEUE

from conftest import run, uid


class FakeArq:
    def __init__(self, accept=True):
        self.accept, self.jobs, self.kv = accept, [], {}

    async def enqueue_job(self, name, *args, _job_id=None, _queue_name=None):
        self.jobs.append((name, args, _job_id, _queue_name))
        return object() if self.accept else None        # None = ARQ menolak (id sudah ada)

    async def set(self, key, value, ex=None):
        self.kv[key] = value


def test_first_ocr_job_uses_fixed_id_on_ocr_queue():
    arq, page = FakeArq(), uid()
    assert run(jobs.enqueue_ocr_page(arq, page)) is True
    assert arq.jobs == [("ocr_page", (str(page),), f"ocr:{page}", OCR_QUEUE)]
    assert arq.kv == {}


def test_repeated_ocr_job_gets_unique_id_and_is_remembered():
    arq, page = FakeArq(), uid()
    run(jobs.enqueue_ocr_page(arq, page, again=True))
    run(jobs.enqueue_ocr_page(arq, page, again=True))
    ids = [j[2] for j in arq.jobs]
    assert all(i.startswith(f"ocr:{page}:") for i in ids) and ids[0] != ids[1]
    assert arq.kv[f"joints:lastjob:ocr:{page}"] == ids[1]


def test_grade_job_carries_trigger_and_question_ids():
    arq, sheet, q = FakeArq(), uid(), uid()
    assert run(jobs.enqueue_grade_student(arq, sheet, "regrade", [q])) is True
    name, args, job_id, queue = arq.jobs[0]
    assert (name, args, queue) == ("grade_student", (str(sheet), "regrade", [str(q)]), DEFAULT_QUEUE)
    assert job_id.startswith(f"regrade:{sheet}:") and arq.kv[f"joints:lastjob:grade:{sheet}"] == job_id


def test_trait_and_complaint_jobs_are_deduplicated_by_fixed_id():
    
    arq, override, complaint = FakeArq(), uid(), uid()
    run(jobs.enqueue_build_trait(arq, override))
    run(jobs.enqueue_summarize_complaint(arq, complaint))
    assert [(j[0], j[2], j[3]) for j in arq.jobs] == [
        ("build_trait", f"trait:{override}", DEFAULT_QUEUE),
        ("summarize_complaint", f"complaint:{complaint}", DEFAULT_QUEUE)]


def test_embed_job_id_is_unique_so_reedits_are_not_dropped():
    arq, trait = FakeArq(), uid()
    run(jobs.enqueue_embed_trait(arq, trait))
    run(jobs.enqueue_embed_trait(arq, trait))
    assert arq.jobs[0][2] != arq.jobs[1][2] and arq.jobs[0][2].startswith(f"embed_trait:{trait}:")


def test_rejected_enqueue_returns_false():
    arq = FakeArq(accept=False)
    assert run(jobs.enqueue_build_trait(arq, uid())) is False
    assert run(jobs.enqueue_ocr_page(arq, uid(), again=True)) is False and arq.kv == {}
