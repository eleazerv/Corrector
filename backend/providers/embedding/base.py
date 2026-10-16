from typing import Protocol


class EmbeddingError(Exception):
    """Base error embedding."""


class TransientEmbeddingError(EmbeddingError):
    """Sementara: timeout, 429, 5xx. Boleh retry."""


class PermanentEmbeddingError(EmbeddingError):
    """Permanen: key salah, model salah, dimensi tidak cocok."""


class EmbeddingProvider(Protocol):
    name: str
    model: str
    dim: int

    async def start(self) -> None: ...

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed banyak teks sekaligus. Panjang output == panjang input,
        tiap vektor panjangnya == self.dim."""
        ...

    async def close(self) -> None: ...


def to_pgvector(vec: list[float]) -> str:
    """list[float] -> literal pgvector '[0.1,0.2,...]' (dipakai dengan $n::vector)."""
    return "[" + ",".join(f"{x:.7g}" for x in vec) + "]"
