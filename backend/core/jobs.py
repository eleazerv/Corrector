"""
tempat untuk enqueue job ARQ

Catatan _job_id: ARQ menolak job baru kalau id yang sama masih antre / berjalan / hasilnya
masih disimpan (default 1 jam). Jadi:
  - id TETAP  (ocr:{page_id})             -> kerja pertama untuk halaman itu
  - id + akhiran acak (ocr:{page_id}:ab12) -> pengulangan (reupload, requeue, regrade)
Tiap id berakhiran dicatat di Redis (kunci joints:lastjob:...), supaya cron requeue_stuck
bisa tahu "masih ada job hidup untuk halaman/lembar ini atau tidak" lewat *_job_alive().

Penjaga job dobel grading tetap di DB (unique index "1 running per student_test").

"""

import uuid 
from uuid import UUID 

from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus

from core.queues import DEFAULT_QUEUE, OCR_QUEUE

LASTJOB_TTL = 6 * 3600 
_ALIVE = (JobStatus.deferred, JobStatus.queued, JobStatus.in_progress)

def _suffix() -> str : 
    return uuid.uuid4().hex[:8]

async def _remember(arq:ArqRedis, kind:str , target_id , job_id:str) -> bool : 
    await arq.set(f"joints:lastjob:{kind}:{target_id}",job_id,ex=LASTJOB_TTL)
    
async def _alive(arq: ArqRedis, queue: str, kind: str, target_id, base_id: str) -> bool:
    """true jika job dengan id dasar masih antri """
    ids = [base_id]
    last = await arq.get(f"joints:lastjob:{kind}:{target_id}")
    if last: 
        ids.append(last.decode() if isinstance(last,bytes)else str(last))
    for job_id in ids : 
        if await Job(job_id, arq,_queue_name=queue).status() in _ALIVE : 
            return True 
    return False 
    
async def enqueue_ocr_page(arq: ArqRedis, page_id: UUID , * , again:bool = False)-> bool: 
    """ again=True utk halaman yang pernah ada job ( reupload / requeue / regrade )"""
    job_id = f"ocr:{page_id}:{_suffix()}" if again else f"ocr:{page_id}"
    job = await arq.enqueue_job("ocr_page", str(page_id),_job_id=job_id , _queue_name=OCR_QUEUE)
    if job is not None and again: 
        await _remember(arq,"ocr",str(page_id),job_id)
    return job is not None

async def ocr_job_alive(arq: ArqRedis, page_id: UUID) -> bool:
    return await _alive(arq, OCR_QUEUE, "ocr", page_id, f"ocr:{page_id}")


async def enqueue_grade_student(arq:ArqRedis, student_test_id: UUID,trigger_source: str, question_ids: list[UUID] | None = None) -> bool : 
    """ trigger_source : regrade | manual |retry """
    ids = [str(q) for q in question_ids] if question_ids else None 
    job_id = f"{trigger_source}:{student_test_id}:{_suffix()}"
    job = await arq.enqueue_job("grade_student", str(student_test_id), trigger_source, ids,
                                _job_id=job_id, _queue_name=DEFAULT_QUEUE)
    if job is not None:
        await _remember(arq, "grade", student_test_id, job_id)
    return job is not None


async def grade_job_alive(arq: ArqRedis, student_test_id: UUID) -> bool:
    return await _alive(arq, DEFAULT_QUEUE, "grade", student_test_id, f"grade:{student_test_id}")
    
    
    
async def enqueue_build_trait(arq: ArqRedis, override_id: UUID) -> bool:
    job = await arq.enqueue_job("build_trait", str(override_id),
                                _job_id=f"trait:{override_id}", _queue_name=DEFAULT_QUEUE)
    return job is not None


async def enqueue_embed_trait(arq: ArqRedis, trait_id: UUID) -> bool:
    job = await arq.enqueue_job("embed_trait", str(trait_id),
                                _job_id=f"embed_trait:{trait_id}:{_suffix()}", _queue_name=DEFAULT_QUEUE)
    return job is not None


async def enqueue_summarize_complaint(arq: ArqRedis, complaint_id: UUID) -> bool:
    job = await arq.enqueue_job("summarize_complaint", str(complaint_id),
                                _job_id=f"complaint:{complaint_id}", _queue_name=DEFAULT_QUEUE)
    return job is not None
