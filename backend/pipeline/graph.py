from uuid import UUID 
from langgraph.graph import END , START , StateGraph 

from core.logging import log 
import asyncio 

from providers.embedding import TransientEmbeddingError
from providers.llm import PermanentLlmError, TransientLlmError

from . import settings as S 
from . import question_nodes as QN 
from . import submission_nodes as SN 
from .deps import GradingDeps, get_deps 
from .state import QuestionInput, QuestionState, SubmissionState


def build_question_graph(): 
    g = StateGraph(QuestionState,input_schema=QuestionInput)
    g.add_node("assemble_answer", QN.assemble_answer)
    g.add_node("precheck", QN.precheck)
    g.add_node("zero_score", QN.zero_score)
    g.add_node("exact_match", QN.exact_match)
    g.add_node("retrieve_traits", QN.retrieve_traits)
    g.add_node("check_calculations", QN.check_calculations)
    g.add_node("grade_samples", QN.grade_samples)
    g.add_node("reconcile", QN.reconcile)
    g.add_node("verify", QN.verify)
    g.add_node("map_bbox", QN.map_bbox)
    g.add_node("write_feedback", QN.write_feedback)
    g.add_node("finalize", QN.finalize)
    
    g.add_edge(START, "assemble_answer")
    g.add_edge("assemble_answer", "precheck")
    g.add_conditional_edges("precheck", QN.route_after_precheck,
                            ["zero_score", "exact_match", "retrieve_traits"])
    g.add_edge("zero_score", "map_bbox")
    g.add_edge("exact_match", "map_bbox")
    
    g.add_edge("retrieve_traits", "check_calculations")
    g.add_edge("check_calculations", "grade_samples")
    g.add_edge("grade_samples", "reconcile")
    g.add_conditional_edges("reconcile", QN.route_after_reconcile, ["verify", "map_bbox"])
    g.add_edge("verify", "map_bbox")
    
    g.add_edge("map_bbox", "write_feedback")
    g.add_edge("write_feedback", "finalize")
    g.add_edge("finalize", END)
    # checkpointer=False: subgraph tidak bikin checkpoint sendiri (granularitas resume = per soal)
    return g.compile(checkpointer=False)

QUESTION_GRAPH = build_question_graph()

async def grade_question(qin: dict, config) -> dict : 
    """Node di main graph (target Send). Jalankan subgraph 1 soal.
    Error PERMANEN di 1 soal -> soal itu needs_review, mahasiswa tetap lanjut.
    Error SEMENTARA -> dilempar ke atas -> job ARQ retry -> resume dari checkpoint."""
    q = qin["q_question"]
    deps = get_deps(config)
    try: 
        out = await _invoke_with_retry(qin,deps)
    except PermanentLlmError as e : 
        log.warning("grade_question %s permanent error: %s", q["id"], e)
        out = {"results": [{
            "question_id": q["id"], "answer_status": "answered",
            "answer_text": "\n".join(b["text"] for b in qin.get("q_blocks", [])),
            "grade": 0.0, "criteria_result": [], "grading_internal": {"error": str(e)[:500]},
            "student_feedback": {"summary": "Jawaban sedang ditinjau dosen.", "points": []},
            "bbox": [], "confidence": 0.0, "needs_review": True, "ocr_issue": None,
            "error": str(e)[:500],
        }], "q_tokens": 0}
    await deps.emit({"event": "question_graded", "question_id": q["id"]})
    return {"results": out["results"], "tokens": out.get("q_tokens", 0) or 0}

        
async def _invoke_with_retry(qin: dict, deps) -> dict:
    for attempt in range(S.QUESTION_TRANSIENT_RETRIES + 1):
        try:
            return await QUESTION_GRAPH.ainvoke(qin, config={"configurable": {"deps": deps}})
        except (TransientLlmError, TransientEmbeddingError) as e:
            if attempt >= S.QUESTION_TRANSIENT_RETRIES:
                raise
            log.warning("grade_question %s transient (%s), coba lagi", qin["q_question"]["id"], e)
            await asyncio.sleep(S.QUESTION_RETRY_DELAY * (attempt + 1))

def build_submission_graph(checkpointer=None):
    g = StateGraph(SubmissionState)
    g.add_node("load_submission", SN.load_submission)
    g.add_node("budget_guard", SN.budget_guard)
    g.add_node("segment_answers", SN.segment_answers)
    g.add_node("grade_question", grade_question)
    g.add_node("aggregate", SN.aggregate)
    g.add_node("cross_check", SN.cross_check)
    g.add_node("persist", SN.persist)

    g.add_edge(START, "load_submission")
    g.add_edge("load_submission", "budget_guard")
    g.add_conditional_edges("budget_guard", SN.route_after_budget,
                            {"end": END, "segment_answers": "segment_answers"})
    g.add_conditional_edges("segment_answers", SN.dispatch, ["grade_question", "aggregate"])
    g.add_edge("grade_question", "aggregate")
    g.add_edge("aggregate", "cross_check")
    g.add_edge("cross_check", "persist")
    g.add_edge("persist", END)
    return g.compile(checkpointer=checkpointer)


async def run_grading(student_test_id: UUID | str, deps: GradingDeps, *,
                      checkpointer=None, thread_id: str | None = None,
                      question_ids: list[str] | None = None) -> dict:
    """Jalankan / lanjutkan grading 1 mahasiswa. Return state akhir.

    Kalau thread_id sudah punya checkpoint yang belum selesai -> LANJUT dari situ
    (input None), bukan mulai ulang.
    
    langsung jalanin build_submission_graph dan ngecek log info dari state yang ada 
    """
    graph = build_submission_graph(checkpointer)
    config = {"configurable": {"deps": deps, "thread_id": thread_id or str(student_test_id)},
              "recursion_limit": 50}

    if checkpointer is not None:
        snap = await graph.aget_state(config)
        if snap.values and snap.next:
            log.info("run_grading resume thread=%s next=%s", config["configurable"]["thread_id"], snap.next)
            await graph.ainvoke(None, config)
            return (await graph.aget_state(config)).values
        if snap.values and not snap.next:
            return snap.values                       # thread ini sudah selesai

    inp = {"student_test_id": str(student_test_id), "only_questions": [str(q) for q in (question_ids or [])]}
    return await graph.ainvoke(inp, config)


async def tokens_so_far(checkpointer, thread_id: str) -> int:
    """Token yang sudah terpakai di thread ini (dari checkpoint). Dipakai saat run gagal."""
    if checkpointer is None or not thread_id:
        return 0
    graph = build_submission_graph(checkpointer)
    try:
        snap = await graph.aget_state({"configurable": {"thread_id": thread_id}})
    except Exception:
        return 0
    return int((snap.values or {}).get("tokens", 0) or 0)
