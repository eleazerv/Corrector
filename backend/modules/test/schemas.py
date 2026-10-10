from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================
# TEST
# ============================================================

class CreateTestRequest(BaseModel):
    subject_id: UUID
    name: str
    max_score: int = 100
    test_type: str


class UpdateTestRequest(BaseModel):
    name: str
    max_score: int = 100
    test_type: str
    status: str | None = None


class TestResponse(BaseModel):
    id: UUID
    subject_id: UUID
    subject_name: str
    maker_id: UUID | None
    maker_name: str | None
    name: str
    max_score: int
    test_type: str
    status: str
    question_count: int


class TestListResponse(BaseModel):
    items: list[TestResponse]
    total: int


# ============================================================
# QUESTIONS
# ============================================================

class CriteriaRequest(BaseModel):
    description: str
    points: int


class CreateQuestionRequest(BaseModel):
    number: int
    question_type: str = "essay"
    question_text: str
    max_points: int
    key_answer: str
    criteria: list[CriteriaRequest] = Field(default_factory=list)


class UpdateQuestionRequest(BaseModel):
    number: int
    question_type: str = "essay"
    question_text: str
    max_points: int
    key_answer: str


class CriteriaResponse(BaseModel):
    id: UUID
    question_id: UUID
    description: str
    points: int


class QuestionResponse(BaseModel):
    id: UUID
    test_id: UUID
    number: int
    question_type: str
    question_text: str
    max_points: int
    key_answer: str
    criteria: list[CriteriaResponse]


# ============================================================
# TEST DETAIL
# ============================================================

class TestDetailResponse(TestResponse):
    questions: list[QuestionResponse]


# ============================================================
# CLASS TEST
# ============================================================

class CreateClassTestRequest(BaseModel):
    class_id: UUID
    test_id: UUID
    corrector_id: UUID | None = None
    test_date: datetime


class UpdateClassTestRequest(BaseModel):
    corrector_id: UUID | None = None
    test_date: datetime
    status: str | None = None


class ClassTestResponse(BaseModel):
    id: UUID
    class_id: UUID
    class_name: str
    test_id: UUID
    test_name: str
    corrector_id: UUID | None
    corrector_name: str | None
    status: str
    test_date: datetime
    student_count: int


class ClassTestListResponse(BaseModel):
    items: list[ClassTestResponse]
    total: int


class ClassTestDetailResponse(ClassTestResponse):
    total_pages: int
    completed_pages: int