"""Bentuk body request modul traits. (sudah lengkap, tinggal dibaca)"""
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TraitIn(BaseModel):
    """Trait yang ditulis dosen sendiri (source = manual).

    Contoh:
      aspect         "kesalahan terbawa"
      condition      "hasil akhir salah karena salah hitung di langkah awal, langkah berikutnya benar"
      direction      "lenient"
      canonical_text "Jika kesalahan hitung di awal terbawa ke langkah berikutnya, poin langkah
                      berikutnya tetap diberikan penuh selama metodenya benar."
    """
    subject_id: UUID
    aspect: str = Field(min_length=2, max_length=200)
    condition: str = Field(min_length=2, max_length=500)
    direction: Literal["lenient", "stricter"]
    canonical_text: str = Field(min_length=10, max_length=1000)
    category: str | None = Field(default=None, max_length=100)
    class_id: UUID | None = None


class TraitPatch(BaseModel):
    canonical_text: str | None = Field(default=None, min_length=10, max_length=1000)
    is_active: bool | None = None


class ConflictResolve(BaseModel): 
    action: Literal["keep_old", "replace", "keep_both"]
