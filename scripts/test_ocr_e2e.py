"""
End-to-end lewat ARQ: seed -> enqueue ocr_page ke Redis -> OCR worker ngerjain -> cek DB.

Syarat: OCR worker sudah jalan di terminal lain:
    cd backend && arq core.worker.OcrWorkerSettings

Pakai (dari root project):
    python -m scripts.test_ocr_e2e
    python -m scripts.test_ocr_e2e --keep
"""
import argparse
import asyncio
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from arq import create_pool  # noqa: E402
from arq.connections import RedisSettings  # noqa: E402
from supabase import acreate_client  # noqa: E402

from core.config import settings  # noqa: E402
from core.queues import OCR_QUEUE  # noqa: E402
from db.pool import create_db_pool  # noqa: E402
from providers.storage import get_storage_provider  # noqa: E402
from scripts.test_ocr_page import cleanup, seed  # noqa: E402

TIMEOUT_SEC = 240


async def main(keep: bool):
    pool = await create_db_pool(min_size=1, max_size=3)
    sb = await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    storage = get_storage_provider(sb)
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))

    ids = await seed(pool, storage, n_pages=2, tag=uuid.uuid4().hex[:8])
    print(f"seed ok: student_test={ids['student_test']} pages={len(ids['pages'])}")
    ok = False
    try:
        for pid in ids["pages"]:
            job = await redis.enqueue_job(
                "ocr_page", str(pid), _job_id=f"ocr:{pid}", _queue_name=OCR_QUEUE,
            )
            print(f"enqueue ocr_page {pid} -> job {job.job_id if job else 'DUPLIKAT'}")

        t0 = time.monotonic()
        while time.monotonic() - t0 < TIMEOUT_SEC:
            st = await pool.fetchrow(
                "select status, pages_done, total_pages from student_tests where id = $1",
                ids["student_test"],
            )
            print(f"  {time.monotonic() - t0:5.0f}s  status={st['status']:<15} "
                  f"pages {st['pages_done']}/{st['total_pages']}")
            if st["status"] in ("grading", "graded", "needs_reupload", "failed"):
                break
            await asyncio.sleep(3)

        pages = await pool.fetch(
            "select page_no, status, error from test_pages where student_test_id = $1 order by page_no",
            ids["student_test"],
        )
        for p in pages:
            print(f"  page {p['page_no']}: {p['status']} {p['error'] or ''}")

        ok = st["pages_done"] == 2 and st["status"] in ("grading", "graded")
        print("\nLOLOS: OCR selesai & grading ke-trigger" if ok
              else "\nGAGAL: cek log OCR worker")
        print("(grade_student masih skeleton -> job-nya di worker umum boleh error/skip)")
    finally:
        if keep:
            print(f"--keep: data seed disimpan (tag={ids['tag']})")
        else:
            await cleanup(pool, storage, ids)
        await redis.aclose()
        await pool.close()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true")
    asyncio.run(main(ap.parse_args().keep))