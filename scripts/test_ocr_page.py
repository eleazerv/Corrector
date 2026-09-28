"""
Test tasks/ocr_page.py langsung (tanpa ARQ, tanpa Redis).
Seed data minimal -> upload foto -> panggil ocr_page -> cek DB -> bersihin.

Pakai (dari root project):
    python -m scripts.test_ocr_page                    # OCR fake (gratis)
    python -m scripts.test_ocr_page --provider api     # Datalab beneran
    python -m scripts.test_ocr_page --keep             # jangan hapus data seed
"""
import argparse
import asyncio
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from supabase import acreate_client  # noqa: E402

from core.config import settings  # noqa: E402
from db.pool import create_db_pool  # noqa: E402
from providers.storage import get_storage_provider  # noqa: E402

SAMPLES = ROOT / "samples"
IMAGES = ["foto_jawaban.jpg", "foto_jawaban1.jpeg"]


# ------------------------------------------------------------------ stub Redis

class FakeRedis:
    """Nyatet panggilan enqueue_job / publish tanpa Redis beneran."""

    def __init__(self):
        self.enqueued: list[tuple] = []
        self.published: list[tuple] = []

    async def enqueue_job(self, name, *args, **kwargs):
        self.enqueued.append((name, args, kwargs))

    async def publish(self, channel, msg):
        self.published.append((channel, msg))


# ------------------------------------------------------------------ seed

async def seed(pool, storage, n_pages: int, tag: str) -> dict:
    """Bikin rantai FK minimal. Return semua id buat cleanup."""
    ids: dict = {"tag": tag, "keys": [], "users": []}
    async with pool.acquire() as c, c.transaction():
        teacher_uid, student_uid = uuid.uuid4(), uuid.uuid4()
        for uid, role in ((teacher_uid, "t"), (student_uid, "s")):
            await c.execute(
                "insert into auth.users (id, email) values ($1, $2)",
                uid, f"_test_{role}_{tag}@joints.test",
            )
        ids["users"] = [teacher_uid, student_uid]

        ids["school"] = await c.fetchval(
            "insert into schools (school, location) values ($1, 'test') returning id",
            f"_test_{tag}",
        )
        ids["teacher"] = await c.fetchval(
            """insert into teachers (user_id, email, code, school_id, name)
               values ($1, $2, $3, $4, 'Dosen Test') returning id""",
            teacher_uid, f"_test_t_{tag}@joints.test", f"T{tag}", ids["school"],
        )
        ids["subject"] = await c.fetchval(
            """insert into subjects (school_id, name, code, description)
               values ($1, 'Test Subject', $2, 'seed test') returning id""",
            ids["school"], f"S{tag}",
        )
        ids["class"] = await c.fetchval(
            """insert into classes (school_id, teacher_id, name, code, description)
               values ($1, $2, 'Kelas Test', $3, 'seed test') returning id""",
            ids["school"], ids["teacher"], f"C{tag}",
        )
        ids["test"] = await c.fetchval(
            """insert into tests (subject_id, maker_id, name, max_score, test_type, status)
               values ($1, $2, 'Ujian Test', 100, 'ASG', 'ready') returning id""",
            ids["subject"], ids["teacher"],
        )
        ids["class_test"] = await c.fetchval(
            """insert into class_tests (corrector_id, class_id, test_id, status, test_date)
               values ($1, $2, $3, 'processing', now()) returning id""",
            ids["teacher"], ids["class"], ids["test"],
        )
        ids["student"] = await c.fetchval(
            """insert into students (user_id, school_id, nim, name, email)
               values ($1, $2, $3, 'Mahasiswa Test', $4) returning id""",
            student_uid, ids["school"], f"N{tag}", f"_test_s_{tag}@joints.test",
        )
        ids["student_test"] = await c.fetchval(
            """insert into student_tests (class_test_id, student_id, total_pages, pages_done, status)
               values ($1, $2, $3, 0, 'ocr_queued') returning id""",
            ids["class_test"], ids["student"], n_pages,
        )

    ids["pages"] = []
    for i in range(n_pages):
        img = SAMPLES / IMAGES[i % len(IMAGES)]
        key = f"_test/{tag}/page_{i + 1}{img.suffix}"
        ctype = "image/png" if img.suffix == ".png" else "image/jpeg"
        await storage.upload(key, img.read_bytes(), ctype)
        ids["keys"].append(key)
        page_id = await pool.fetchval(
            """insert into test_pages (student_test_id, page_no, image_path, status)
               values ($1, $2, $3, 'pending') returning id""",
            ids["student_test"], i + 1, key,
        )
        ids["pages"].append(page_id)
    return ids


async def cleanup(pool, storage, ids: dict) -> None:
    async with pool.acquire() as c, c.transaction():
        await c.execute("delete from test_pages where student_test_id = $1", ids["student_test"])
        await c.execute("delete from student_tests where id = $1", ids["student_test"])
        await c.execute("delete from class_tests where id = $1", ids["class_test"])
        await c.execute("delete from tests where id = $1", ids["test"])
        await c.execute("delete from classes where id = $1", ids["class"])
        await c.execute("delete from subjects where id = $1", ids["subject"])
        await c.execute("delete from students where id = $1", ids["student"])
        await c.execute("delete from teachers where id = $1", ids["teacher"])
        await c.execute("delete from schools where id = $1", ids["school"])
        await c.execute("delete from auth.users where id = any($1::uuid[])", ids["users"])
    await storage.delete(ids["keys"])


# ------------------------------------------------------------------ helper cek

FAILS: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("  OK   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


async def page_rows(pool, student_test_id):
    return await pool.fetch(
        "select id, status, ocr_result, error from test_pages where student_test_id = $1 order by page_no",
        student_test_id,
    )


async def st_row(pool, student_test_id):
    return await pool.fetchrow(
        "select status, pages_done, total_pages from student_tests where id = $1", student_test_id,
    )


# ------------------------------------------------------------------ skenario

async def scenario_happy(pool, storage, ocr, ocr_page):
    print("\n[1] happy path: 2 halaman -> grading ke-enqueue 1x")
    tag = uuid.uuid4().hex[:8]
    ids = await seed(pool, storage, n_pages=2, tag=tag)
    redis = FakeRedis()
    ctx = {"db": pool, "storage": storage, "ocr": ocr, "redis": redis, "job_try": 1}
    try:
        r1 = await ocr_page(ctx, str(ids["pages"][0]))
        print("  page 1 ->", r1)
        st = await st_row(pool, ids["student_test"])
        check(st["pages_done"] == 1, f"setelah page 1: pages_done=1 (dapat {st['pages_done']})")
        check(st["status"] == "ocr_processing", f"status ocr_processing (dapat {st['status']})")
        check(len(redis.enqueued) == 0, "grading BELUM di-enqueue")

        r2 = await ocr_page(ctx, str(ids["pages"][1]))
        print("  page 2 ->", r2)
        st = await st_row(pool, ids["student_test"])
        check(st["pages_done"] == 2, f"pages_done=2 (dapat {st['pages_done']})")
        check(st["status"] == "grading", f"status grading (dapat {st['status']})")
        check(len(redis.enqueued) == 1, f"grade_student ke-enqueue 1x (dapat {len(redis.enqueued)})")
        if redis.enqueued:
            name, args, kw = redis.enqueued[0]
            check(name == "grade_student", "nama job grade_student")
            check(kw.get("_job_id") == f"grade:{ids['student_test']}", "job_id idempotent grade:<id>")

        for p in await page_rows(pool, ids["student_test"]):
            check(p["status"] == "success", f"page {p['id']} success")
            check(isinstance(p["ocr_result"], list) and len(p["ocr_result"]) > 0,
                  f"ocr_result berupa list, bukan string (tipe: {type(p['ocr_result']).__name__})")

        print("  -- jalanin ulang page 1 (simulasi job dobel)")
        r3 = await ocr_page(ctx, str(ids["pages"][0]))
        print("  page 1 lagi ->", r3)
        st = await st_row(pool, ids["student_test"])
        check(r3.get("skipped") is not None, "job dobel di-skip")
        check(st["pages_done"] == 2, "pages_done tetap 2")
        check(len(redis.enqueued) == 1, "grading tetap 1x")
        check(len(redis.published) > 0, f"event ter-publish ({len(redis.published)} event)")
    finally:
        return ids


async def scenario_empty(pool, storage, ocr_page):
    print("\n[2] OCR kosong -> needs_reupload, grading TIDAK jalan")
    from providers.ocr.fake import FakeOcr

    tag = uuid.uuid4().hex[:8]
    ids = await seed(pool, storage, n_pages=1, tag=tag)
    redis = FakeRedis()
    ctx = {"db": pool, "storage": storage, "ocr": FakeOcr(mode="empty"), "redis": redis, "job_try": 1}
    r = await ocr_page(ctx, str(ids["pages"][0]))
    print("  ->", r)
    p = (await page_rows(pool, ids["student_test"]))[0]
    st = await st_row(pool, ids["student_test"])
    check(p["status"] == "needs_reupload", f"page needs_reupload (dapat {p['status']})")
    check(st["status"] == "needs_reupload", f"student_test needs_reupload (dapat {st['status']})")
    check(len(redis.enqueued) == 0, "grading tidak di-enqueue")
    return ids


async def scenario_missing_file(pool, storage, ocr, ocr_page):
    print("\n[3] file tidak ada di bucket -> failed, tanpa retry")
    tag = uuid.uuid4().hex[:8]
    ids = await seed(pool, storage, n_pages=1, tag=tag)
    await storage.delete(ids["keys"])          # hapus filenya duluan
    await asyncio.sleep(3)                     # tunggu cache CDN
    ctx = {"db": pool, "storage": storage, "ocr": ocr, "redis": FakeRedis(), "job_try": 1}
    r = await ocr_page(ctx, str(ids["pages"][0]))
    print("  ->", r)
    p = (await page_rows(pool, ids["student_test"]))[0]
    check(r.get("error") == "image_not_found", f"error image_not_found (dapat {r.get('error')})")
    check(p["status"] == "failed", f"page failed (dapat {p['status']})")
    return ids


# ------------------------------------------------------------------ main

async def main(provider: str, keep: bool):
    import os
    os.environ["OCR_PROVIDER"] = provider
    from providers.ocr import get_ocr_provider
    from tasks.ocr_page import ocr_page

    pool = await create_db_pool(min_size=1, max_size=3)
    sb = await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    storage = get_storage_provider(sb)
    ocr = get_ocr_provider()
    await ocr.start()
    print(f"provider OCR = {ocr.name}")

    seeded = []
    try:
        seeded.append(await scenario_happy(pool, storage, ocr, ocr_page))
        seeded.append(await scenario_empty(pool, storage, ocr_page))
        seeded.append(await scenario_missing_file(pool, storage, ocr, ocr_page))
    finally:
        if keep:
            print("\n--keep: data seed TIDAK dihapus:", [s["tag"] for s in seeded])
        else:
            for ids in seeded:
                try:
                    await cleanup(pool, storage, ids)
                except Exception as e:
                    print(f"cleanup gagal tag={ids['tag']}: {e}")
        await ocr.close()
        await pool.close()

    print("\n" + ("SEMUA LOLOS" if not FAILS else f"{len(FAILS)} GAGAL:\n  - " + "\n  - ".join(FAILS)))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["fake", "api"], default="fake")
    ap.add_argument("--keep", action="store_true", help="jangan hapus data seed")
    a = ap.parse_args()
    asyncio.run(main(a.provider, a.keep))