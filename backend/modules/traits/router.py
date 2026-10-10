"""Trait dosen. Untuk DOSEN, hanya trait miliknya sendiri.

GET   /traits                    daftar trait sendiri (filter subject_id)
POST  /traits                    tulis trait sendiri
PATCH /traits/{id}               edit kalimat / nonaktifkan (makna tidak boleh berbalik)
GET   /traits/{id}/evidences     override yang menjadi bukti trait ini
"""
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Query
from core.ratelimit import rate_limit

from core import jobs
from core.deps import CurrentUser, TeacherUser, get_arq, get_pool
from core.logging import log
from providers.llm import get_llm_provider

from . import service
from .schemas import TraitIn, TraitPatch

router = APIRouter(tags=["traits"])


def get_llm():
    """Dependency LLM. core/deps.py belum punya get_llm, jadi sementara ditaruh di sini.
    Gagal membuat client (mis. API key kosong) -> None, dan service membalas 503 dengan pesan jelas."""
    try:
        return get_llm_provider()
    except Exception as e:
        log.warning("traits: LLM tidak tersedia: %s", e)
        return None


@router.get("/traits")
async def getTraits (
    subject_id: UUID | None = Query(None),
    include_inactive: bool = Query(False),
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),

):
    return await service.list_traits(db, user.profile_id, subject_id, include_inactive)


@router.post("/traits",status_code=201, dependencies=[Depends(rate_limit("trait_create", 20))])
async def postTrait (

    body: TraitIn,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    arq=Depends(get_arq),
):
    trait = await service.create_trait(db, user.profile_id, user.school_id, body)
    try :
        await jobs.enqueue_embed_trait(arq, trait["id"])
    except Exception as e :
        log.warning("postTrait %s: failed to enqueue embed_trait: %s", trait["id"], e)
    return trait


@router.patch("/traits/{trait_id}", dependencies=[Depends(rate_limit("trait_patch", 10))])
async def patchTrait (
    trait_id: UUID,
    body: TraitPatch,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
    llm=Depends(get_llm),
    arq=Depends(get_arq),
):
    trait = await service.patch_trait(db, llm, user.profile_id, trait_id, body)
    if body.canonical_text is not None:
        try:
            await jobs.enqueue_embed_trait(arq, trait_id)
        except Exception as e:
            log.warning("patchTrait %s: failed to enqueue embed_trait: %s", trait_id, e)
    return trait


@router.get("/traits/{trait_id}/evidences")
async def getEvidences (
    trait_id: UUID,
    user: CurrentUser = TeacherUser,
    db: asyncpg.Pool = Depends(get_pool),
):
    return await service.trait_evidences(db, user.profile_id, trait_id)