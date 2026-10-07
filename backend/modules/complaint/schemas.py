"""Bentuk body request modul complaint. (sudah lengkap, tinggal dibaca)"""
from typing import Literal

from pydantic import BaseModel, Field


class ResolveIn(BaseModel):
    """Body POST /complaints/{id}/resolve."""
    status: Literal["accepted", "rejected"]
    teacher_response: str = Field(min_length=3, max_length=2000)  
    new_grade: float | None = Field(default=None, ge=0)
