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


# cek catatan manual (bertentangan / duplikat) lewat 1 panggilan AI ----
from conftest import FakeLlm, Semaphore  # noqa: E402

MANUAL = {**ROW, "id": uid(), "teacher_id": uid(), "subject_id": uid(), "direction": "lenient",
          "source": "manual", "is_active": True}


def cand():
    return {"id": uid(), "canonical_text": "lama", "direction": "stricter", "aspect": "a", "condition": "k"}


def mctx(db, llm):
    return {"db": db, "embedder": FakeEmbedder(), "job_try": 1, "llm": llm, "llm_semaphore": Semaphore()}


def manual_db(candidates, **extra):
    return FakeDb({et.LOAD_TRAIT_SQL: MANUAL, et.UPDATE_EMBEDDING_SQL: "UPDATE 1",
                   et.CANDIDATES_SQL: candidates, et.CHECK_TRAIT_ACTIVE_SQL: lambda tid: tid, **extra})


def check(db, answer):
    llm = FakeLlm(answer)
    return run(et.embed_trait(mctx(db, llm), str(MANUAL["id"]))), llm


def test_opposite_creates_conflict_and_deactivates_new():
    old, cid = cand(), uid()
    db = manual_db([old], **{et.INSERT_KIND_CONFLICT_SQL: cid})
    out, _ = check(db, {"matches": [{"id": "L1", "verdict": "opposite"}]})
    assert out["conflict_id"] == str(cid)
    assert db.args_of(et.DEACTIVATE_TRAIT_SQL) == [(MANUAL["id"],)]
    assert db.args_of(et.INSERT_KIND_CONFLICT_SQL)[0] == (MANUAL["teacher_id"], old["id"], MANUAL["id"], "contradict")
    notif = db.args_of(et.INSERT_NOTIFICATION_SQL)[0]
    assert notif[1] == "trait_conflict" and notif[4]["kind"] == "contradict"
    assert notif[5] == f"trait_conflict:{cid}"


def test_same_creates_duplicate_and_keeps_new_active():
    db = manual_db([cand()], **{et.INSERT_KIND_CONFLICT_SQL: uid()})
    out, _ = check(db, {"matches": [{"id": "L1", "verdict": "same"}]})
    assert "conflict_id" in out and db.count(et.DEACTIVATE_TRAIT_SQL) == 0
    assert db.args_of(et.INSERT_KIND_CONFLICT_SQL)[0][3] == "duplicate"
    assert db.args_of(et.INSERT_NOTIFICATION_SQL)[0][1] == "trait_duplicate"


def test_contradiction_wins_over_duplicate():
    dup, opp = cand(), cand()
    db = manual_db([dup, opp], **{et.INSERT_KIND_CONFLICT_SQL: uid()})
    check(db, {"matches": [{"id": "L1", "verdict": "same"}, {"id": "L2", "verdict": "opposite"}]})
    args = db.args_of(et.INSERT_KIND_CONFLICT_SQL)
    assert len(args) == 1 and args[0][1] == opp["id"] and args[0][3] == "contradict"


def test_sends_all_candidates_in_one_call_with_short_ids():
    db = manual_db([cand() for _ in range(5)])
    _, llm = check(db, {"matches": []})
    assert len(llm.calls) == 1
    body = llm.calls[0][0][1]["content"]
    assert '"L5"' in body and str(MANUAL["teacher_id"]) not in body


def test_unknown_id_or_verdict_is_ignored():
    db = manual_db([cand()])
    out, _ = check(db, {"matches": [{"id": "L9", "verdict": "opposite"}, {"id": "L1", "verdict": "different"}]})
    assert "conflict_id" not in out and db.count(et.INSERT_KIND_CONFLICT_SQL) == 0


def test_no_candidates_skips_llm():
    llm = FakeLlm()
    out = run(et.embed_trait(mctx(manual_db([]), llm), str(uid())))
    assert out["ok"] is True and llm.calls == []


def test_llm_error_keeps_embedding():
    db = manual_db([cand()])
    out, _ = check(db, RuntimeError("down"))
    assert out["ok"] is True and "conflict_id" not in out and db.count(et.UPDATE_EMBEDDING_SQL) == 1


def test_pending_old_trait_falls_through_to_next_match():
    a, b, cid = cand(), cand(), uid()
    db = manual_db([a, b], **{et.FIND_PENDING_CONFLICT_SQL: lambda tid: uid() if tid == a["id"] else None,
                              et.INSERT_KIND_CONFLICT_SQL: cid})
    out, _ = check(db, {"matches": [{"id": "L1", "verdict": "opposite"}, {"id": "L2", "verdict": "opposite"}]})
    assert out["conflict_id"] == str(cid) and db.args_of(et.INSERT_KIND_CONFLICT_SQL)[0][1] == b["id"]


def test_learned_trait_is_not_checked():
    llm = FakeLlm()
    db = manual_db([cand()])
    db.on[et.LOAD_TRAIT_SQL] = {**MANUAL, "source": "learned"}
    run(et.embed_trait(mctx(db, llm), str(uid())))
    assert llm.calls == []


#  catatan manual tanpa aspek / kondisi / arah diisi AI dulu ----
def test_manual_without_fields_is_filled_before_embedding():
    tid, embedder = uid(), FakeEmbedder()
    bare = {**MANUAL, "id": tid, "aspect": None, "condition": None, "direction": None, "canonical_text": "aturan"}
    db = FakeDb({et.LOAD_TRAIT_SQL: bare, et.UPDATE_EMBEDDING_SQL: "UPDATE 1", et.CANDIDATES_SQL: []})
    llm = FakeLlm({"aspek": "satuan", "kondisi": "satuan lupa", "arah": "lenient"})
    ctx_ = {**mctx(db, llm), "embedder": embedder}
    out = run(et.embed_trait(ctx_, str(tid)))
    assert out["ok"] is True
    assert db.args_of(et.FILL_FIELDS_SQL)[0] == (tid, "satuan", "satuan lupa", "lenient", "aturan")
    assert embedder.texts == [["satuan satuan lupa aturan"]]


def test_fill_bad_direction_becomes_none_and_error_keeps_embedding():
    bare = {**MANUAL, "aspect": None, "condition": None, "direction": None}
    db = FakeDb({et.LOAD_TRAIT_SQL: bare, et.UPDATE_EMBEDDING_SQL: "UPDATE 1", et.CANDIDATES_SQL: []})
    run(et.embed_trait(mctx(db, FakeLlm({"aspek": "a", "kondisi": "k", "arah": "aneh"})), str(uid())))
    assert db.args_of(et.FILL_FIELDS_SQL)[0][3] is None

    db2 = FakeDb({et.LOAD_TRAIT_SQL: bare, et.UPDATE_EMBEDDING_SQL: "UPDATE 1", et.CANDIDATES_SQL: []})
    out = run(et.embed_trait(mctx(db2, FakeLlm(RuntimeError("down"))), str(uid())))
    assert out["ok"] is True and db2.count(et.FILL_FIELDS_SQL) == 0


def test_manual_with_all_fields_skips_fill():
    db = manual_db([])
    llm = FakeLlm()
    run(et.embed_trait(mctx(db, llm), str(uid())))
    assert db.count(et.FILL_FIELDS_SQL) == 0 and llm.calls == []


#  SSE ke dosen
class FakeRedis:
    def __init__(self):
        self.sent = []

    async def publish(self, channel, data):
        import json
        self.sent.append((channel, json.loads(data)))


def test_publishes_notification_and_traits_changed():
    redis, cid = FakeRedis(), uid()
    db = manual_db([cand()], **{et.INSERT_KIND_CONFLICT_SQL: cid})
    ctx_ = {**mctx(db, FakeLlm({"matches": [{"id": "L1", "verdict": "same"}]})), "redis": redis}
    run(et.embed_trait(ctx_, str(MANUAL["id"])))
    channels = {c for c, _ in redis.sent}
    events = [m["event"] for _, m in redis.sent]
    assert channels == {f"notifications:{MANUAL['teacher_id']}"}
    assert events == ["notification", "traits_changed"]
    assert redis.sent[0][1]["kind"] == "trait_duplicate"


def test_publish_failure_does_not_break_job():
    class Broken:
        async def publish(self, *a):
            raise RuntimeError("redis down")
    ctx_ = {**mctx(manual_db([]), FakeLlm()), "redis": Broken()}
    assert run(et.embed_trait(ctx_, str(uid())))["ok"] is True
