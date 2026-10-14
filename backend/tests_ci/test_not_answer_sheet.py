"""foto bukan lembar jawaban tidak dinilai; regex 'jawaban nomor X'; label Picture dibuang."""
import pytest
from langgraph.graph import END

from pipeline import settings as S
from pipeline import submission_nodes as SN
from pipeline import text_utils
from pipeline.deps import GradingDeps

from conftest import FakeLlm, run

QS = [{"id": "q1", "number": 1, "question_text": "a", "key_answer": "a", "question_type": "essay",
       "max_points": 5, "criteria": []},
      {"id": "q2", "number": 2, "question_text": "b", "key_answer": "b", "question_type": "essay",
       "max_points": 5, "criteria": []}]


def cfg(llm=None):
    return {"configurable": {"deps": GradingDeps(pool=None, llm=llm or FakeLlm())}}


def blk(i, text):
    return {"id": f"p1-{i}", "page_no": 1, "label": "text", "text": text, "bbox": []}


def test_no_blocks_stops_without_llm():
    llm = FakeLlm()
    out = run(SN.segment_answers({"questions": QS, "blocks": []}, cfg(llm)))
    assert out["run_status"] == "not_answer_sheet" and llm.calls == []
    assert SN.dispatch({**out, "questions": QS, "blocks": []}) == END


def test_unrelated_photo_stops_after_empty_llm_mapping():
    blocks = [blk(0, "Cari destinasi"), blk(1, "Hotel"), blk(2, "Tiket Pesawat")]
    out = run(SN.segment_answers({"questions": QS, "blocks": blocks}, cfg(FakeLlm({"mapping": {}}))))
    assert out["run_status"] == "not_answer_sheet"
    assert S.NOT_SHEET_REASON in out["flags"]


def test_llm_mapping_found_continues():
    blocks = [blk(0, "jawab a"), blk(1, "jawab b"), blk(2, "x"), blk(3, "y")]
    llm = FakeLlm({"mapping": {"1": ["p1-0"], "2": ["p1-1"]}})
    out = run(SN.segment_answers({"questions": QS, "blocks": blocks}, cfg(llm)))
    assert "run_status" not in out and out["segments"]["q1"] == ["p1-0"]


def test_regrade_only_questions_not_blocked():
    out = run(SN.segment_answers({"questions": QS, "blocks": [], "only_questions": ["q1"]},
                                 cfg(FakeLlm({"mapping": {}}))))
    assert out.get("run_status") != "not_answer_sheet"


@pytest.mark.parametrize("text,expected", [
    ("Jawaban nomor 1 ...", 1), ("jawaban no. 2: x", 2), ("jwb soal 3", 3), ("jawaban 4) a", 4),
    ("Jawaban: banyak", None), ("2x + 1 = 5", None),
])
def test_question_number_jawaban_prefix(text, expected):
    assert text_utils.question_number(text) == expected


def test_picture_label_ignored():
    assert {"picture", "figure", "image"} <= S.IGNORED_LABELS
