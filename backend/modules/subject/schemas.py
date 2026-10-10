from uuid import UUID

from pydantic import BaseModel


# ============================================================
# SUBJECT
# ============================================================

class CreateSubjectRequest(BaseModel):
    name: str
    code: str
    description: str


class UpdateSubjectRequest(BaseModel):
    name: str
    code: str
    description: str


class SubjectCoordinatorResponse(BaseModel):
    id: UUID
    teacher_id: UUID
    teacher_name: str
    teacher_email: str


class SubjectResponse(BaseModel):
    id: UUID
    school_id: UUID
    name: str
    code: str
    description: str
    coordinators: list[SubjectCoordinatorResponse]


class SubjectListResponse(BaseModel):
    items: list[SubjectResponse]
    total: int


# ============================================================
# COORDINATORS
# ============================================================

class UpdateCoordinatorsRequest(BaseModel):
    teacher_ids: list[UUID]


# ============================================================
# SUBJECT RULES
# ============================================================

class CreateSubjectRuleRequest(BaseModel):
    title: str
    rule: str
    category: str


class UpdateSubjectRuleRequest(BaseModel):
    title: str
    rule: str
    category: str
    is_active: bool


class SubjectRuleResponse(BaseModel):
    id: UUID
    subject_id: UUID
    title: str
    rule: str
    category: str
    is_active: bool
    created_by: UUID | None
    updated_by: UUID | None


class SubjectRuleListResponse(BaseModel):
    items: list[SubjectRuleResponse]
    total: int