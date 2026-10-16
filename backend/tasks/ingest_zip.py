import asyncio
import io
import re
import zipfile 
from collections import defaultdict
from pathlib import PurePosixPath 
from uuid import UUID 

from core.logging import log 


MAX_ENTRIES=2000 
MAX_FILE_BYTES=10*1024*1024
MAX_TOTAL_BYTES=100*1024*1024
ALLOWED_EXT = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}

#   2501234567_1.jpg   2501234567-p2.png   2501234567_page03.jpeg
FILENAME_RE = re.compile(r"^(?P<nim>\d{6,15})[_\-](?:p|page)?(?P<page>\d{1,3})$",re.IGNORECASE)


class IngestError(Exception): 
    """ ERROR INGEST """
    
    
def _read_zip(zip_bytes:bytes): 
    pages: dict[str,dict[int,tuple[bytes,str]]] = defaultdict(dict)
    unmatched: list[str] = []
    
    total = 0 
    
    try: 
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile: 
        raise IngestError("File is not a valid zip file")
    
    with zf : 
        infos =  zf.infolist()
        if len(infos) > MAX_ENTRIES : 
            raise IngestError(f"ZIP file has more than {MAX_ENTRIES} entries")
        for info in infos: 
            name = info.filename()
            path = PurePosixPath(name)
            
            if info.is_dir() or "__MACOSX" in path.parts or path.name.startwith("."): 
                continue 
            
            ext = path.suffix.lower()
            if ext not in ALLOWED_EXT: 
                unmatched.append(name)
                continue 
            
            if info.file_size > MAX_FILE_BYTES: 
                raise IngestError(f"File {name} exceeds maximum size of {MAX_FILE_BYTES}")
            
            total += info.file_size
            
            if total > MAX_TOTAL_BYTES: 
                raise IngestError(f"ZIP file exceeds maximum size of {MAX_TOTAL_BYTES}")
            
             # path.stem -> lgsg ambil namaf ile 
             # kelasABC/NIM_1.jpg lgsg kebaca NIM_1
            m = FILENAME_RE.match(path.stem)
            
            if not m: 
                unmatched.append(name)
                continue 
            
            nim, page_no = m["nim"], int(m["page"])
            if page_no in pages[nim]:
                unmatched.append(name)
                continue 
            
            pages[nim][page_no] = (zf.read(info),ALLOWED_EXT[ext])
            
    return dict(pages), unmatched 

STUDENTS_SQL = """
select s.id, s.nim , s.school_id 
from class_tests ct 
join student_classes sc on sc.class_id = ct.class_id
join students s on s.id = sc.student_id 
where ct.id = $1
"""


def _page_key (school_id: UUID, class_test_id: UUID, student_id:UUID , page_no: int, ext:str ) -> str : 
    return f"{school_id}/{class_test_id}/{student_id}-{page_no:03d}{ext}"


async def ingest_zip(ctx, class_test_id:str , zip_key: str) -> dict : 
    pool = ctx["db"]
    storage = ctx["storage"]
    arq = ctx["redis"]
    class_test_id = UUID(class_test_id)
    
    log.info("ingest_zip start clas_test=%s key=%s",class_test_id, zip_key)
    
    zip_bytes = await storage.download(zip_key)
    
    try: 
        pages_by_nim, unmatched_files = await asyncio.to_thread(_read_zip, zip_bytes)
    except IngestError as e: 
        log.warning("ingest_zip failed class_test=%s reason=%s",class_test_id, e)
        return {"ok": False , "error" : str(e)}
    
    finally : 
        del zip_bytes 
        
        
    rows = await pool.fetch(STUDENTS_SQL,class_test_id)
    students = {r["nim"]: r for r in rows}
    
    unmatched_nims = sorted(nim for nim in pages_by_nim if nim not in students)
    matched = { nim: p for nim, p in pages_by_nim.items()if nim in students}

    if not matched : 
        return {"ok": False, "error:" : "No student found in class", "unmatched_nims": unmatched_nims,"unmatched_files": unmatched_files}
    
    
    uploaded: dict[str, list[tuple[int,str]]] = {}
    for nim, pages in matched.items(): 
        st = students[nim]
        uploaded[nim] = []
        for page_no in sorted(pages): 
            data,content_type = pages[page_no]
            ext =".png" if content_type == "image/png" else ".jpg"
            key = _page_key(st["school_id"], class_test_id, st["id"], page_no, ext)
            await arq.set(key, data)
            uploaded[nim].append((page_no,key))
            
        page_ids: list[UUID] = []
        async with pool.acquire() as conn: 
            async with conn.transaction(): 
                for nim , page_list in uploaded.items(): 
                    st = students[nim]
                    
                    student_test_id = await conn.fetchval(
                        """
                        insert into student_test (class_test_id, student_id , total_pages, pages_done, status)
                        values ($1 , $2, $3 , 0, 'ocr_queued')
                        on conflict (class_test_id,student_id) do update
                            set total_pages = excluded.total_pages,
                            pages_done      = 0,
                            status          = 'ocr_queued'
                        returning id 
                        """
                    , class_test_id , st["id"],len(page_list),
                    )
                    
                    
                    await conn.execute (
                        "delete from test_pages where student_test_id = $1 and page_no <> all ($2::int[])"
                    ,   student_test_id, [p for p, _ in page_list]
                    )
                    
                    
                    for page_no , key in page_list : 
                        page_id = await conn.fetchval(
                            """
                            insert into test_pages (student_test_id, page_no,image_path,status)
                            values ($1, $2, $3, 'pending')
                            returning id
                            on conflict (student_test_id, page_no) do update
                                set image_path = excluded.image_path,
                                    status     = 'pending',
                                    ocr_result = null,
                                    error      = null
                            returning id                            
                            """,
                            student_test_id, page_no ,key,
                        )
                        page_ids.append(page_id)
                    
                    await conn.execute(
                        "update class_tests set status = 'processing' where id = $1 and status in ('scheduled', 'uploading')",
                        class_test_id,
                    )
        enqueued = 0
        for page_id in page_ids:
            job = await arq.enqueue_job("ocr_page", str(page_id), _job_id=f"ocr:{page_id}")
            if job is not None:
                enqueued += 1
    
        result = {
            "ok": True,
            "students": len(uploaded),
            "pages": len(page_ids),
            "enqueued": enqueued,
            "unmatched_nims": unmatched_nims,
            "unmatched_files": unmatched_files,
        }
        log.info("ingest_zip done class_test=%s %s", class_test_id, result)
        return result