""" segmentasi LLM pemeta utama + petunjuk regex/posisi."""
import json

from pipeline import submission_nodes as SN
from pipeline.deps import GradingDeps
from providers.llm import PermanentLlmError

from conftest import FakeLlm, run


def q(n):
    return {"id": f"q{n}", "number": n, "question_text": f"soal {n}", "key_answer": "", "question_type": "essay",
            "max_points": 5, "criteria": []}


def blk(i, text, x=50, y=None, page=1):
    return {"id": f"p{page}-{i}", "page_no": page, "label": "text", "text": text,
            "bbox": [x, y if y is not None else i * 50, 900, (y or i * 50) + 40]}


def seg(questions, blocks, llm):
    cfg = {"configurable": {"deps": GradingDeps(pool=None, llm=llm)}}
    return run(SN.segment_answers({"questions": questions, "blocks": blocks}, cfg))


QS3 = [q(1), q(2), q(3)]


def test_clean_markers_use_fast_path_without_llm():
    llm = FakeLlm()
    out = seg(QS3, [blk(0, "1. a"), blk(1, "lanjut"), blk(2, "2. b"), blk(3, "3. c")], llm)
    assert out["segment_method"] == "heuristic" and llm.calls == []
    assert out["segments"] == {"q1": ["p1-0", "p1-1"], "q2": ["p1-2"], "q3": ["p1-3"]}


def test_step_numbers_inside_answer_go_to_llm():
    # soal 3 berisi langkah "1." "2." -> urutan penanda tidak naik -> LLM yang memutuskan
    blocks = [blk(0, "1. a"), blk(1, "2. b"), blk(2, "3. bukti"), blk(3, "1. tulis definisi", x=150),
              blk(4, "2. substitusi", x=150)]
    llm = FakeLlm({"mapping": {"1": ["p1-0"], "2": ["p1-1"], "3": ["p1-2", "p1-3", "p1-4"]}})
    out = seg(QS3, blocks, llm)
    assert out["segment_method"] == "llm" and len(llm.calls) == 1
    assert out["segments"]["q3"] == ["p1-2", "p1-3", "p1-4"] and "flags" not in out


def test_hints_sent_to_llm():
    blocks = [blk(0, "1. c\n2. b\n3. c"), blk(1, "jawaban", x=400)]
    llm = FakeLlm({"mapping": {"1": ["p1-0"], "2": ["p1-0"], "3": ["p1-0"]}})
    out = seg(QS3, blocks, llm)
    body = llm.calls[0][0][1]["content"]
    sent = json.loads(body.split("BLOK:\n", 1)[1])
    assert sent[0]["petunjuk_nomor"] == [1, 2, 3] and sent[0]["kiri"] is True and sent[1]["kiri"] is False
    # blok berisi beberapa jawaban singkat boleh dipakai beberapa soal
    assert out["segments"] == {"q1": ["p1-0"], "q2": ["p1-0"], "q3": ["p1-0"]}


def test_single_answer_block_not_shared():
    blocks = [blk(0, "jawab"), blk(1, "lain")]
    llm = FakeLlm({"mapping": {"1": ["p1-0"], "2": ["p1-0", "p1-1"], "3": ["p9-9"]}})
    out = seg(QS3, blocks, llm)
    assert out["segments"] == {"q1": ["p1-0"], "q2": ["p1-1"], "q3": []}


def test_doubt_becomes_flag():
    llm = FakeLlm({"mapping": {"1": ["p1-0"]}, "ragu": [2, "3", 99]})
    out = seg(QS3, [blk(0, "x"), blk(1, "y")], llm)
    assert out["flags"] == ["pemetaan jawaban ragu untuk soal [2, 3]"]


def test_llm_permanent_error_falls_back_to_regex_with_flag():
    llm = FakeLlm(PermanentLlmError("rusak"))
    out = seg(QS3, [blk(0, "1. a"), blk(1, "3. c")], llm)
    assert out["segment_method"] == "heuristic" and out["segments"]["q3"] == ["p1-1"]
    assert "segmentasi LLM gagal" in out["flags"][0]



from pipeline.text_utils import is_short_answer_list  # noqa: E402


def test_short_answer_list_detection():
    assert is_short_answer_list("1. c\n2. b\n3. c")
    assert not is_short_answer_list("1. jelaskan konsep turunan, contohnya:\n1. kecepatan\n2. laju")
    assert not is_short_answer_list("1. a\n1b. b")
    assert not is_short_answer_list("2. c\n1. b")
    assert not is_short_answer_list("1. c")


def test_subquestion_1b_not_clean_and_kept_in_q1():
    blocks = [blk(0, "1. a"), blk(1, "1b. b"), blk(2, "2. c"), blk(3, "3. d")]
    llm = FakeLlm({"mapping": {"1": ["p1-0", "p1-1"], "2": ["p1-2"], "3": ["p1-3"]}})
    out = seg(QS3, blocks, llm)
    assert out["segment_method"] == "llm" and out["segments"]["q1"] == ["p1-0", "p1-1"]


def test_list_inside_answer_block_cannot_be_shared():
    # OCR menggabungkan "1. ... contohnya:" + daftar "1." "2." jadi 1 blok; LLM keliru memasukkannya ke soal 2 juga
    blocks = [blk(0, "1. jelaskan dengan contoh, contohnya:\n1. kecepatan\n2. laju"), blk(1, "2. b"), blk(2, "3. c")]
    llm = FakeLlm({"mapping": {"1": ["p1-0"], "2": ["p1-0", "p1-1"], "3": ["p1-2"]}})
    out = seg(QS3, blocks, llm)
    assert out["segments"] == {"q1": ["p1-0"], "q2": ["p1-1"], "q3": ["p1-2"]}
