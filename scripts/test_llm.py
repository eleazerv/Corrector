"""
Test LLM provider saja (tanpa DB / Redis / worker).

Pakai (dari root project):
    python -m scripts.test_llm                      # pakai LLM_PROVIDER di .env
    python -m scripts.test_llm --provider fake
    python -m scripts.test_llm --provider deepseek
    python -m scripts.test_llm --provider deepseek --thinking   # coba mode reasoning
"""
import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from core.config import settings  # noqa: E402

MESSAGES = [
    {"role": "system", "content": "Kamu penilai jawaban ujian. Balas HANYA dalam format JSON."},
    {"role": "user", "content": (
        "Soal: 2x = 10, berapa x?\n"
        "Kunci: x = 5\n"
        'Jawaban mahasiswa: "x = 5 karena 10/2"\n'
        'Nilai 0-10. Balas JSON: {"score": <angka>, "reason": "<1 kalimat>"}'
    )},
]


async def main(provider: str | None, thinking: bool):
    if provider:
        settings.LLM_PROVIDER = provider      # settings sudah ke-load, timpa langsung
    from providers.llm import get_llm_provider

    llm = get_llm_provider()
    if llm.name == "fake":
        llm.responses = [{"score": 10, "reason": "fake"}]
    await llm.start()
    print(f"provider = {llm.name}  model = {llm.model}  thinking = {thinking}")
    try:
        t = time.perf_counter()
        res = await llm.complete_json(MESSAGES, thinking=thinking,
                                      max_tokens=16000 if thinking else None)
        print(f"waktu    = {time.perf_counter() - t:.1f}s")
        print(f"data     = {res.data}")
        print(f"usage    = in {res.usage.input_tokens} / out {res.usage.output_tokens} "
              f"/ cached {res.usage.cached_tokens}")
        ok = isinstance(res.data, dict) and "score" in res.data
        print("OK" if ok else "GAGAL: tidak ada key 'score'")
    finally:
        await llm.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["deepseek", "fake"])
    ap.add_argument("--thinking", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.provider, a.thinking))
