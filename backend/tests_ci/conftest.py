"""Tes unit untuk CI: tanpa database, Redis, LLM, embedding, maupun Supabase.

Semua layanan luar diganti tiruan (fake) di file ini, jadi tes aman dijalankan di mana saja:
    cd backend
    pip install -r requirements.txt -r requirements-dev.txt
    pytest tests_ci -q
"""
import asyncio
import os
import sys
import types
import uuid
from pathlib import Path

# Nilai tiruan dipasang SEBELUM modul project di-import. Environment variable menang atas
# file .env, jadi tes tidak pernah memakai key / URL asli walaupun .env ada di laptop.
os.environ.update({
    "ENV": "test",
    "DATABASE_URL": "postgresql://test:test@127.0.0.1:1/test",
    "REDIS_URL": "redis://127.0.0.1:1/0",
    "REDIS_API": "test",
    "SUPABASE_KEY": "test-key",
    "SUPABASE_URL": "http://127.0.0.1:1",
    "SUPABASE_BUCKET": "test-bucket",
    "WORKER_TOKEN": "t" * 40,
    "LLM_PROVIDER": "fake",
    "LLM_BASE_URL": "http://127.0.0.1:1",
    "LLM_MODEL": "fake-model",
    "LLM_API_KEY": "test",
    "LLM_MAX_TOKENS": "1000",
    "EMBEDDING_PROVIDER": "fake",
    "EMBEDDING_API_KEY": "",
    "OCR_PROVIDER": "fake",
    "OCR_MAX_IMAGE_SIDE": "2000",
    "OCR_API_URL": "http://127.0.0.1:1",
    "OCR_API_KEY": "test",
    "OCR_API_MODE": "test",
    "OCR_API_TIMEOUT": "5",
})

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def run(coro):
    """Jalankan 1 coroutine sampai selesai (pengganti plugin pytest-asyncio)."""
    return asyncio.run(coro)


def uid():
    return uuid.uuid4()


def llm_result(data, input_tokens=100, output_tokens=20, model="fake-model"):
    """Tiruan LlmJson: hasil complete_json dengan .data, .usage, .model."""
    usage = types.SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                                  total=input_tokens + output_tokens)
    return types.SimpleNamespace(data=data, usage=usage, model=model)


class FakeLlm:
    """LLM tiruan: mengembalikan jawaban berurutan. Item berupa Exception akan di-raise."""
    model = "fake-model"

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []

    async def complete_json(self, messages, **kwargs):
        self.calls.append((messages, kwargs))
        item = self.answers.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item if hasattr(item, "data") else llm_result(item)


class FakeEmbedder:
    model = "fake-embed"
    dim = 3

    def __init__(self, vector=None, error=None):
        self.vector = vector if vector is not None else [0.1, 0.2, 0.3]
        self.error = error
        self.texts = []

    async def embed(self, texts):
        self.texts.append(texts)
        if self.error:
            raise self.error
        return [self.vector for _ in texts]


class FakeDb:
    """Pool / koneksi asyncpg tiruan.

    `on` = {SQL: jawaban}. Jawaban boleh nilai biasa, atau fungsi(*args) untuk jawaban dinamis.
    Semua panggilan dicatat di `.calls` sebagai (metode, sql, args).
    """

    def __init__(self, on=None):
        self.on = dict(on or {})
        self.calls = []

    def _answer(self, method, sql, args, default):
        self.calls.append((method, sql, args))
        if sql not in self.on:
            return default
        value = self.on[sql]
        if isinstance(value, BaseException):
            raise value
        return value(*args) if callable(value) else value

    async def fetch(self, sql, *args):
        return self._answer("fetch", sql, args, [])

    async def fetchrow(self, sql, *args):
        return self._answer("fetchrow", sql, args, None)

    async def fetchval(self, sql, *args):
        return self._answer("fetchval", sql, args, None)

    async def execute(self, sql, *args):
        return self._answer("execute", sql, args, "UPDATE 1")

    # dipakai sebagai: async with pool.acquire() as conn, conn.transaction():
    def acquire(self):
        return self

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    # bantuan untuk assert
    def count(self, sql):
        return sum(1 for _, s, _ in self.calls if s is sql)

    def args_of(self, sql):
        return [a for _, s, a in self.calls if s is sql]


class Semaphore:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False
