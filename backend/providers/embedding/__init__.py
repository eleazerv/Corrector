from core.config import settings

from .base import (
    EmbeddingError, EmbeddingProvider, PermanentEmbeddingError,
    TransientEmbeddingError, to_pgvector,
)

__all__ = [
    "EmbeddingError", "EmbeddingProvider", "PermanentEmbeddingError",
    "TransientEmbeddingError", "get_embedding_provider", "to_pgvector",
]


def get_embedding_provider() -> EmbeddingProvider:
    """Pilih dari EMBEDDING_PROVIDER di .env: api | local | fake."""
    provider = settings.EMBEDDING_PROVIDER.lower()

    if provider == "api":
        from .api_embedding import ApiEmbedding
        return ApiEmbedding(
            base_url=settings.EMBEDDING_BASE_URL,
            api_key=settings.EMBEDDING_API_KEY,
            model=settings.EMBEDDING_MODEL,
            dim=settings.EMBEDDING_DIM,
            send_dimensions=settings.EMBEDDING_SEND_DIMENSIONS,
        )

    if provider == "fake":
        from .fake import FakeEmbedding
        return FakeEmbedding(dim=settings.EMBEDDING_DIM)

    raise RuntimeError(
        f"EMBEDDING_PROVIDER tidak dikenal: {settings.EMBEDDING_PROVIDER!r} (pilih api | local | fake)")
