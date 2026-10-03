"""Node graph utama (per mahasiswa).

load_submission -> budget_guard -> segment_answers -> dispatch (Send per soal)
-> grade_question x N (paralel) -> aggregate -> cross_check -> persist

budget_guard SENGAJA sebelum segment_answers: segmentasi bisa pakai LLM,
jadi kuota dicek dulu supaya sekolah yang kuotanya habis tidak memakan token.
"""

import json 
from collections import Counter 
from uuid import UUID 
from langgraph.types import Send 
from core.logging import log
from providers.llm import PermanentLlmError

from . import settings as S 
from .deps import get_deps 
from .prompts import segment_messages 
from .question_nodes import r2
from .text_utils import question_number 

LOAD_ST_SQL = """
select st.id, st.quota_charged_at, c.school_id, t.subject_id, t.max_score,
       coalesce(ct.corrector_id, c.teacher_id) as teacher_id, ct.test_id
from student_tests st
join class_tests ct on ct.id = st.class_test_id
join classes c      on c.id = ct.class_id
join tests t        on t.id = ct.test_id
where st.id = $1
"""

LOAD_QUESTIONS_SQL = """
select id, number, question_type, question_text, key_answer, max_points
from test_questions where test_id = $1 order by number
"""

LOAD_CRITERIA_SQL = """
select qc.id, qc.question_id, qc.description, qc.points
from question_criteria qc
join test_questions q on q.id = qc.question_id
where q.test_id = $1
order by qc.id
"""

LOAD_RULES_SQL = """
select title, rule from subject_rules where subject_id = $1 and is_active order by title
"""

LOAD_PAGES_SQL = """
select page_no, ocr_result from test_pages
where student_test_id = $1 and status = 'success'
order by page_no
"""

QUOTA_SQL = "select grading_remaining from school_quota($1)"

FIND_ANSWER_SQL = "select id from test_answers where student_test_id = $1 and question_id = $2"


INSERT_ANSWER_SQL = """
insert into test_answers
  (student_test_id, question_id, answer_status, answer_text, bbox, grade, criteria_result,
   grading_internal, student_feedback, confidence_grading, needs_review, ocr_issue)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
"""

UPDATE_ANSWER_SQL = """
update test_answers
set answer_status = $2, answer_text = $3, bbox = $4, grade = $5, criteria_result = $6,
    grading_internal = $7, student_feedback = $8, confidence_grading = $9,
    needs_review = $10, ocr_issue = $11
where id = $1
"""


# total & needs_review dihitung ulang dari SEMUA jawaban (penting untuk regrade sebagian soal)
MARK_GRADED_SQL = """
update student_tests st
set total_grade  = sub.total,
    needs_review = sub.any_review or $2,
    status       = 'graded'
from (select coalesce(sum(grade), 0) as total, coalesce(bool_or(needs_review), false) as any_review
      from test_answers where student_test_id = $1) sub
where st.id = $1
returning st.total_grade, st.needs_review
"""

def _f(x) -> float:
    return float(x) if x is not None else 0.0

async def load_submission(state,config): 
    deps = get_deps(config)
    st_id = UUID(state["student_test_id"])
    st = await deps.pool.fetchrow(LOAD_ST_SQL, st_id)
    if st is None:
        raise PermanentLlmError(f"student_test {st_id} tidak ditemukan")
    
    qrows = await deps.pool.fetch(LOAD_QUESTIONS_SQL, st["test_id"])
    crows = await deps.pool.fetch(LOAD_CRITERIA_SQL, st["test_id"])
    crit: dict[str, list] = {}
    for c in crows:
        crit.setdefault(str(c["question_id"]), []).append(
            {"id": str(c["id"]), "description": c["description"] or "", "points": _f(c["points"])})
    questions = []
    for q in qrows:
        criteria = crit.get(str(q["id"])) or [
            # soal tanpa rubric -> 1 kriteria implisit "sesuai kunci"
            {"id": f"auto-{q['id']}", "description": "Jawaban sesuai kunci jawaban",
            "points": _f(q["max_points"])}]
        questions.append({
            "id": str(q["id"]), "number": int(q["number"] or 0),
            "question_type": (q["question_type"] or "essay").lower(),
            "question_text": q["question_text"] or "", "key_answer": q["key_answer"] or "",
            "max_points": _f(q["max_points"]), "criteria": criteria,
        })

    blocks = []
    for p in await deps.pool.fetch(LOAD_PAGES_SQL, st_id):
        items = p["ocr_result"] or []
        if isinstance(items, str):
            items = json.loads(items)
        for i, b in enumerate(items):
            label = str(b.get("label", "")).lower()
            if label in S.IGNORED_LABELS or not str(b.get("text", "")).strip():
                continue
            blocks.append({"id": f"p{p['page_no']}-{i}", "page_no": p["page_no"], "label": label,
                           "text": str(b.get("text", "")), "bbox": list(b.get("bbox") or [])})

    rules = [f"{r['title']}: {r['rule']}" if r["title"] else r["rule"]
             for r in await deps.pool.fetch(LOAD_RULES_SQL, st["subject_id"])]
    await deps.emit({"event": "grading_started", "questions": len(questions)})
    return {
        "school_id": str(st["school_id"]), "subject_id": str(st["subject_id"]),
        "teacher_id": str(st["teacher_id"]) if st["teacher_id"] else "",
        "test_max_score": _f(st["max_score"]), "quota_charged": st["quota_charged_at"] is not None,
        "questions": questions, "blocks": blocks, "rules": rules, "run_status": "running",
    }
    
    
    
async def budget_guard(state, config):
    if state.get("quota_charged"):
        return {}                                    # regrade: sudah dibayar, tidak dicek lagi
    deps = get_deps(config)
    row = await deps.pool.fetchrow(QUOTA_SQL, UUID(state["school_id"]))
    if row is None:
        if S.REQUIRE_ACTIVE_PLAN:
            return {"run_status": "quota_exceeded", "flags": ["tidak ada paket aktif"]}
        return {}
    remaining = row["grading_remaining"]
    if remaining is not None and remaining <= 0:
        return {"run_status": "quota_exceeded", "flags": ["kuota grading habis"]}
    return {}


def route_after_budget(state) -> str:
    return "end" if state.get("run_status") == "quota_exceeded" else "segment_answers"

def _heuristic_segments(questions, blocks): 
    """Jalan urut blok; ganti soal aktif tiap ketemu penanda nomor soal di awal blok."""
    by_number = {q["number"]: q["id"] for q in questions}
    segs: dict[str, list[str]] = {q["id"]: [] for q in questions}  
    seen :set[int] = set()
    current: str | None = None 
    unassigned = 0  
    for b in blocks : 
        n = question_number(b["text"])
        if n is not None and n in by_number: 
            current = by_number[n]
            seen.add(n)
        if current is None : 
            unassigned +=1 
            continue 
        segs[current].append(b["id"])
    return segs, seen, unassigned
    


async def segment_answers(state,config):   
    """"
        ini fungsinya segmentasi jawaban per soal 
        jika tidak ketemu segmentasi heuristik
        pakai segmentasi dari LLM
    """
    questions , blocks = state["questions"], state["blocks"]
    if not questions:
        return {"segments": {}, "segment_method": "none"}
    if len(questions) == 1:
        return {"segments": {questions[0]["id"]: [b["id"] for b in blocks]},
                "segment_method": "single"}
        
    segs, seen, unassigned = _heuristic_segments(questions, blocks)
    numbers = {q["number"] for q in questions}
    if seen == numbers and unassigned <= 2: 
        return {"segments": segs, "segment_method": "heuristic"}
    
    deps = get_deps(config)
    async with deps.semaphore : 
        res = await deps.llm.complete_json(segment_messages(questions, blocks, S.SEGMENT_TEXT_PREVIEW))
    mapping = res.data.get("mapping") or {}
    valid_ids = {b["id"] for b in blocks}
    by_number = {str(q["number"]): q["id"] for q in questions}
    llm_segs: dict[str, list[str]] = {q["id"]: [] for q in questions}
    used: set[str] = set()
    for num, ids in mapping.items():
        qid = by_number.get(str(num).strip().rstrip("."))
        if qid is None or not isinstance(ids, list):
            continue
        for bid in ids:
            bid = str(bid)
            if bid in valid_ids and bid not in used:       # 1 blok hanya 1 soal
                llm_segs[qid].append(bid)
                used.add(bid)
    order = {b["id"]: i for i, b in enumerate(blocks)}
    for qid in llm_segs:
        llm_segs[qid].sort(key=order.get)
    flags = [f"segmentasi LLM (penanda nomor ketemu: {sorted(seen)})"]
    return {"segments": llm_segs, "segment_method": "llm", "tokens": res.usage.total, "flags": flags}



def dispatch(state):
    """Conditional edge: 1 Send per soal -> paralel. (Fungsi routing, bukan node.)"""
    blocks = {b["id"]: b for b in state["blocks"]}
    only = set(state.get("only_questions") or [])
    sends = []
    for q in state["questions"]:
        if only and q["id"] not in only:
            continue
        ids = state["segments"].get(q["id"], [])
        sends.append(Send("grade_question", {
            "q_question": q,
            "q_blocks": [blocks[i] for i in ids if i in blocks],
            "q_rules": state.get("rules", []),
            "q_teacher_id": state.get("teacher_id", ""),
            "q_subject_id": state.get("subject_id", ""),
        }))
    return sends or ["aggregate"]


async def aggregate(state, config):
    """
        ini fungsinya untuk menggabungkan semua hasil soal
    """
    
    results = state.get("results", [])
    total = r2(sum(r.get("grade", 0) for r in results))
    needs_review = any(r.get("needs_review") for r in results)
    await get_deps(config).emit({"event": "grading_aggregated", "total_grade": total,
                                 "needs_review": needs_review})
    return {"total_grade": total, "needs_review": needs_review}


async def cross_check(state, config):
    """
        ini ngecek total score, flag review , total nilai 
    """
    
    flags = list(state.get("flags", []))
    results = state.get("results", [])
    only = set(state.get("only_questions") or [])
    expected = {q["id"] for q in state["questions"] if not only or q["id"] in only}
    got = [r["question_id"] for r in results]
    if set(got) != expected or len(got) != len(set(got)):
        flags.append("jumlah hasil soal tidak cocok (hilang/dobel)")

    max_score = state.get("test_max_score") or 0
    if not only and max_score and state.get("total_grade", 0) > max_score + 1e-9:
        flags.append(f"total {state['total_grade']} > nilai maksimal tes {max_score}")

    # blok yang sama jadi bukti 'loss' di >1 soal -> potensi pengurangan dobel
    loss_q = Counter()
    for r in results:
        for bid in {b["block_id"] for b in r.get("bbox", []) if b.get("kind") == "loss"}:
            loss_q[bid] += 1
    dup = [bid for bid, n in loss_q.items() if n > 1]
    if dup:
        flags.append(f"blok jadi bukti pengurangan di >1 soal: {dup[:5]}")

    needs_review = state.get("needs_review", False) or bool(flags)
    return {"flags": flags, "needs_review": needs_review}




async def persist(state, config):
    deps = get_deps(config)
    st_id = UUID(state["student_test_id"])
    if deps.dry_run:
        log.info("persist DRY-RUN student_test=%s total=%s", st_id, state.get("total_grade"))
        return {"run_status": "graded"}
    async with deps.pool.acquire() as conn, conn.transaction():
        for r in state.get("results", []):
            qid = UUID(r["question_id"])
            args = (r["answer_status"], r.get("answer_text", ""), r.get("bbox", []), r["grade"],
                    r.get("criteria_result", []), r.get("grading_internal", {}),
                    r.get("student_feedback", {}), r.get("confidence"), r.get("needs_review", False),
                    bool(r.get("ocr_issue")))
            existing = await conn.fetchval(FIND_ANSWER_SQL, st_id, qid)
            if existing:                      # regrade: UPDATE (id tetap -> keberatan/override aman)
                await conn.execute(UPDATE_ANSWER_SQL, existing, *args)
            else:
                await conn.execute(INSERT_ANSWER_SQL, st_id, qid, *args)
        # flag cross_check (mis. total > maks) tetap memaksa review
        row = await conn.fetchrow(MARK_GRADED_SQL, st_id, bool(state.get("flags")))
    total = float(row["total_grade"])
    log.info("persist student_test=%s total=%s review=%s", st_id, total, row["needs_review"])
    return {"run_status": "graded", "total_grade": total, "needs_review": row["needs_review"]}
