"""changed by claude: exact_match hybrid (aturan hanya konfirmasi benar, sisanya LLM)."""
import pytest

from pipeline import question_nodes as QN
from pipeline.deps import GradingDeps
from providers.llm import PermanentLlmError

from conftest import FakeLlm, run

Q_MC = {"id": "q1", "number": 1, "question_type": "objective", "max_points": 2,
        "question_text": "lim sin3x/x = ... a. 0 b. 1 c. 3 d. tak hingga", "key_answer": "c",
        "criteria": [{"id": "k", "description": "sesuai kunci", "points": 2.0}]}
Q_FILL = {**Q_MC, "question_text": "f(x)=x e^x, f'(0) = ...", "key_answer": "1"}


def grade(q, answer, llm=None):
    llm = llm or FakeLlm()
    state = {"q_question": q, "q_answer_text": answer, "q_blocks": [{"id": "p1-0", "text": answer}]}
    cfg = {"configurable": {"deps": GradingDeps(pool=None, llm=llm)}}
    return run(QN.exact_match(state, cfg)), llm


@pytest.mark.parametrize("answer", ["c", "1. c", "jawaban c", "(c)", "C."])
def test_clear_letter_correct_without_llm(answer):
    out, llm = grade(Q_MC, answer)
    assert out["q_final"][0]["points"] == 2.0 and out["q_confidence"] == 1.0 and llm.calls == []


def test_option_content_goes_to_llm_and_is_correct():
    out, llm = grade(Q_MC, "3", FakeLlm({"verdict": "benar", "alasan": "3 = opsi c"}))
    assert len(llm.calls) == 1 and out["q_final"][0]["points"] == 2.0 and not out["q_needs_review"]


def test_wrong_letter_is_not_decided_by_regex():
    out, llm = grade(Q_MC, "b", FakeLlm({"verdict": "salah"}))
    assert len(llm.calls) == 1 and out["q_final"][0]["points"] == 0.0 and not out["q_needs_review"]


def test_two_options_review_without_llm():
    out, llm = grade(Q_MC, "b/c")
    assert out["q_needs_review"] and llm.calls == []


def test_llm_unsure_or_error_goes_to_review():
    out, _ = grade(Q_MC, "e^(2x)", FakeLlm({"verdict": "ragu"}))
    assert out["q_needs_review"] and out["q_final"][0]["points"] == 0.0
    out, _ = grade(Q_MC, "e^(2x)", FakeLlm(PermanentLlmError("x")))
    assert out["q_needs_review"]


@pytest.mark.parametrize("answer", ["1", "f'(0) = 1", "= 1,0", "1.00"])
def test_fill_numeric_equivalent_without_llm(answer):
    out, llm = grade(Q_FILL, answer)
    assert out["q_final"][0]["points"] == 2.0 and llm.calls == []


def test_fill_not_obvious_goes_to_llm():
    q = {**Q_FILL, "key_answer": "1/2"}
    out, llm = grade(q, "setengah", FakeLlm({"verdict": "benar"}))
    assert len(llm.calls) == 1 and out["q_final"][0]["points"] == 2.0
