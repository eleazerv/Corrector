"""Bentuk body request modul calibration. (sudah lengkap, tinggal dibaca)"""
from uuid import UUID

from pydantic import BaseModel, Field


class CalibrationIn(BaseModel):
    """Body POST /class-tests/{id}/calibration: nilai dosen untuk 1 jawaban."""
    test_answer_id: UUID
    teacher_grade: float = Field(ge=0)
    teacher_criteria_result: list[dict] | None = None
