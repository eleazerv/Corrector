import asyncio
import io
import re
import zipfile

from collections import Counter, defaultdict
from pathlib import PurePosixPath
from uuid import UUID

import asyncpg
from fastapi import UploadFile

from core import jobs
from core.errors import AppError, conflict, not_found
from core.logging import log
from modules.shared import (IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PAGES_PER_STUDENT, SHEET_REPLACEABLE,
                            num, page_key)
UPLOAD_CONCURRENCY = 4                    # upload paralel ke storage per mahasiswa

MAX_ZIP_BYTES = 50 * 1024 * 1024
MAX_ZIP_ENTRIES = 2000
MAX_ZIP_TOTAL_BYTES = 300 * 1024 * 1024   # total setelah diekstrak (cegah zip bomb)
#   2501234567_1.jpg   2501234567-p2.png   2501234567_page03.jpeg
ZIP_NAME_RE = re.compile(r"^(?P<nim>\d{6,15})[_\-](?:p|page)?(?P<page>\d{1,3})$", re.IGNORECASE)

def sniff_image(data: bytes) -> str | None:
    """Tipe gambar dari ISI file (bukan dari header kiriman client, yang bisa dipalsukan)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None

def check_image (data:bytes , name :str) -> tuple[bytes,str] :
    """Tipe gambar dari ISI file (bukan dari header kiriman client, yang bisa dipalsukan)."""
    if not data :
        raise AppError("VALIDATION_ERROR", f"File '{name}' is empty", 422)
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError("FILE_TOO_LARGE", f"File '{name}' exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MB", 413)
    ctype = sniff_image(data)
    if ctype is None:
        raise AppError("UNSUPPORTED_MEDIA_TYPE", f"File '{name}' is not a JPEG, PNG or WebP image", 415)
    return data , ctype

async def read_images(files: list[UploadFile]) -> list[tuple[bytes,str]] :
    """
    baca semua file yang di upload , urutan file = urutan halaman
    """
    if not files :
        raise AppError("VALIDATION_ERROR", "At least one image is required", 422)
    if len(files) > MAX_PAGES_PER_STUDENT:
        raise AppError("TOO_MANY_PAGES", f"Maximum {MAX_PAGES_PER_STUDENT} pages per student", 413)
    out = []
    for f in files:
        data = await f.read(MAX_IMAGE_BYTES + 1)
        out.append(check_image(data, f.filename))
    return out


STUDENT_IN_CLASS_TEST_SQL = """
select s.id, s.nim, s.name, s.school_id
from class_tests ct
join student_classes sc on sc.class_id = ct.class_id
join students s on s.id = sc.student_id
where ct.id = $1 and (s.id = $2 or s.nim = $3)
"""


ROSTER_SQL = """
select s.id, s.nim , s.name , s.school_id
from class_tests ct
join student_classes sc on sc.class_id = ct.class_id
join students s on s.id = sc.student_id
where ct.id = $1
"""

TEST_READY_SQL = """
select t.status, (select count(*) from test_questions q where q.test_id = t.id) as question_count
from class_tests ct join tests t on t.id = ct.test_id
where ct.id = $1
"""

async def ensure_test_ready(db, class_test_id: UUID) -> None:
    row = await db.fetchrow(TEST_READY_SQL, class_test_id)
    if row is None:
        raise not_found("Class test")
    if row["status"] != "ready" or row["question_count"] == 0:
        raise AppError("TEST_NOT_READY",
                       "Questions are not finalized. Mark the test as ready before uploading answer sheets", 409)


async def find_student(db , class_test_id: UUID , student_id: UUID | None , nim: str | None):
    """ ngecek siswa ada ga di kelas yang ikut ujian """
    if student_id is None and not nim :
        raise AppError("VALIDATION_ERROR", "student_id or nim is required", 422)
    row = await db.fetchrow(STUDENT_IN_CLASS_TEST_SQL,class_test_id,student_id, (nim or "").strip() or None)
    if row is None :
        raise not_found("student in this class")
    return row


async def ingest_student_pages(db : asyncpg.Pool , storage , arq , class_test_id : UUID ,student , images: list[tuple[bytes,str]]) -> dict :
    """ simpan foto 1 mahasiswa (zip) lalu antriin ke OCR
        student -> cek dlu ada ga di class_test yang ada
        foto boleh ditimpa kalo absent / needs_reupload / failed
    """

    existing = await db.fetchrow(" select id , status from student_tests where class_test_id = $1 and student_id = $2",
                                 class_test_id,student["id"])
    if existing and existing["status"] not in SHEET_REPLACEABLE:
        raise conflict(f"student alraedy has an answer sheet (status: {existing['status']})")

    keys = [page_key(student["school_id"],class_test_id,student["id"],i,IMAGE_TYPES[ctype]) for i,(_,ctype) in enumerate(images,start=1)]
    sem = asyncio.Semaphore(UPLOAD_CONCURRENCY)

    async def put (key:str , data:bytes , ctype:str) -> None :
        async with sem :
            await storage.upload(key,data,ctype)

    #upload images nya barengan
    await asyncio.gather(*(put(k,d,c) for k,(d,c) in zip(keys,images)))

    # pakai conn transaction biar ga ada data nyangkut
    async with db.acquire() as conn, conn.transaction():
        #cek apakah udah ada belom
        row = await conn.fetchrow(
            "select id, status from student_tests where class_test_id =$1 and student_id = $2 for update",
            class_test_id , student["id"]
        )
        old_paths: list[str] = []
        # kalo studentnya gaada langsung aja
        if row is None:
            st_id = await conn.fetchval(
            """insert into student_tests (class_test_id, student_id, total_pages, pages_done, status)
                values ($1, $2, $3, 0, 'ocr_queued') returning id""",
            class_test_id, student["id"], len(images))
        # kalo udah ada
        else :
            if row["status"] not in SHEET_REPLACEABLE:
                raise conflict(f"Student already has an answer sheet (status: {row['status']})")
            st_id = row["id"]

            #ambil old_paths dan execute delete dari tests_answers dan test_pages
            #update student_tests jadi 0 lagi agar ocr bisa run
            old_paths = [r["image_path"] for r in await conn.fetch("select image_path from test_pages where student_test_id = $1",st_id)]
            await conn.execute("delete from test_answers where student_test_id = $1", st_id)
            await conn.execute("delete from test_pages where student_test_id = $1", st_id)
            await conn.execute(
                """update student_tests
                   set total_pages = $2, pages_done = 0, status = 'ocr_queued',
                       total_grade = null, needs_review = false
                   where id = $1""", st_id, len(images))
        # Tadinya hanya jalan untuk lembar yang SUDAH ada; mahasiswa baru tidak dapat halaman.
        pages = []
        # untk setiap key baru bakal dibuat test_page baru dan set status pending
        for page_no , key in enumerate(keys, start=1):
            page_id = await conn.fetchval(
                """insert into test_pages (student_test_id, page_no, image_path, status)
                values ($1, $2, $3, 'pending') returning id""", st_id, page_no, key)
            pages.append({"id":page_id , "page_no": page_no})
        await conn.execute(
            """update class_tests set status = 'processing'
            where id = $1 and status in ('scheduled','uploading','reviewing')"""
            ,class_test_id
        )

    stale = [p for p in old_paths if p not in keys]
    if stale:
        try:
            await storage.delete(stale)
        except Exception as e :
            log.warning("upload: gagal hapus foto lama %s %s",stale[:3],e)

    enqueued = 0
    for p in pages :
        try :
            enqueued += await jobs.enqueue_ocr_page(arq,p["id"])
        except Exception as e:                                   # cron requeue_stuck akan menyusul
            log.warning("upload: gagal enqueue ocr page=%s: %s", p["id"], e)


    return {"student_test_id": st_id, "student_id": student["id"], "nim": student["nim"],
            "pages": pages, "enqueued": enqueued}


PAGE_FOR_REUPLOAD_SQL = """
select tp.id , tp.status , tp.image_path , st.class_test_id , st.student_id , st.status as sheet_status, c.school_id
from test_pages tp
join student_tests st on st.id = tp.student_test_id
join class_tests ct on ct.id = st.class_test_id
join classes c on c.id = ct.class_id
where tp.student_test_id = $1 and tp.page_no = $2
"""
async def reupload_page(db: asyncpg.Pool, storage, arq, student_test_id: UUID, page_no: int,
                        image: tuple[bytes, str]) -> dict:
    """Ganti 1 halaman yang gagal dibaca, lalu OCR ulang halaman itu saja."""
    page = await db.fetchrow(PAGE_FOR_REUPLOAD_SQL, student_test_id, page_no)

    if page is None :
        raise not_found(f"page {student_test_id} no {page_no} is not found")
    if page["status"] not in ("needs_reupload","failed") :
        raise conflict(f"page doesnt need to be reuploaded")


    data, ctype = image
    key = page_key(school_id=page["school_id"],class_test_id=page["class_test_id"],student_id=page["student_id"],page_no=page_no,ext=IMAGE_TYPES[ctype])
    await storage.upload(key, data, ctype)

    async with db.acquire() as conn, conn.transaction():

        await conn.execute("""update test_pages set image_path = $2, status = 'pending',ocr_result = null, error = null where id = $1 """,page["id"],key)
        # pages_done dihitung ulang dari halaman yang benar-benar sukses
        await conn.execute(
            """update student_tests st
               set status = 'ocr_queued',
                   pages_done = (select count(*) from test_pages
                                 where student_test_id = st.id and status = 'success')
               where st.id = $1""", student_test_id)

        await conn.execute("""update class_tests set status ='processing'
                           where id = $1 and status in ('scheduled','uploading','reviewing')""",page["class_test_id"])
    if page["image_path"] != key:
        try:
            await storage.delete([page["image_path"]])
        except Exception as e :
            log.warning("reupload: gagal hapus foto lama %s %s", page["image_path"],e)

    queued = await jobs.enqueue_ocr_page(arq, page["id"],again=True)
    return {"student_test_id": student_test_id, "page": {"id": page["id"], "page_no": page_no},
            "enqueued": int(queued)}


HEADER_SQL = """
select ct.id , ct.status , ct.published_at , t.name as test_name , t.max_score
from class_tests ct join tests t on t.id = ct.test_id
where ct.id =$1
"""
PROGRESS_SQL = """
with roster as (
    select sc.student_id
    from student_classes sc join class_tests ct on ct.class_id = sc.class_id
    where ct.id = $1
    union
    select student_id from student_tests where class_test_id = $1
)
select s.id as student_id, s.nim, s.name,
       st.id as student_test_id,
       coalesce(st.status, 'absent') as status,
       coalesce(st.pages_done, 0) as pages_done,
       coalesce(st.total_pages, 0) as total_pages,
       st.total_grade,
       coalesce(st.needs_review, false) as needs_review
from roster r
join students s on s.id = r.student_id
left join student_tests st on st.class_test_id = $1 and st.student_id = s.id
order by coalesce(st.needs_review, false) desc, s.nim
"""


async def progress(db,class_test_id: UUID) -> dict :
    head = await db.fetchrow(HEADER_SQL, class_test_id)
    if head is None :
        raise not_found("Class test")
    items = [{**dict(r), "total_grade": num(r["total_grade"])} for r in await db.fetch(PROGRESS_SQL,class_test_id)]

    return {
        "class_test_id": head["id"], "class_test_status": head["status"],
        "test_name": head["test_name"], "max_score": num(head["max_score"]),
        "published_at": head["published_at"],
        "summary": {"total": len(items),
                    "by_status": dict(Counter(i["status"] for i in items)),
                    "needs_review": sum(1 for i in items if i["needs_review"])},
        "items": items,
    }


def read_zip(zip_bytes: bytes) -> tuple[dict[str, dict[int, bytes]], list[str]]:
    """Baca ZIP -> ({nim: {halaman: bytes}}, [file yang tidak cocok]). BLOCKING -> panggil via to_thread."""
    pages: dict[str, dict[int, bytes]] = defaultdict(dict)
    unmatched: list[str] = []
    total = 0
    try:
        # baca file zip
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        #invalid zip
        raise AppError("VALIDATION_ERROR", "File is not a valid ZIP", 422)
    with zf:
        infos = zf.infolist()
        #cek banyak entries nya
        if len(infos) > MAX_ZIP_ENTRIES:
            raise AppError("VALIDATION_ERROR", f"ZIP has more than {MAX_ZIP_ENTRIES} entries", 422)
        # untuk setiap file buat name , path nya
        for info in infos:
            name = info.filename
            path = PurePosixPath(name)
            if info.is_dir() or "__MACOSX" in path.parts or path.name.startswith("."):
                continue
            m = ZIP_NAME_RE.match(path.stem)        # kelasA/2501_1.jpg -> stem "2501_1"
            # cek apakah sesuai dengan mime type yang diizinin
            if not m or path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                unmatched.append(name)
                continue
            # kalo file size ny melebihi raise error
            if info.file_size > MAX_IMAGE_BYTES:
                raise AppError("FILE_TOO_LARGE", f"'{name}' exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MB", 413)
            total += info.file_size
            # kalo file kegedean
            if total > MAX_ZIP_TOTAL_BYTES:
                raise AppError("FILE_TOO_LARGE", "ZIP content is too large after extraction", 413)
            # ambil nim dari regex
            nim, page_no = m["nim"], int(m["page"])
            if page_no in pages[nim]:               # halaman dobel -> yang kedua diabaikan
                unmatched.append(name)
                continue
            pages[nim][page_no] = zf.read(info)
    return dict(pages), unmatched


async def ingest_zip_upload(db, storage, arq, class_test_id: UUID, zip_bytes: bytes) -> dict:
    """ZIP 1 kelas -> lembar per mahasiswa. Nama file: NIM_halaman.jpg (boleh di dalam folder)."""
    # read zip
    pages_by_nim, unmatched_files = await asyncio.to_thread(read_zip, zip_bytes)
    roster = {r["nim"]: r for r in await db.fetch(ROSTER_SQL, class_test_id)}

    uploaded, skipped = [], []
    # loop dict ( page , nim )
    for nim in sorted(pages_by_nim):
        #kalo nim gaada di kelas continue
        if nim not in roster:
            continue
        # ambil page nim nya
        by_page = pages_by_nim[nim]
        try:
            # halaman diurutkan menurut nomor di nama file, lalu dinomori ulang 1..n
            images = [check_image(by_page[p], f"{nim}_{p}") for p in sorted(by_page)]
            # kalo length page per student lebih raise error
            if len(images) > MAX_PAGES_PER_STUDENT:
                raise AppError("VALIDATION_ERROR", f"Max {MAX_PAGES_PER_STUDENT} pages per student", 422)
            #append upload
            uploaded.append(await ingest_student_pages(db, storage, arq, class_test_id, roster[nim], images))
        except AppError as e:                       # 1 mahasiswa bermasalah != seluruh ZIP gagal
            #error append
            skipped.append({"nim": nim, "reason": e.message})

    return {
        "students": len(uploaded),
        "pages": sum(len(u["pages"]) for u in uploaded),
        "enqueued": sum(u["enqueued"] for u in uploaded),
        "uploaded": uploaded, "skipped": skipped,
        "unmatched_nims": sorted(n for n in pages_by_nim if n not in roster),
        "unmatched_files": unmatched_files,
    }
