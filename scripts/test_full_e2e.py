"""
E2E penuh TANPA ARQ/Redis: seed -> upload foto -> OCR -> grading LangGraph -> cetak hasil dari DB.

Taruh di:  scripts/test_full_e2e.py      Foto di: samples/e2e/<NIM>_<halaman>.jpg

Pakai (dari root project):
    python -m scripts.test_full_e2e                    # Datalab + LLM asli (sesuai .env), data DISIMPAN
    python -m scripts.test_full_e2e --ocr fake         # OCR palsu (cek alur saja, gratis)
    python -m scripts.test_full_e2e --only 2501000002  # 1 mahasiswa saja
    python -m scripts.test_full_e2e --cleanup          # hapus semua data seed setelah selesai
    python -m scripts.test_full_e2e --purge a1b2c3d4   # hapus data run lama berdasarkan tag

PENTING: semua kode jalan di bawah `if __name__ == "__main__":` (calculator pakai proses "spawn").
"""
import argparse
import asyncio
import os
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
PHOTOS = ROOT / "samples" / "e2e"
NAME_RE = re.compile(r"^(\d+)_(\d+)\.(jpe?g|png)$", re.I)

# ------------------------------------------------------------------ data ujian

STUDENTS = {"2501000001": "Mhs A (rapi)", "2501000002": "Mhs B (banyak salah)", "2501000003": "Mhs C (acak)"}

# (number, type, text, key, max_points, [(kriteria, poin), ...])
QUESTIONS = [
    (1, "objective", "Satuan SI untuk gaya adalah ... a. joule  b. newton  c. watt  d. pascal", "b", 10,
     [("Pilihan benar (b)", 10)]),
    (2, "objective", "Percepatan gravitasi bumi (m/s^2), isi dengan angka 1 desimal.", "9.8", 10,
     [("Jawaban 9.8", 10)]),
    (3, "essay", "Jelaskan Hukum I Newton dan berikan 1 contoh dalam kehidupan sehari-hari.",
     "Benda tetap diam atau bergerak lurus beraturan jika resultan gaya nol (inersia). "
     "Contoh: penumpang terdorong ke depan saat bus mengerem mendadak.", 20,
     [("Menyatakan benda tetap diam / bergerak lurus beraturan bila resultan gaya nol", 10),
      ("Menyebut istilah inersia / kelembaman", 4),
      ("Memberi 1 contoh nyata yang tepat", 6)]),
    (4, "calculation", "Sebuah mobil menempuh 150 m dalam 12 s. Hitung kecepatan rata-ratanya.",
     "v = s/t = 150/12 = 12,5 m/s", 20,
     [("Rumus v = s/t", 6), ("Substitusi 150/12", 6), ("Hasil 12,5", 6), ("Satuan m/s", 2)]),
    (5, "calculation", "Hitung integral x^2 dx dari 0 sampai 3.",
     "integral x^2 dx = x^3/3 ; batas 0..3 = 27/3 - 0 = 9", 20,
     [("Antiturunan x^3/3", 8), ("Substitusi batas 0 dan 3", 6), ("Hasil akhir 9", 6)]),
    (6, "calculation", "Diketahui f(x) = x^3 + 2x. Tentukan f'(x) dan f'(2).",
     "f'(x) = 3x^2 + 2 ; f'(2) = 3(2)^2 + 2 = 14", 20,
     [("Turunan f'(x) = 3x^2 + 2", 10), ("Substitusi x = 2", 4), ("Hasil f'(2) = 14", 6)]),
]

# (category, aspect, condition, direction, canonical_text, evidence_count)
TRAITS = [
    ("calculation", "satuan", "satuan tidak ditulis pada hasil akhir", "stricter",
     "Satuan tidak ditulis pada hasil akhir: kurangi 1 poin.", 5),
    ("calculation", "hasil akhir", "rumus benar tapi hitungan akhir salah", "lenient",
     "Rumus benar tapi hitungan akhir salah: beri setengah poin kriteria hasil.", 4),
    ("calculation", "kesalahan terbawa", "kesalahan dari langkah sebelumnya", "lenient",
     "Kesalahan yang terbawa dari langkah sebelumnya tidak dihukum dua kali.", 3),
]

# (title, rule, category)
RULES = [
    ("Contoh pada essay", "Jawaban essay tanpa contoh nyata: kriteria contoh diberi 0.", "essay"),
    ("Pembulatan", "Pembulatan sampai 2 desimal dianggap benar.", "calculation"),
]


class FakeRedis:
    """Pengganti Redis: ocr_page/grade_student cuma butuh enqueue_job + publish."""

    def __init__(self):
        self.enqueued, self.published = [], []

    async def enqueue_job(self, name, *args, **kwargs):
        self.enqueued.append((name, args, kwargs))

    async def publish(self, channel, msg):
        self.published.append((channel, msg))


def find_photos(only: str | None) -> dict[str, list[tuple[int, Path]]]:
    out: dict[str, list] = {}
    for p in sorted(PHOTOS.iterdir()):
        m = NAME_RE.match(p.name)
        if not m:
            print(f"  lewati (nama tidak cocok NIM_halaman): {p.name}")
            continue
        nim, page = m.group(1), int(m.group(2))
        if only and nim != only:
            continue
        out.setdefault(nim, []).append((page, p))
    return {nim: sorted(v) for nim, v in out.items()}


# ------------------------------------------------------------------ seed

async def seed(pool, storage, photos: dict, tag: str) -> dict:
    ids: dict = {"tag": tag, "keys": [], "users": [], "students": [], "student_tests": {}, "pages": {}}
    async with pool.acquire() as c, c.transaction():
        async def user(role: str):
            uid = uuid.uuid4()
            await c.execute("insert into auth.users (id, email) values ($1, $2)",
                            uid, f"_e2e_{role}_{tag}@joints.test")
            ids["users"].append(uid)
            return uid

        t_uid = await user("t")
        ids["school"] = await c.fetchval(
            "insert into schools (school, location) values ($1, 'e2e') returning id", f"_e2e_{tag}")
        ids["teacher"] = await c.fetchval(
            """insert into teachers (user_id, email, code, school_id, name)
               values ($1, $2, $3, $4, 'Dosen E2E') returning id""",
            t_uid, f"_e2e_t_{tag}@joints.test", f"T{tag}", ids["school"])
        ids["subject"] = await c.fetchval(
            """insert into subjects (school_id, name, code, description)
               values ($1, 'Fisika & Kalkulus Dasar', $2, 'seed e2e') returning id""",
            ids["school"], f"S{tag}")
        for title, rule, cat in RULES:
            await c.execute(
                """insert into subject_rules (subject_id, title, rule, category, is_active)
                   values ($1, $2, $3, $4, true)""", ids["subject"], title, rule, cat)
        ids["class"] = await c.fetchval(
            """insert into classes (school_id, teacher_id, name, code, description)
               values ($1, $2, 'Kelas E2E', $3, 'seed e2e') returning id""",
            ids["school"], ids["teacher"], f"C{tag}")
        # embedding dibiarkan NULL: retrieve_traits tidak memakainya (hanya build_trait untuk dedup)
        for cat, aspect, cond, direction, text, ev in TRAITS:
            await c.execute(
                """insert into teacher_traits (teacher_id, subject_id, class_id, category, aspect, condition,
                                               direction, canonical_text, evidence_count, last_seen, is_active)
                   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), true)""",
                ids["teacher"], ids["subject"], ids["class"], cat, aspect, cond, direction, text, ev)
        ids["test"] = await c.fetchval(
            """insert into tests (subject_id, maker_id, name, max_score, test_type, status)
               values ($1, $2, 'Kuis E2E', 100, 'ASG', 'ready') returning id""",
            ids["subject"], ids["teacher"])
        for number, qtype, text, key, pts, criteria in QUESTIONS:
            qid = await c.fetchval(
                """insert into test_questions (test_id, number, question_type, question_text, max_points, key_answer)
                   values ($1, $2, $3, $4, $5, $6) returning id""",
                ids["test"], number, qtype, text, pts, key)
            for desc, p in criteria:
                await c.execute(
                    "insert into question_criteria (question_id, description, points) values ($1, $2, $3)",
                    qid, desc, p)
        ids["class_test"] = await c.fetchval(
            """insert into class_tests (corrector_id, class_id, test_id, status, test_date)
               values ($1, $2, $3, 'processing', now()) returning id""",
            ids["teacher"], ids["class"], ids["test"])

        for nim, pages in photos.items():
            s_uid = await user(f"s{nim}")
            sid = await c.fetchval(
                """insert into students (user_id, school_id, nim, name, email)
                   values ($1, $2, $3, $4, $5) returning id""",
                s_uid, ids["school"], nim, STUDENTS.get(nim, f"Mhs {nim}"), f"_e2e_{nim}_{tag}@joints.test")
            ids["students"].append(sid)
            await c.execute("insert into student_classes (student_id, class_id) values ($1, $2)",
                            sid, ids["class"])
            # quota_charged_at = now(): budget_guard menganggap kuota sudah dipotong, jadi sekolah
            # seed ini tidak perlu punya paket aktif (kalau tidak -> langsung quota_exceeded).
            ids["student_tests"][nim] = await c.fetchval(
                """insert into student_tests (class_test_id, student_id, total_pages, pages_done, status,
                                              quota_charged_at)
                   values ($1, $2, $3, 0, 'ocr_queued', now()) returning id""",
                ids["class_test"], sid, len(pages))

    for nim, pages in photos.items():                       # upload di luar transaksi
        ids["pages"][nim] = []
        for page_no, path in pages:
            key = f"_e2e/{tag}/{nim}-{page_no:03d}{path.suffix.lower()}"
            ctype = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
            await storage.upload(key, path.read_bytes(), ctype)
            ids["keys"].append(key)
            ids["pages"][nim].append(await pool.fetchval(
                """insert into test_pages (student_test_id, page_no, image_path, status)
                   values ($1, $2, $3, 'pending') returning id""",
                ids["student_tests"][nim], page_no, key))
    return ids


async def purge(pool, storage, tag: str) -> None:
    """Hapus semua data satu run berdasarkan tag (urut dari anak ke induk)."""
    school = await pool.fetchval("select id from schools where school = $1", f"_e2e_{tag}")
    if school is None:
        print(f"tag {tag} tidak ditemukan")
        return
    keys = [r["image_path"] for r in await pool.fetch(
        """select tp.image_path from test_pages tp
           join student_tests st on st.id = tp.student_test_id
           join students s on s.id = st.student_id where s.school_id = $1""", school)]
    st = "select st.id from student_tests st join students s on s.id = st.student_id where s.school_id = $1"
    tests = "select t.id from tests t join subjects sj on sj.id = t.subject_id where sj.school_id = $1"
    async with pool.acquire() as c, c.transaction():
        users = [r["user_id"] for r in await c.fetch(
            """select user_id from teachers where school_id = $1
               union all select user_id from students where school_id = $1""", school)]
        for sql in [
            f"delete from test_answers where student_test_id in ({st})",
            f"delete from grading_runs where student_test_id in ({st})",
            f"delete from test_pages where student_test_id in ({st})",
            "delete from student_tests where student_id in (select id from students where school_id = $1)",
            f"delete from class_tests where test_id in ({tests})",
            f"delete from question_criteria where question_id in (select id from test_questions where test_id in ({tests}))",
            f"delete from test_questions where test_id in ({tests})",
            "delete from tests where subject_id in (select id from subjects where school_id = $1)",
            "delete from teacher_traits where teacher_id in (select id from teachers where school_id = $1)",
            "delete from student_classes where class_id in (select id from classes where school_id = $1)",
            "delete from classes where school_id = $1",
            "delete from subject_rules where subject_id in (select id from subjects where school_id = $1)",
            "delete from subjects where school_id = $1",
            "delete from students where school_id = $1",
            "delete from teachers where school_id = $1",
            "delete from schools where id = $1",
        ]:
            await c.execute(sql, school)
        await c.execute("delete from auth.users where id = any($1::uuid[])", users)
    if keys:
        await storage.delete(keys)
    print(f"tag {tag}: data + {len(keys)} file dihapus")


# ------------------------------------------------------------------ cetak

async def show_ocr(pool, student_test_id) -> None:
    rows = await pool.fetch(
        "select page_no, status, ocr_result, error from test_pages where student_test_id = $1 order by page_no",
        student_test_id)
    for r in rows:
        blocks = r["ocr_result"] or []
        print(f"  hal {r['page_no']}: {r['status']} | {len(blocks)} blok" + (f" | {r['error']}" if r["error"] else ""))
        for b in blocks:
            text = (b.get("text") or "").replace("\n", " / ") if isinstance(b, dict) else str(b)
            print(f"      [{b.get('id', '?') if isinstance(b, dict) else '?'}] {text[:110]}")


async def show_result(pool, student_test_id) -> None:
    rows = await pool.fetch(
        """select q.number, q.question_type, q.max_points, a.answer_status, a.answer_text, a.grade,
                  a.confidence_grading, a.needs_review, a.ocr_issue, a.criteria_result, a.grading_internal
           from test_questions q
           left join test_answers a on a.question_id = q.id and a.student_test_id = $1
           where q.test_id = (select ct.test_id from student_tests st
                              join class_tests ct on ct.id = st.class_test_id where st.id = $1)
           order by q.number""", student_test_id)
    for r in rows:
        if r["answer_status"] is None:
            print(f"  no {r['number']}: (tidak ada baris test_answers)")
            continue
        gi = r["grading_internal"] or {}
        review = "  REVIEW" if r["needs_review"] else ""
        print(f"  no {r['number']} [{r['question_type']}] {r['grade']}/{r['max_points']} "
              f"| {r['answer_status']} | conf {r['confidence_grading']}{review}")
        print(f"      jawaban : {(r['answer_text'] or '').replace(chr(10), ' / ')[:120]}")
        for cr in r["criteria_result"] or []:
            print(f"      kriteria: {cr.get('points')}/{cr.get('max_points')}  {str(cr.get('reasoning', ''))[:90]}")
        for cal in gi.get("calculations") or []:
            print(f"      hitung  : {cal}")
        if gi.get("traits_used"):
            print(f"      traits  : {len(gi['traits_used'])} dipakai")
        if gi.get("verify"):
            print(f"      verify  : {str(gi['verify'])[:120]}")
        for n in gi.get("notes") or []:
            print(f"      catatan : {n}")
        if gi.get("error"):
            print(f"      ERROR   : {gi['error']}")
        if r["ocr_issue"]:
            print(f"      ocr_issue: {r['ocr_issue']}")
    st = await pool.fetchrow("select status, total_grade from student_tests where id = $1", student_test_id)
    run = await pool.fetchrow(
        """select status, tokens_total, segment_method, questions_needs_review, error
           from grading_runs where student_test_id = $1 order by started_at desc limit 1""", student_test_id)
    print(f"  => student_test: {dict(st) if st else None}")
    print(f"  => grading_run : {dict(run) if run else None}")


# ------------------------------------------------------------------ main

async def main(a) -> None:
    os.environ["OCR_PROVIDER"] = a.ocr                      # harus sebelum import providers
    from supabase import acreate_client
    from core.config import settings
    from db.pool import create_db_pool
    from pipeline.checkpoint import create_checkpointer
    from providers.embedding import get_embedding_provider
    from providers.llm import get_llm_provider
    from providers.ocr import get_ocr_provider
    from providers.storage import get_storage_provider
    from tasks.grade_student import grade_student
    from tasks.ocr_page import ocr_page

    pool = await create_db_pool(min_size=1, max_size=5)
    storage = get_storage_provider(await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY))
    if a.purge:
        await purge(pool, storage, a.purge)
        await pool.close()
        return

    photos = find_photos(a.only)
    if not photos:
        sys.exit(f"tidak ada foto di {PHOTOS}")
    tag = uuid.uuid4().hex[:8]
    print(f"tag = {tag} | mahasiswa: { {k: len(v) for k, v in photos.items()} } halaman")

    ocr, llm, embedder = get_ocr_provider(), get_llm_provider(), get_embedding_provider()
    for p in (ocr, llm, embedder):
        await p.start()
    checkpointer, close_cp = await create_checkpointer(a.checkpoint, settings.DATABASE_URL)
    redis = FakeRedis()
    ctx = {"db": pool, "storage": storage, "ocr": ocr, "llm": llm, "embedder": embedder, "redis": redis,
           "llm_semaphore": asyncio.Semaphore(settings.LLM_CONCURRENCY), "checkpointer": checkpointer,
           "job_try": 1}
    print(f"ocr = {ocr.name} | llm = {llm.model} | checkpoint = {a.checkpoint}")

    try:
        ids = await seed(pool, storage, photos, tag)
        for nim in photos:
            st_id = ids["student_tests"][nim]
            print(f"\n{'=' * 70}\n{nim}  {STUDENTS.get(nim, '')}  student_test={st_id}")
            print("-- OCR")
            for page_id in ids["pages"][nim]:
                try:
                    r = await ocr_page(ctx, str(page_id))
                except Exception as e:                      # jaringan putus dll: lanjut ke mahasiswa berikutnya
                    print(f"  ocr_page CRASH -> {e!r}")
                    continue
                if not r.get("ok", True) or r.get("error"):
                    print(f"  ocr_page -> {r}")
            await show_ocr(pool, st_id)
            status = await pool.fetchval("select status from student_tests where id = $1", st_id)
            if status != "grading":
                print(f"  status = {status}, grading dilewati (OCR belum lengkap)")
                continue
            print("-- GRADING")
            r = await grade_student(ctx, str(st_id))
            print(f"  grade_student -> {r}")
            await show_result(pool, st_id)
    finally:
        if a.cleanup:
            await purge(pool, storage, tag)
        else:
            print(f"\ndata DISIMPAN. Hapus nanti: python -m scripts.test_full_e2e --purge {tag}")
        if close_cp is not None:
            await close_cp()
        for p in (ocr, llm, embedder):
            await p.close()
        await pool.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ocr", choices=["api", "fake"], default="api")
    ap.add_argument("--checkpoint", choices=["memory", "postgres", "none"], default="memory")
    ap.add_argument("--only", help="NIM tertentu saja")
    ap.add_argument("--cleanup", action="store_true", help="hapus data seed setelah selesai")
    ap.add_argument("--purge", metavar="TAG", help="hapus data run lama lalu keluar")
    args = ap.parse_args()
    if sys.platform == "win32":                             # psycopg (checkpoint postgres) butuh selector loop
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main(args))