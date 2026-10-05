"""
post /class-test/{id}/uploads 
post /class-test/{id}/zip 
post /student-test/{id}/pages/{page_no}/reupload 
get /class-test/{id}/progress 
get /class-tests/{id}/events (SSE) 
"""

import asyncio
from uuid import UUID
import asyncpg 
from fastapi import APIRouter , Depends , File , Form , Request , UploadFile 
from fastapi.responses import StreamingResponse 

from core.access import ensure_class_test_access, ensure_student_test_access
from core.deps import (CurrentUser, TeacherUser, get_arq, get_current_user_sse, get_pool, get_redis,
                       get_storage)

from core.errors import AppError, forbidden
from core.ratelimit import rate_limit

from . import service
from .schemas import ProgressOut, UploadOut, ZipOut

router = APIRouter(tags=["submission"])

# 1 kelas ~30-40 mahasiswa diupload satu per satu oleh frontend, jadi batasnya 60/menit
upload_limit = Depends(rate_limit("upload", 60))
SSE_PING_SECONDS = 15

@router.post("/class-tests/{class_test_id}/uploads",response_model=UploadOut , status_code=201,
             dependencies=[upload_limit])
async def upload_pages(
    class_test_id: UUID, 
    files: list[UploadFile] = File(..., description="Foto urut halaman (file pertama = halaman 1)"),
    student_id: UUID | None = Form(None),
    nim : str | None = Form(None),
    user : CurrentUser = TeacherUser, 
    db: asyncpg.Pool = Depends(get_pool),
    storage=Depends(get_storage),
    arq=Depends(get_arq) 
    ): 
    await ensure_class_test_access(db, user, class_test_id)
    student = await service.find_student(db, class_test_id, student_id, nim)
    images = await service.read_images(files)
    return await service.ingest_student_pages(db, storage, arq, class_test_id, student, images)


@router.post("/class-tests/{class_test_id}/zip", response_model=ZipOut, status_code=201, dependencies=[Depends(rate_limit("upload_zip", 5))])
async def upload_zip(
    class_test_id: UUID,
    file: UploadFile = File(..., description="ZIP berisi NIM_halaman.jpg, maks 50 MB"),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    storage=Depends(get_storage),
    arq=Depends(get_arq),
):
    """ zip dibongkar di sini ( menerima gambar maks 10 mb sehingga zip tidak bisa disimpan di storage)"""
    await ensure_class_test_access(db, user, class_test_id)
    data = await file.read(service.MAX_ZIP_BYTES + 1)
    if len(data) > service.MAX_ZIP_BYTES:  
        raise AppError("FILE_TOO_LARGE", f"ZIP exceeds {service.MAX_ZIP_BYTES // (1024 * 1024)} MB", 413)
    return await service.ingest_zip_upload(db, storage, arq, class_test_id, data)

@router.post("/student-tests/{student_test_id}/pages/{page_no}/reupload", dependencies=[upload_limit])
async def reupload_page(
    student_test_id: UUID,
    page_no: int,
    file: UploadFile = File(...),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    storage=Depends(get_storage),
    arq=Depends(get_arq),
):
    #pastiin student nya bisa akses dan cek imagenya 
    await ensure_student_test_access(db, user, student_test_id)
    image = (await service.read_images([file]))[0]
    return await service.reupload_page(db, storage, arq, student_test_id, page_no, image)


@router.get("/class-tests/{class_test_id}/progress", response_model=ProgressOut)
async def progress(
    class_test_id: UUID,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    """Daftar semua anggota kelas + status lembarnya. needs_review di atas.
    Mahasiswa yang belum upload muncul dengan status 'absent' dan student_test_id null."""
    await ensure_class_test_access(db, user, class_test_id)
    return await service.progress(db, class_test_id)


@router.get("/class-tests/{class_test_id}/events")  
async def events(
    request: Request,
    class_test_id: UUID,
    user: CurrentUser = Depends(get_current_user_sse),
    db: asyncpg.Pool = Depends(get_pool),
    redis=Depends(get_redis),
): 
    """Server-Sent Events. Frontend:  new EventSource(`.../events?access_token=${token}`)

    Tiap pesan = JSON yang di-publish worker ke channel Redis class_test:{id}
    (mis. {"event": "question_graded", "student_test_id": ...}).
    """
    if user.role != "teacher": 
        raise forbidden()
    await ensure_class_test_access(db, user, class_test_id)
    channel = f"class_test:{class_test_id}"
    
    async def stream(): 
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try: 
            yield "retry:5000\n\n"
            while not await request.is_disconnected(): 
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=SSE_PING_SECONDS)
                if msg is None : 
                    yield ":ping\n\n"
                    continue 
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8","replace")
                yield f"data: {data}\n\n"
        except asyncio.CancelledError: 
            pass 
        finally: 
            await pubsub.unsubscribe(channel)  
            await pubsub.aclose()
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}) 