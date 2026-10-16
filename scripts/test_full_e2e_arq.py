"""
E2E penuh LEWAT ARQ: seed -> enqueue ocr_page ke Redis -> OCR worker -> (otomatis) grade_student
di worker umum -> cetak hasil dari DB.

Taruh di: scripts/test_full_e2e_arq.py   (butuh scripts/test_full_e2e.py di folder yang sama)

Syarat: DUA worker sudah jalan di terminal lain (dari dalam backend/):
    arq core.worker.OcrWorkerSettings
    arq core.worker.WorkerSettings

Pakai (dari root project):
    python -m scripts.test_full_e2e_arq
    python -m scripts.test_full_e2e_arq --only 2501000002
    python -m scripts.test_full_e2e_arq --cleanup
Hapus data run lama: python -m scripts.test_full_e2e --purge <tag>
"""
import argparse
import asyncio
import sys
import time
import uuid

from scripts.test_full_e2e import STUDENTS, find_photos, purge, seed, show_ocr, show_result  # noqa: E402
# (import di atas juga menambahkan backend/ ke sys.path)

from arq import create_pool  # noqa: E402
from arq.connections import RedisSettings  # noqa: E402
from supabase import acreate_client  # noqa: E402

from core.config import settings  # noqa: E402
from core.queues import OCR_QUEUE  # noqa: E402
from db.pool import create_db_pool  # noqa: E402
from providers.storage import get_storage_provider  # noqa: E402

DONE = {"graded", "failed", "needs_reupload", "quota_exceeded", "reviewed", "published"}


async def main(a) -> None:
    pool = await create_db_pool(min_size=1, max_size=3)
    storage = get_storage_provider(await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY))
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))

    photos = find_photos(a.only)
    if not photos:
        sys.exit("tidak ada foto di samples/e2e")
    tag = uuid.uuid4().hex[:8]
    print(f"tag = {tag} | mahasiswa: { {k: len(v) for k, v in photos.items()} } halaman")

    try:
        ids = await seed(pool, storage, photos, tag)

        # yang di-enqueue HANYA ocr_page. grade_student harus ter-enqueue sendiri oleh ocr_page
        # saat halaman terakhir selesai -> itu yang sedang dites.
        for nim in photos:
            for page_id in ids["pages"][nim]:
                job = await redis.enqueue_job("ocr_page", str(page_id),
                                              _job_id=f"ocr:{page_id}", _queue_name=OCR_QUEUE)
                print(f"  enqueue ocr_page {page_id} -> {'ok' if job else 'SUDAH ADA (job_id sama)'}")

        st_ids = list(ids["student_tests"].values())
        started, last = time.monotonic(), None
        while True:
            rows = await pool.fetch(
                "select id, status, pages_done, total_pages from student_tests where id = any($1::uuid[])",
                st_ids)
            now = sorted(f"{r['status']} {r['pages_done']}/{r['total_pages']}" for r in rows)
            if now != last:
                print(f"  [{time.monotonic() - started:5.0f}s] {now}")
                last = now
            if all(r["status"] in DONE for r in rows):
                break
            if time.monotonic() - started > a.timeout:
                print(f"  TIMEOUT {a.timeout}s. Cek: dua worker jalan? Lihat log terminal worker.")
                break
            await asyncio.sleep(3)

        for nim in photos:
            st_id = ids["student_tests"][nim]
            print(f"\n{'=' * 70}\n{nim}  {STUDENTS.get(nim, '')}  student_test={st_id}")
            print("-- OCR")
            await show_ocr(pool, st_id)
            print("-- HASIL")
            await show_result(pool, st_id)
    finally:
        if a.cleanup:
            await purge(pool, storage, tag)
        else:
            print(f"\ndata DISIMPAN. Hapus nanti: python -m scripts.test_full_e2e --purge {tag}")
        await redis.aclose()
        await pool.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="NIM tertentu saja")
    ap.add_argument("--timeout", type=int, default=600, help="detik menunggu sampai semua selesai")
    ap.add_argument("--cleanup", action="store_true", help="hapus data seed setelah selesai")
    args = ap.parse_args()
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main(args))