"""Worker embed_trait: isi embedding 1 trait + backfill."""
import pytest
from arq import Retry

import tasks.embed_trait as et
from core import jobs
from providers.embedding.base import PermanentEmbeddingError, TransientEmbeddingError

from conftest import FakeDb, FakeEmbedder, run, uid

ROW = {"id": 1, "aspect": "a", "condition": "k", "canonical_text": "aturan", "embedding_model": None,
       "has_embedding": False}


def ctx(db, embedder=None, job_try=1):
    return {"db": db, "embedder": embedder or FakeEmbedder(), "job_try": job_try}


def test_embed_ok_uses_same_text_format_as_build_trait():
    tid, embedder = uid(), FakeEmbedder()
    db = FakeDb({et.LOAD_TRAIT_SQL: ROW, et.UPDATE_EMBEDDING_SQL: "UPDATE 1"})
    out = run(et.embed_trait(ctx(db, embedder), str(tid)))
    assert out == {"trait_id": str(tid), "ok": True, "re_embed": False}
    assert embedder.texts == [["a k aturan"]]
    assert db.args_of(et.UPDATE_EMBEDDING_SQL)[0] == (tid, "[0.1,0.2,0.3]", "fake-embed", "aturan")


def test_embed_reports_re_embed_and_text_changed():
    db = FakeDb({et.LOAD_TRAIT_SQL: {**ROW, "has_embedding": True}})
    assert run(et.embed_trait(ctx(db), str(uid())))["re_embed"] is True
    db = FakeDb({et.LOAD_TRAIT_SQL: ROW, et.UPDATE_EMBEDDING_SQL: "UPDATE 0"})   # dosen keburu edit lagi
    assert run(et.embed_trait(ctx(db), str(uid())))["skipped"] == "text_changed"


def test_embed_skips():
    assert run(et.embed_trait(ctx(FakeDb()), "bukan-uuid"))["error"] == "invalid_id"
    assert run(et.embed_trait(ctx(FakeDb()), str(uid())))["skipped"] == "not_found"
    assert run(et.embed_trait({"db": FakeDb(), "job_try": 1}, str(uid())))["skipped"] == "no_embedder"


def test_embed_wrong_dimension_is_permanent_error():
    db = FakeDb({et.LOAD_TRAIT_SQL: ROW})
    out = run(et.embed_trait(ctx(db, FakeEmbedder(vector=[0.1])), str(uid())))
    assert out["ok"] is False and db.count(et.UPDATE_EMBEDDING_SQL) == 0


def test_embed_retry_policy():
    db = FakeDb({et.LOAD_TRAIT_SQL: ROW})
    flaky = FakeEmbedder(error=TransientEmbeddingError("429"))
    with pytest.raises(Retry):
        run(et.embed_trait(ctx(db, flaky, job_try=1), str(uid())))
    assert run(et.embed_trait(ctx(db, flaky, job_try=3), str(uid())))["error"] == "max_tries"
    out = run(et.embed_trait(ctx(db, FakeEmbedder(error=PermanentEmbeddingError("key salah"))), str(uid())))
    assert "key salah" in out["error"]


def test_backfill_enqueues_every_missing_trait(monkeypatch):
    ids, queued = [uid(), uid(), uid()], []

    async def enqueue(arq, trait_id):
        queued.append(trait_id)
        return trait_id != ids[1]                 # 1 job ditolak antrean

    monkeypatch.setattr(jobs, "enqueue_embed_trait", enqueue)

    class Pool:
        async def fetch(self, sql, *a):
            assert "embedding is null" in sql and "is_active" in sql
            return [{"id": i} for i in ids]

    assert run(et.backfill_missing_embeddings(object(), Pool())) == 2
    assert queued == ids
