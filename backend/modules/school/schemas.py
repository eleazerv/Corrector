from uuid import UUID

from pydantic import BaseModel


class CreateTeacherRequest(BaseModel):
    name: str
    email: str
    code: str


class TeacherResponse(BaseModel):
    id: UUID
    user_id: UUID | None
    name: str
    email: str
    code: str
    school_id: UUID
    status: str


class TeacherCreatedResponse(TeacherResponse):
    initial_password: str


class TeacherListResponse(BaseModel):
    items: list[TeacherResponse]
    total: int


class UpdateTeacherRequest(BaseModel):
    name: str
    email: str
    code: str


class TeacherUpdatedResponse(TeacherResponse):
    pass


class CreateStudentRequest(BaseModel):
    nim: str
    name: str
    email: str


class StudentResponse(BaseModel):
    id: UUID
    user_id: UUID | None
    school_id: UUID
    nim: str
    name: str
    email: str


class StudentCreatedResponse(StudentResponse):
    initial_password: str


class StudentListResponse(BaseModel):
    items: list[StudentResponse]
    total: int


class CreateStudentBulkRequest(BaseModel):
    students: list[CreateStudentRequest]


class StudentBulkCreatedResponse(BaseModel):
    items: list[StudentCreatedResponse]
    total: int


class UpdateStudentRequest(BaseModel):
    nim: str
    name: str
    email: str


class StudentUpdatedResponse(StudentResponse):
    pass


class TeacherPlanResponse(BaseModel):
    teacher_id: UUID
    teacher_name: str
    token_used: int


class SchoolPlanResponse(BaseModel):
    plan_name: str
    grading_used: int
    grading_quota: int | None
    remaining_quota: int | None
    teachers: list[TeacherPlanResponse]