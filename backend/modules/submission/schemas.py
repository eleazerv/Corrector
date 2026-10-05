from uuid import UUID 

from pydantic import BaseModel 
class PageOut(BaseModel): 
    id: UUID 
    page_no: int 
    
    
class UploadOut(BaseModel): 
    student_test_id : UUID 
    student_id: UUID 
    nim : str 
    pages: list[PageOut]
    enqueued: int 
    
class ProgressItem(BaseModel): 
    student_id: UUID 
    nim: str 
    name: str 
    student_test_id : UUID | None 
    status : str 
    pages_done : int 
    total_pages: int 
    total_grade : float | None 
    needs_review : bool 
    

class ProgressOut(BaseModel): 
    class_test_id: UUID 
    class_test_status: str 
    test_name: str 
    max_score: float | None 
    published_at: object | None 
    summary: dict 
    items: list[ProgressItem]
    
    
class ZipOut(BaseModel):
    students: int                     # mahasiswa yang lembarnya berhasil dibuat
    pages: int
    enqueued: int
    uploaded: list[UploadOut]
    skipped: list[dict]               # [{"nim":..., "reason":...}] mis. lembar sudah dinilai
    unmatched_nims: list[str]         # NIM di ZIP yang bukan anggota kelas
    unmatched_files: list[str]        # nama file yang tidak cocok pola NIM_halaman
