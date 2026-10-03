"""
Test embedding provider (versi RINGAN: total 5 teks, aman untuk free tier).

    python -m scripts.test_embedding --provider fake
    python -m scripts.test_embedding --provider api
"""
import argparse
import asyncio
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from core.config import settings  # noqa: E402

TEXTS = [
    "satuan salah dikurangi 1 poin",                 # 0
    "jika satuan tidak ditulis, kurangi satu poin",  # 1  (mirip 0)
    "jawaban essay harus menyebut contoh nyata",     # 2  (beda topik)
]
PAUSE = 5.0          # detik antar panggilan API
FAILS = []


def check(cond, msg):
    print(("  OK   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


async def main(provider: str | None):
    if provider:
        settings.EMBEDDING_PROVIDER = provider
    from providers.embedding import get_embedding_provider, to_pgvector

    emb = get_embedding_provider()
    print(f"provider={settings.EMBEDDING_PROVIDER} model={emb.model} dim={emb.dim}")
    await emb.start()
    try:
        print("[1] 1 teks: dimensi")                       # panggilan API #1 (1 teks)
        t = time.time()
        one = (await emb.embed([TEXTS[0]]))[0]
        check(len(one) == emb.dim, f"dim {len(one)} == {emb.dim} ({time.time() - t:.2f}s)")
        if len(one) != emb.dim:
            return                                          # dimensi salah -> tes lain percuma

        await asyncio.sleep(PAUSE)
        print("[2] 3 teks: jumlah, urutan, makna")          # panggilan API #2 (3 teks)
        vecs = await emb.embed(TEXTS)
        check(len(vecs) == len(TEXTS), f"{len(vecs)} vektor untuk {len(TEXTS)} teks")
        check(cosine(vecs[0], one) > 0.99, "teks sama -> vektor sama (urutan benar)")
        close, far = cosine(vecs[0], vecs[1]), cosine(vecs[0], vecs[2])
        check(close > far, f"mirip {close:.3f} > beda {far:.3f}")

        print("[3] format pgvector (tanpa API)")
        lit = to_pgvector(vecs[0])
        check(lit.startswith("[") and lit.count(",") == emb.dim - 1, f"literal ok ({len(lit)} char)")
    finally:
        await emb.close()
    print("\nSEMUA LOLOS" if not FAILS else f"\nGAGAL: {FAILS}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["api", "local", "fake"])
    asyncio.run(main(ap.parse_args().provider))