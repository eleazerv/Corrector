"""Bentuk body request modul student. (sudah lengkap, tinggal dibaca)"""
from uuid import UUID

from pydantic import BaseModel, Field


class ComplaintIn(BaseModel):
    # None = keberatan untuk lembar secara umum, bukan 1 soal tertentu
    test_answer_id: UUID | None = None
    complaint: str = Field(min_length=10, max_length=4000)
