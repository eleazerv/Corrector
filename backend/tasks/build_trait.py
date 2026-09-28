from dataclasses import dataclass
from uuid import UUID

import asyncpg
from arq import Retry

from core.logging import log

MAX_TRIES = 3
RETRY_BASE_DELAY = 30
TOP_K_SIMILAR = 5
SIMILARITY_MERGE_THRESHOLD = 0.85     # di atas ini → anggap trait yang sama
SIMILARITY_CHECK_THRESHOLD = 0.70     # di antara ini dan MERGE → tanya LLM


@dataclass
class OverrideInfo:
    id: UUID
    teacher_id: UUID
    subject_id: UUID
    class_id: UUID
    test_answer_id: UUID
    reason: str | None
    old_grade: float | None
    new_grade: float
    trait_processed_at: object | None


@dataclass
class TraitDraft:
    category: str
    aspect: str
    condition: str
    direction: str              # lenient | stricter
    canonical_text: str


@dataclass
class SimilarTrait:
    id: UUID
    canonical_text: str
    direction: str
    similarity: float


@dataclass
class TraitDecision:
    action: str                 # insert | update
    trait_id: UUID | None
    relation: str               # support | contradict
    decided_by: str             # rule | llm
    similarity: float | None


LOAD_OVERRIDE_SQL = """
"""

LOAD_ANSWER_CONTEXT_SQL = """
"""

FIND_SIMILAR_TRAITS_SQL = """
"""

INSERT_TRAIT_SQL = """
"""

UPDATE_TRAIT_SQL = """
"""

INSERT_EVIDENCE_SQL = """
"""

MARK_OVERRIDE_PROCESSED_SQL = """
"""


async def build_trait(ctx: dict, override_id: str) -> dict:
    pass


async def _process(ctx: dict, override_id: UUID) -> dict:
    pass


async def _load_override(pool: asyncpg.Pool, override_id: UUID) -> OverrideInfo | None:
    pass


async def _load_answer_context(pool: asyncpg.Pool, test_answer_id: UUID) -> dict:
    pass


async def _generate_trait(llm, override: OverrideInfo, context: dict) -> TraitDraft:
    pass


async def _embed(embedder, draft: TraitDraft) -> list[float]:
    pass


async def _find_similar(pool: asyncpg.Pool, override: OverrideInfo, embedding: list[float]) -> list[SimilarTrait]:
    pass


async def _decide(llm, draft: TraitDraft, similar: list[SimilarTrait]) -> TraitDecision:
    pass


async def _save(
    pool: asyncpg.Pool, override: OverrideInfo, draft: TraitDraft,
    embedding: list[float], decision: TraitDecision,
) -> UUID:
    pass