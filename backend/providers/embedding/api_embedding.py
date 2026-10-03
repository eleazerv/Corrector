import asyncio 

import httpx 

from core.logging import log 

from .base import PermanentEmbeddingError, TransientEmbeddingError , EmbeddingError

TRANSIENT_STATUS = {429, 500, 502, 503, 504}
MAX_BATCH = 64


class ApiEmbedding : 
    """Endpoint embedding OpenAI-compatible: POST {base_url}/embeddings.

    Cocok untuk provider mana pun yang punya endpoint /embeddings format OpenAI
    (OpenAI, Gemini OpenAI-compat, Jina, Voyage, dll). 
    """
    
    name = "api"
    
    def __init__(self, *, base_url: str, api_key: str, model: str, dim: int,
                 timeout: float = 60, send_dimensions: bool = True,
                 max_attempts: int = 3, backoff: float = 2.0):
        if not api_key: 
            raise PermanentEmbeddingError("EMBEDDING_API_KEY is empty")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.dim = dim
        self.timeout = timeout
        self.send_dimensions = send_dimensions
        self.max_attempts = max_attempts
        self.backoff = backoff
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None : 
        if self._client is None : 
            self._client = httpx.AsyncClient(
                base_url = self.base_url,
                timeout= self.timeout,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            
    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            
    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), MAX_BATCH):
            out.extend(await self._embed_batch(texts[i:i + MAX_BATCH]))
        return out
            
    async def _embed_batch(self, texts: list[str]) -> list[list[float]]: 
        """Embed batch teks. Panjang output == panjang input, tiap vektor panjangnya == self.dim."""
        await self.start()
        body: dict = {"model": self.model, "input": texts}
        if self.send_dimensions: 
            body["dimensions"] = self.dim
            
        last_err : Exception | None = None  
        for attempt in range(1, self.max_attempts + 1):
            try : 
                resp = await self._client.post("/embeddings", json=body)
            except( httpx.TimeoutException, httpx.NetworkError) as e : 
                last_err = TransientEmbeddingError(f"network:{e!r}")
            else : 
                if resp.status_code in TRANSIENT_STATUS : 
                    last_err = TransientEmbeddingError(f"api {resp.status_code}")
                elif resp.status_code != 200 : 
                    raise PermanentEmbeddingError(f"api {resp.status_code}: {resp.text[:300]}")
                else : 
                    items = sorted(resp.json().get("data", []), key=lambda d: d.get("index", 0))
                    vecs = [d["embedding"] for d in items]
                    if len(vecs) != len(texts):
                        raise PermanentEmbeddingError(
                            f"jumlah embedding {len(vecs)} != input {len(texts)}")
                    bad = next((len(v) for v in vecs if len(v) != self.dim), None)
                    if bad is not None:
                        raise PermanentEmbeddingError(
                            f"dimensi {bad} != EMBEDDING_DIM {self.dim} (cek model / kolom vector)")
                    return vecs
            if attempt < self.max_attempts : 
                delay = self.backoff * attempt
                log.warning("embedding attempt %s/%s gagal (%s), retry %.0fs",
                            attempt, self.max_attempts, last_err, delay)
                await asyncio.sleep(delay)
        raise last_err or TransientEmbeddingError("embedding gagal")
