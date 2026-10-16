
from uuid import UUID

from pydantic import BaseModel, Field


class OverrideIn(BaseModel):
    """Body POST /test-answers/{id}/override."""
    new_grade : float = Field(ge=0)
    reason : str = Field(min_length=3, max_length=2000)


class OverrideOut(BaseModel):
    """Response override. Isinya sama dengan dict yang dikembalikan service.apply_override."""
    override_id: UUID
    test_answer_id: UUID
    student_test_id: UUID
    old_grade: float | None
    new_grade: float
    total_grade: float
    needs_review: bool


class RegradeIn(BaseModel):
    """Body POST /student-tests/{id}/regrade. Body boleh kosong sama sekali."""
    question_ids: list[UUID] | None = None

