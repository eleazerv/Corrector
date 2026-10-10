from uuid import UUID

from pydantic import BaseModel


# ============================================================
# CLASS
# ============================================================

class CreateClassRequest(BaseModel):
    name: str
    code: str
    description: str | None = None
    teacher_id: UUID | None = None


class UpdateClassRequest(BaseModel):
    name: str
    code: str
    description: str | None = None
    teacher_id: UUID | None = None


class ClassStudentResponse(BaseModel):
    id: UUID
    nim: str
    name: str
    email: str


class ClassTestResponse(BaseModel):
    id: UUID
    test_id: UUID
    test_name: str
    status: str
    test_date: str


class ClassResponse(BaseModel):
    id: UUID
    school_id: UUID
    teacher_id: UUID | None
    teacher_name: str | None
    name: str
    code: str
    description: str | None
    student_count: int
    test_count: int


class ClassListResponse(BaseModel):
    items: list[ClassResponse]
    total: int


class ClassDetailResponse(ClassResponse):
    students: list[ClassStudentResponse]
    tests: list[ClassTestResponse]


# ============================================================
# CLASS STUDENTS
# ============================================================

class AddStudentsRequest(BaseModel):
    student_ids: list[UUID] = []
    nims: list[str] = []


class ClassStudentListResponse(BaseModel):
    items: list[ClassStudentResponse]
    total: int


# ============================================================
# SCHOOL STUDENTS SEARCH
# ============================================================

class SchoolStudentResponse(BaseModel):
    id: UUID
    nim: str
    name: str
    email: str


class SchoolStudentListResponse(BaseModel):
    items: list[SchoolStudentResponse]
    total: int