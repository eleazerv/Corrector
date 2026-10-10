"""ARQ task: isi / perbarui kolom embedding untuk 1 trait.

Dipanggil setelah dosen POST /traits atau PATCH canonical_text, dan oleh backfill untuk
trait yang embedding-nya masih NULL. Trait hasil build_trait sudah punya embedding sendiri.
Tanpa embedding, trait tidak terlihat oleh build_trait._find_similar.
"""
from uuid import UUID

import asyncpg
from arq import ArqRedis, Retry

from core import jobs
from core.logging import log
from providers.embedding.base import PermanentEmbeddingError, TransientEmbeddingError, to_pgvector
from tasks.build_trait import trait_embed_text

MAX_TRIES = 3
RETRY_BASE_DELAY = 30

LOAD_TRAIT_SQL = """
select id, aspect, "condition", canonical_text, embedding_model, embedding is not null as has_embedding
from teacher_traits where id = $1
"""

# "and canonical_text = $4": kalau dosen keburu PATCH lagi, update ini tidak kena
# dan job dari PATCH terbaru yang mengisi embedding yang benar
UPDATE_EMBEDDING_SQL = """
update teacher_traits set embedding = $2::vector, embedding_model = $3
where id = $1 and canonical_text = $4
"""


async def embed_trait(ctx: dict, trait_id: str) -> dict:
    try:
        tid = UUID(trait_id)
    except ValueError:
        log.error("embed_trait: trait_id invalid %s", trait_id)
        return {"trait_id": trait_id, "ok": False, "error": "invalid_id"}

    job_try = ctx.get("job_try", 1)
    try:
        return await _process(ctx, tid)
    except TransientEmbeddingError as e:
        if job_try >= MAX_TRIES:
            log.warning("embed_trait %s gave up: %s", tid, e)
            return {"trait_id": str(tid), "ok": False, "error": "max_tries"}
        raise Retry(defer=RETRY_BASE_DELAY * job_try)
    except PermanentEmbeddingError as e:
        log.warning("embed_trait %s permanent: %s", tid, e)
        return {"trait_id": str(tid), "ok": False, "error": str(e)[:500]}
    except Exception:
        log.exception("embed_trait %s unexpected error", tid)
        raise


async def _process(ctx: dict, trait_id: UUID) -> dict:
    pool: asyncpg.Pool = ctx["db"]
    embedder = ctx.get("embedder")
    if embedder is None:
        log.warning("embed_trait: no embedder, skip %s", trait_id)
        return {"trait_id": str(trait_id), "skipped": "no_embedder"} 
      
    row = await pool.fetchrow(LOAD_TRAIT_SQL, trait_id)
    if row is None:
        log.info("embed_trait: trait not found, skip %s", trait_id)
        return {"trait_id": str(trait_id), "skipped": "not_found"}

    text = trait_embed_text(row["aspect"], row["condition"], row["canonical_text"])
    vec = (await embedder.embed([text]))[0]
    if len(vec) != embedder.dim:
        raise PermanentEmbeddingError("panjang vektor tidak sesuai")

    status = await pool.execute(UPDATE_EMBEDDING_SQL, trait_id, to_pgvector(vec),
                                embedder.model, row["canonical_text"])
    if status == "UPDATE 0":
        log.info("embed_trait: text changed during embed, skip %s", trait_id)
        return {"trait_id": str(trait_id), "skipped": "text_changed"}

    log.info("embed_trait: %s %s", "re-embed" if row["has_embedding"] else "embed", trait_id)
    return {"trait_id": str(trait_id), "ok": True, "re_embed": row["has_embedding"]}


async def backfill_missing_embeddings(arq: ArqRedis, pool: asyncpg.Pool) -> int:
    """Enqueue embed_trait untuk semua trait aktif yang embedding-nya masih NULL."""
    rows = await pool.fetch("select id from teacher_traits where embedding is null and is_active")
    count = 0
    for r in rows:
        if await jobs.enqueue_embed_trait(arq, r["id"]):
            count += 1
    return count
