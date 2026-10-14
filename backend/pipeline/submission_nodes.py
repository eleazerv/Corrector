"""Node graph utama (per mahasiswa).

load_submission -> budget_guard -> segment_answers -> dispatch (Send per soal)
-> grade_question x N (paralel) -> aggregate -> cross_check -> persist

budget_guard SENGAJA sebelum segment_answers: segmentasi bisa pakai LLM,
jadi kuota dicek dulu supaya sekolah yang kuotanya habis tidak memakan token.
"""

import json 
from collections import Counter 
from uuid import UUID 
from langgraph.graph import END  
from langgraph.types import Send 
from core.logging import log
from providers.llm import PermanentLlmError

from . import settings as S 
from .deps import get_deps 
from .prompts import segment_messages 
from .question_nodes import r2
from .text_utils import is_short_answer_list, line_markers 

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
    """
    load student test , question, criteria , blocks , rules sebagai context 
    bakalan update school_id , subject_id , teacher_id , test_max_score , quota_charged , 
    questions , blocks , rules and run_status pada submission_state 
    """
    
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
    """ ini pengecekgan budget ngecek state quota_charged ( kalo udah ga perlu bayar lagi ) 
    jika belom harus ngecek di sql dann ngecek apakah masih ada quota 
    """
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
    """ ini ngarahin kalo ada budget ato engga kalo bisa ya lanjut ke segment_answer kalo engga end"""
    return "end" if state.get("run_status") == "quota_exceeded" else "segment_answers"

# segmentasi = LLM pemeta utama + petunjuk (regex & posisi bbox)

# Regex saja rapuh untuk tulisan tangan (langkah "1. 2. 3." di dalam jawaban, "lanjutan no. 11",
# beberapa jawaban di 1 blok, urutan acak). Sekarang regex + posisi hanya PETUNJUK untuk LLM.
# Jalur cepat tanpa LLM hanya kalau penanda nomor "bersih": urut naik, tiap nomor tepat sekali,
# semua soal ketemu, tidak ada blok berisi >1 penanda.

def _block_hints(questions, blocks) -> dict[str, dict]:
    """Petunjuk per blok: nomor soal di awal baris (regex) + apakah di margin kiri + posisi y."""
    numbers = {q["number"] for q in questions}
    left_by_page: dict[int, int] = {}
    for b in blocks:
        if len(b.get("bbox") or []) == 4:
            left_by_page[b["page_no"]] = min(left_by_page.get(b["page_no"], 1000), int(b["bbox"][0]))
    hints = {}
    for b in blocks:
        h = {}
        marks = [n for n in line_markers(b["text"]) if n in numbers]
        if marks:
            h["petunjuk_nomor"] = marks
        bb = b.get("bbox") or []
        if len(bb) == 4:
            h["kiri"] = int(bb[0]) <= left_by_page.get(b["page_no"], 0) + S.SEGMENT_LEFT_MARGIN
            h["y"] = int(bb[1])
        hints[b["id"]] = h
    return hints


def _heuristic_segments(questions, blocks, hints):
    """Jalur cepat. Return (segs, seen, clean). clean=False -> serahkan ke LLM."""
    by_number = {q["number"]: q["id"] for q in questions}
    segs: dict[str, list[str]] = {q["id"]: [] for q in questions}
    order: list[int] = []
    current: str | None = None
    unassigned, multi = 0, False
    for b in blocks:
        marks = hints.get(b["id"], {}).get("petunjuk_nomor", [])
        if len(marks) > 1:
            multi = True
        if marks:
            current = by_number[marks[0]]
            order.append(marks[0])
        if current is None:
            unassigned += 1
            continue
        segs[current].append(b["id"])
    seen = set(order)
    clean = (not multi and seen == set(by_number) and len(order) == len(seen)
             and order == sorted(order) and unassigned <= 2)
    return segs, seen, clean


def _parse_llm_mapping(data, questions, blocks, hints) -> tuple[dict[str, list[str]], set[str], list[int]]:
    """Validasi output LLM. 1 blok 1 soal, KECUALI blok yang memuat >1 petunjuk nomor."""
    mapping = data.get("mapping") if isinstance(data, dict) else None
    mapping = mapping if isinstance(mapping, dict) else {}
    valid_ids = {b["id"] for b in blocks}
    multi_ok = {b["id"] for b in blocks
                if len(hints.get(b["id"], {}).get("petunjuk_nomor", [])) > 1
                and is_short_answer_list(b["text"], S.SEGMENT_SHORT_LINE)}
    by_number = {str(q["number"]): q["id"] for q in questions}
    segs: dict[str, list[str]] = {q["id"]: [] for q in questions}
    used: set[str] = set()
    for num, ids in mapping.items():
        qid = by_number.get(str(num).strip().rstrip("."))
        if qid is None or not isinstance(ids, list):
            continue
        for bid in map(str, ids):
            if bid not in valid_ids or bid in segs[qid]:
                continue
            if bid in used and bid not in multi_ok:
                continue
            segs[qid].append(bid)
            used.add(bid)
    order = {b["id"]: i for i, b in enumerate(blocks)}
    for qid in segs:
        segs[qid].sort(key=order.get)
    raw_doubt = data.get("ragu") if isinstance(data, dict) else None
    numbers = {q["number"] for q in questions}
    doubt = sorted({int(x) for x in (raw_doubt if isinstance(raw_doubt, list) else [])
                    if str(x).strip().isdigit() and int(x) in numbers})
    return segs, used, doubt


async def segment_answers(state, config):
    """Petakan blok OCR ke soal. Lihat penjelasan di atas ."""
    questions, blocks = state["questions"], state["blocks"]
    if not questions:
        return {"segments": {}, "segment_method": "none"}
    if len(questions) == 1:
        return {"segments": {questions[0]["id"]: [b["id"] for b in blocks]},
                "segment_method": "single"}

    # tidak ada blok sama sekali -> bukan lembar jawaban, jangan panggil LLM
    if not blocks and not state.get("only_questions"):
        return {"segments": {}, "segment_method": "none", "run_status": "not_answer_sheet",
                "flags": [S.NOT_SHEET_REASON]}

    hints = _block_hints(questions, blocks)
    segs, seen, clean = _heuristic_segments(questions, blocks, hints)
    if clean and S.SEGMENT_FAST_PATH:
        return {"segments": segs, "segment_method": "heuristic"}

    deps = get_deps(config)
    try:
        async with deps.semaphore:
            res = await deps.llm.complete_json(
                segment_messages(questions, blocks, S.SEGMENT_TEXT_PREVIEW, hints),
                max_tokens=S.SEGMENT_MAX_TOKENS)
    except PermanentLlmError as e:
        # LLM gagal permanen -> pakai hasil regex apa adanya, tapi lembar wajib dicek dosen
        return {"segments": segs, "segment_method": "heuristic",
                "flags": [f"segmentasi LLM gagal, pakai penanda nomor saja: {e}"[:200]]}

    llm_segs, used, doubt = _parse_llm_mapping(res.data, questions, blocks, hints)
    # flag = paksa lembar "Perlu dicek" (cross_check/persist). Info biasa cukup di log, supaya
    # lembar yang dipetakan LLM dengan yakin tidak otomatis masuk review.
    log.info("segment_answers %s: llm, penanda=%s, ragu=%s", state.get("student_test_id"), sorted(seen), doubt)
    flags = []
    if doubt:
        flags.append(f"pemetaan jawaban ragu untuk soal {doubt}")

    # 0 penanda + LLM tidak memetakan apa pun -> foto salah / bukan lembar jawaban
    if not seen and not used and not state.get("only_questions"):
        return {"segments": llm_segs, "segment_method": "llm", "tokens": res.usage.total,
                "run_status": "not_answer_sheet", "flags": flags + [S.NOT_SHEET_REASON]}
    out = {"segments": llm_segs, "segment_method": "llm", "tokens": res.usage.total}
    if flags:
        out["flags"] = flags
    return out



def dispatch(state):
    """Conditional edge: 1 Send per soal -> paralel. (Fungsi routing, bukan node.)"""
    if state.get("run_status") == "not_answer_sheet":     
        return END
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
    """" 
    ini fungsinya simpan nilai ke db 
    ada state dry_run => ini hanya testing dan sengaja ga dicatat ke db 
    jika di catat cek apakah udah pernah ada atau belum , jika belum maka insert jawabannya 
    jika sudah ada di update 
    """
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
