"""
bide subgraph per soal 

flow : 
- assemble_answer 
- precheck 
- router_by_type (
    - exact_match | retrieve_traits 
    - grade_samples
    - reconcile
    - score_confidence 
    - [verify])
- map_bbox
- write_feedback
- finalize
"""

import asyncio 
import math   
import re 
import statistics 
from providers.llm import PermanentLlmError , TransientLlmError

from . import settings as S 

from .calculator import evaluate , is_close , normalize_kind , run_symbolic 
from .deps import get_deps 
from .prompts import advocate_messages, calc_plan_messages, grade_messages,judge_messages
from .text_utils import compact, compact_answer, garbage_ratio, normalize, remove_copied_question, strip_marker


TRAITS_SQL = """
select canonical_text
from teacher_traits
where teacher_id = $1 and subject_id = $2 and is_active
order by evidence_count desc, last_seen desc nulls last, id
limit $3
"""

def r2(x: float) -> float:
    """Bulatkan 2 desimal (hindari 7.499999999)."""
    return round(float(x) + 0.0, 2)

async def assemble_answer(state,config): 
    """" 
    ngumpulin jawaban dari ocr block ke satu text
    """
    blocks = state.get("q_blocks") or []
    text = "\n".join(b["text"] for b in blocks if b.get("text"))
    if not blocks:
        return {"q_answer_text": "", "q_status": "unmapped",
                "q_precheck": "tidak ada blok OCR yang terpetakan ke soal ini"}
    return {"q_answer_text": text}


async def precheck(state,config) : 
    """Heuristik murah, tanpa LLM. Kalau ragu -> lanjut grading (LLM bisa tandai irrelevant)."""
    if state.get("q_status") == "unmapped":
        return {}
    q = state["q_question"]
    text = strip_marker(state.get("q_answer_text",""))
    min_chars = 1 if q["question_type"] == "objective" else S.MIN_ANSWER_CHARS

    if len(compact(text)) < min_chars:
        return {"q_status": "unanswered", "q_precheck": "jawaban kosong"}
    if garbage_ratio(text) >= S.GARBAGE_RATIO:
        return {"q_status": "answered", "q_ocr_issue": "banyak karakter tidak terbaca (OCR)",
                "q_needs_review": True}
    notes = []
    rest = remove_copied_question(text, q["question_text"], S.MIN_COPIED_WORDS)
    if rest != text:                                    # ada salinan soal (≥8 kata berurutan)
        notes.append("jawaban memuat salinan soal; nilai hanya bagian jawabannya")
        if len(compact(rest)) < min_chars:
            notes.append("setelah salinan soal dibuang, hampir tidak ada jawaban")
    
    return {"q_status": "answered", "q_notes": notes}


def route_after_precheck(state) -> str:
    status = state.get("q_status")
    if status in ("unanswered", "irrelevant", "unmapped"):
        return "zero_score"
    if state["q_question"]["question_type"] == "objective":
        return "exact_match"
    return "retrieve_traits"

async def zero_score(state, config):
    q = state["q_question"]
    final = [{"criterion_id": c["id"], "points": 0.0, "max_points": c["points"],
              "evidence_block_ids": [], "reasoning": state.get("q_precheck") or "", "feedback": ""}
             for c in q["criteria"]]
    review = state.get("q_status") == "unmapped"      # segmentasi gagal -> dosen harus cek
    return {"q_final": final, "q_confidence": 1.0 if not review else 0.0,
            "q_needs_review": review or state.get("q_needs_review", False)}



# --- objective ( ga perlu LLM sama sekali contoh : jawaban singkat )
_OPTION_RE = re.compile(r"(?:^|[^a-z])([a-e])(?:[\.\)\s]|$)", re.IGNORECASE)

async def exact_match(state, config):
    """"
    exact_match hanya dipakai untuk soal isian singkat atau pilihan ganda 
    ( rare case )
    """
    q = state["q_question"]
    ans, key = strip_marker(state.get("q_answer_text", "")), q["key_answer"] or ""
    key_c, ans_c = compact(key), compact(ans)
    is_choice = len(key_c) == 1 and key_c.isalpha()

    correct: bool | None
    notes: list[str] = []
    if is_choice:                                           # pilihan ganda: kunci "b"
        options = {m.lower() for m in _OPTION_RE.findall(normalize(ans))}
        if len(options) > 1:
            correct, notes = None, [f"lebih dari satu opsi terbaca: {sorted(options)}"]
        else:
            correct = key_c in options or ans_c == key_c
    else:

        key_a, ans_a = compact_answer(key), compact_answer(ans)
        correct = bool(key_a) and (ans_a == key_a or f" {normalize(key)} " in f" {normalize(ans)} ")
        if not correct:
  
            correct = None
            notes = ["isian tidak cocok persis dengan kunci; cek manual"]

    ids = [b["id"] for b in state.get("q_blocks", [])]
    final = [{"criterion_id": c["id"], "points": c["points"] if correct else 0.0,
              "max_points": c["points"], "evidence_block_ids": ids,
              "reasoning": "cocok dengan kunci" if correct else "tidak cocok dengan kunci",
              "feedback": "Jawaban benar." if correct else "Jawaban belum tepat."}
             for c in q["criteria"]]
    return {"q_final": final, "q_confidence": 1.0 if correct is not None else 0.3,
            "q_needs_review": correct is None, "q_notes": notes}


# traits 



async def retrieve_traits(state, config):
    """Ambil SEMUA trait aktif dosen untuk matkul ini (maks MAX_TRAITS, paling terbukti dulu).
    Tanpa embedding: grader yang memilih trait relevan setelah membaca jawaban."""
    deps = get_deps(config)
    rows = await deps.pool.fetch(TRAITS_SQL, state["q_teacher_id"], state["q_subject_id"], S.MAX_TRAITS)
    return {"q_traits": [r["canonical_text"] for r in rows]}

_VAR_RE = re.compile(r"^(?:[A-Za-z]|alpha|beta|gamma|theta|phi|lam|mu|omega|tau|rho)$")

def _opt_str(v, limit: int = 100) -> str | None:
    """None / "" -> None; selain itu string terpotong."""
    return None if v in (None, "") else str(v).strip()[:limit]

def _clean_calcs(data, block_ids: set[str]) -> list[dict]: 
    """
    Rapikan output LLM : buang item rusak / jenis asing / id blok palsu / field wajib ksong
    """
    items = data.get("calcs") if isinstance(data,dict) else None 
    if not isinstance(items, list):
        return []
    out = []
    for i , it in enumerate(items[:S.CALC_MAX_ITEMS],start=1): 
        if not isinstance(it,dict): 
            continue 
        expr = _opt_str(it.get("ekspresi"), 300)
        kind = normalize_kind(it.get("jenis"))   
        if not expr or kind is None:
            continue
        if kind != "angka" and not S.CALC_SYMBOLIC_ENABLED:
            continue
        variabel = it.get("variabel")
        if isinstance(variabel, str):
            variabel = [variabel]
        variabel = [str(v).strip() for v in (variabel or []) if _VAR_RE.match(str(v).strip())][:3]
        c = {
            "id": str(it.get("id") or f"c{i}")[:20],
            "blok": it.get("blok") if it.get("blok") in block_ids else None,
            "jenis": kind,
            "ekspresi": expr,
            "variabel": variabel,
            "batas_bawah": _opt_str(it.get("batas_bawah"), 50),
            "batas_atas": _opt_str(it.get("batas_atas"), 50),
            "menuju": _opt_str(it.get("menuju"), 50),
            "arah": it.get("arah") if it.get("arah") in ("+", "-") else None,
            "ditulis": _opt_str(it.get("ditulis"), 300),
            "tujuan": _opt_str(it.get("tujuan")) or "",
        }
        if kind == "turunan_parsial" and not variabel:
            continue                              # tanpa variabel tidak jelas turunan terhadap apa
        if kind == "integral_tentu" and (c["batas_bawah"] is None or c["batas_atas"] is None):
            continue
        if kind == "limit" and c["menuju"] is None:
            continue
        out.append(c)
    return out

def _compute_calcs(calcs: list[dict]) -> list[dict]: 
    """Hitung semua item. "angka" langsung di sini; simbolik lewat proses SymPy (ada timeout).
    Item yang gagal dihitung DIBUANG. BLOCKING -> panggil lewat asyncio.to_thread."""
    
    symbolic = [c for c in calcs if c["jenis"] != "angka"]
    sym_results = run_symbolic(symbolic, timeout=S.SYMPY_TIMEOUT_SEC,
                               budget=S.SYMPY_BUDGET_SEC) if symbolic else []
    by_id = {id(c):r for c , r in zip(symbolic,sym_results)}
    out = []
    for c in calcs: 
        if c["jenis"] == "angka":
            value =evaluate(c["ekspresi"])
            if value is None : 
                continue 
            written = evaluate(c["ditulis"]) if c["ditulis"] else None
            out.append({**c, "hasil_program": round(value, 6),
                        "cocok": None if written is None else is_close(value, written)})
        else:
            r = by_id[id(c)]
            if "error" in r:
                continue
            out.append({**c, "hasil_program": r["hasil_program"], "cocok": r["cocok"]})
    return out


async def check_calculations(state,config): 
    """
    Soal calculation : llm nulis item hitungan -> program hitung -> calculator.py 
    gagal apa pun ( LLM permanen / json rusak / sympy error ) -> dilewati , grading tetap jalan
    """
    q = state["q_question"]
    if not S.CALC_CHECK_ENABLED or q["question_type"] != "calculation": 
        return {"q_calcs": []}
    deps = get_deps(config)
    blocks = state.get("q_blocks",[])
    try: 
        async with deps.semaphore: 
            res = await deps.llm.complete_json(calc_plan_messages(q, blocks),
                                               max_tokens=S.CALC_PLAN_MAX_TOKENS)
    except TransientLlmError:
        raise 
    except Exception as e : 
        return {"q_calcs": [], "q_notes": [f"cek hitungan dilewati: {e}"[:200]]}

    planned = _clean_calcs(res.data , {b["id"] for b in blocks})
    try:
        calcs = await asyncio.to_thread(_compute_calcs, planned)   # SymPy tidak memblok event loop
    except Exception as e:
        return {"q_calcs": [], "q_tokens": res.usage.total,
                "q_notes": [f"cek hitungan gagal dihitung: {e}"[:200]]}
    wrong = sum(1 for c in calcs if c["cocok"] is False)
    notes = [f"cek hitungan: {wrong} tidak cocok dari {len(calcs)}"] if calcs else []
    if len(calcs) < len(planned): 
        notes.append(f"cek hitungan: {len(planned) - len(calcs)} item tidak bisa dihitung")
    return {"q_calcs": calcs, "q_tokens": res.usage.total, "q_notes": notes}



#-- grade_samples (+ validate)

def validate_sample(data: dict , criteria : list[dict], block_ids : set [str])  -> tuple[list[dict] |None , str | None] : 
    """Cek schema output LLM. Return (hasil_bersih, None) atau (None, pesan_error)."""
    items = data.get("criteria")
    if not isinstance(items,list): 
        return None, " key 'criteria' must be list"
    by_id = {}
    for it in items : 
        if not isinstance(it,dict): 
            return None, "every item criteria must be an object"
        cid = str(it.get("criterion_id",""))
        by_id[cid] = it 
    expected = {c["id"] for c in criteria}
    missing = expected - by_id.keys()
    if missing : 
        return None, f"criterion_id missing: {sorted(missing)}"
    out =[]
    for c in criteria : 
        it = by_id[c["id"]]
        try: 
            pts = float(it.get("points"))
        except(TypeError,ValueError): 
            return None , f" points {c['id']} is not number"
        if not math.isfinite(pts) or pts < 0 or pts > c["points"] + 1e-9 : 
            return None , f" points {c['id']} must be between 0 and {c['points']}"
        # membuat bukti selalu kosong -> bbox tidak pernah muncul, tanpa error.
        ev = [str(e)  for e in (it.get("evidence_block_ids") or[]) if str(e) in block_ids]
        out.append({"criterion_id": c["id"], "points": r2(pts), "max_points": c["points"],
                    "evidence_block_ids": ev,
                    "reasoning": str(it.get("reasoning", ""))[:1000],
                    "feedback": str(it.get("feedback", ""))[:500]})
    return out, None        

async def _one_sample (deps,q,criteria,blocks,traits,rules,temperature,calcs=None) -> tuple[dict | None , int]: 
    """
    penilaian oleh llm lengkap dengan retry kalo ga valid 
    called by = grade_samples dengan temperature yang berbeda 
    """
    
    block_ids = {b["id"] for b in blocks}
    hint, tokens = None , 0 
    for _ in range(S.MAX_VALIDATE_RETRIES + 1): 
        msgs = grade_messages(q,criteria,blocks,traits,rules,hint, calcs=calcs)
        async with deps.semaphore :
            res = await deps.llm.complete_json(msgs,temperature=temperature)
        tokens += res.usage.total
        clean , err = validate_sample(res.data , criteria , block_ids)
        if clean is not None : 
            # Key return "q_criteria"/"q_status" -> "criteria"/"answer_status": ini isi SATU sampel, bukan key
            # state; grade_samples, reconcile, dan finalize membaca s["criteria"] / s["answer_status"].
            status = "irrelevant" if res.data.get("answer_status") == "irrelevant" else "answered"
            return {"criteria": clean, "answer_status": status}, tokens
        hint = err 
    return None, tokens

async def grade_samples(state,config):   
    """"
    bearti grade sample tuh bisa panggil AI berxx dengan temperature yang berbeda 
    ( ini sampel yang dipake untuk reconcile? )
    kriteria k1 (maks 10):   sampel A = 8,  B = 8,  C = 7
    median  = 8        → nilai akhir
    spread  = 8 - 7 = 1 → ada sedikit beda pendapat
    """
    deps = get_deps(config)
    q = state["q_question"]
    blocks = state.get("q_blocks",[])
    traits , rules = state.get("q_traits",[]), state.get("q_rules",[])
    n = S.SAMPLES_CALCULATION if q["question_type"] == "calculation" else S.SAMPLES_DEFAULT
    temps = [S.SAMPLE_TEMPERATURES[i % len(S.SAMPLE_TEMPERATURES)] for i in range(n)] 
       
    long_answer = len(state.get("q_answer_text","")) > S.LONG_ANSWER_CHARS and len(q["criteria"]) > 1
    groups = [[c] for c in q["criteria"]] if long_answer else [q["criteria"]]  
    
    async def sample(t): 
        merged , tok = [], 0 
        status = "answered"
        for g in groups : 
            got , used = await _one_sample(deps,q,g,blocks,traits,rules,t,calcs=state.get("q_calcs"))
            tok += used 
            if got is None : 
                return None , tok 
            merged.extend(got["criteria"])
            if got["answer_status"] == "irrelevant" :   
                status = "irrelevant" 
        return {"criteria": merged, "answer_status": status}, tok
    
    outs = await asyncio.gather(*(sample(t) for t in temps))
    samples = [s for s , _ in outs if s is not None]
    tokens = sum(t for _, t in outs)
    if not samples:
        raise PermanentLlmError(f"semua {n} sampel tidak valid setelah retry")
    return {"q_samples": samples, "q_tokens": tokens,
            "q_notes": [f"mode per-kriteria (jawaban panjang)"] if long_answer else []}

async def reconcile(state,config): 
    q = state["q_question"]
    samples = state["q_samples"]
    final , spread_total = [], 0
    for c in q["criteria"]: 
        vals = [next(x for x in s["criteria"] if x["criterion_id"] == c["id"] ) for s in samples]
        pts = [v["points"] for v in vals]
        med = statistics.median(pts)
        rep = min(vals, key=lambda v: abs(v["points"] - med)) # sampel terdekat dengan median
        spread = max(pts) - min(pts) 
        spread_total += spread
        final.append({**rep, "points": r2(med), "low": min(pts), "high": max(pts),
                      "spread": r2(spread)})
    max_pts = sum(c["points"] for c in q ["criteria"]) or 1.0 
    confidence = max(0.0 ,  1.0 - spread_total / max_pts)
    if len(samples) == 1: 
        confidence = min(confidence, 0.7)
    irrelevant_votes = sum(1 for s in samples if s["answer_status"] == "irrelevant")
    status = "irrelevant" if irrelevant_votes * 2 > len(samples) else "answered"

    notes, suspicious = [], False
    total = sum(c["points"] for c in final)
    if (q["question_type"] == "essay" and total == 0 and status == "answered"
            and len(state.get("q_answer_text", "")) >= S.SUSPICIOUS_ZERO_MIN_CHARS):
        suspicious, notes = True, ["essay panjang tapi nilai 0"]
    if state.get("q_ocr_issue") and confidence >= S.CONFIDENCE_VERIFY:
        suspicious, notes = True, notes + ["OCR bermasalah; cek teks asli"]
    wrong_math = [c for c in state.get("q_calcs", []) if c["cocok"] is False and c["blok"]]
    if wrong_math and total >= max_pts - 1e-9:
        suspicious, notes = True, notes + ["nilai penuh padahal ada hitungan mahasiswa yang tidak cocok"]
    out = {"q_final": final, "q_confidence": r2(confidence), "q_status": status, "q_notes": notes}
    if suspicious:
        out["q_needs_review"] = True
    return out

def route_after_reconcile(state) -> str:
    disputed = any(c.get("spread", 0) > 0 for c in state["q_final"])
    return "verify" if disputed and state["q_confidence"] < S.CONFIDENCE_VERIFY else "map_bbox"

async def verify (state,config): 
    deps = get_deps(config)
    q = state["q_question"]
    disputes = []
    disputes = [{"criterion_id": c["criterion_id"], "skor_rendah": c["low"], "skor_tinggi": c["high"],
                 "poin_maks": c["max_points"]} for c in state["q_final"] if c.get("spread", 0) > 0]
    base = grade_messages(q, q["criteria"], state.get("q_blocks", []), state.get("q_traits", []),
                          state.get("q_rules", []), calcs=state.get("q_calcs"))[1]["content"]

    async def call(msgs):
        async with deps.semaphore:
            return await deps.llm.complete_json(msgs)
        
    hi , lo = await asyncio.gather(
        call(advocate_messages("pembela SKOR TINGGI", "yang lebih tinggi", base, disputes)),
        call(advocate_messages("pembela SKOR RENDAH", "yang lebih rendah", base, disputes)),
    )
    
    judge = await call(judge_messages(base, disputes, hi.data, lo.data))
    tokens = hi.usage.total + lo.usage.total + judge.usage.total
    
    decisions = {str(d.get("criterion_id")): d for d in (judge.data.get("decisions") or []) if isinstance(d, dict)}
    
    final, unresolved = [], []
    for c in state["q_final"]:
        if c.get("spread", 0) <= 0:
            final.append(c)
            continue
        d = decisions.get(c["criterion_id"])
        try:
            pts = float(d["points"]) if d else None
        except (TypeError, ValueError, KeyError):
            pts = None
        if pts is None or pts < c["low"] - 1e-9 or pts > c["high"] + 1e-9:
            unresolved.append(c["criterion_id"])        # hakim keluar rentang -> pakai median
            final.append(c)
        else:
            final.append({**c, "points": r2(pts),
                          "reasoning": str(d.get("reasoning", c["reasoning"]))[:1000]})

    confident = bool(judge.data.get("confident", False)) and not unresolved
    confidence = max(state["q_confidence"], 0.85) if confident else min(state["q_confidence"], 0.5)
    return {"q_final": final, "q_confidence": r2(confidence), "q_tokens": tokens,
            "q_verify": {"disputes": disputes, "confident": confident, "unresolved": unresolved},
            "q_needs_review": state.get("q_needs_review", False) or not confident}

#  bbox / feedback / finalize

async def map_bbox(state,config) : 
    by_id = {b["id"] : b for b in state.get("q_blocks", [])}
    out = []
    for c in state.get("q_final",[]): 
        kind = ("gain" if c["points"] >= c["max_points"] - 1e-9
                else "partial" if c["points"] > 0 else "loss")
        for bid in c.get("evidence_block_ids", []):
            b = by_id.get(bid)
            if b and len(b.get("bbox") or []) == 4:
                out.append({"block_id": bid, "page_no": b["page_no"], "bbox": b["bbox"],
                            "criterion_id": c["criterion_id"], "kind": kind})
    return {"q_bbox": out}


def _leaks(text: str, criteria: list[dict]) -> bool:
    """Feedback mahasiswa tidak boleh memuat kalimat rubric (termasuk kriteria pendek)."""
    t = normalize(text)
    for c in criteria:
        d = normalize(c["description"])
        if not d:
            continue
        if len(d) >= 12 and d in t:
            return True
        if len(d) < 12 and re.search(rf"(?:^|\W){re.escape(d)}(?:\W|$)", t) and len(d.split()) > 1:
            return True
    return any(w in t for w in ("rubric", "rubrik", "kriteria penilaian"))


async def write_feedback(state, config):
    q = state["q_question"]
    status = state.get("q_status")
    if status == "unanswered":
        return {"q_feedback": {"summary": "Tidak ada jawaban.", "points": []}}
    if status == "unmapped":
        return {"q_feedback": {"summary": "Jawaban sedang ditinjau dosen.", "points": []}}
    if status == "irrelevant":
        return {"q_feedback": {"summary": "Jawaban tidak menjawab pertanyaan.", "points": []}}

    points, leaked = [], False
    for i, c in enumerate(state.get("q_final", []), start=1):
        fb = (c.get("feedback") or "").strip()
        if not fb or _leaks(fb, q["criteria"]):
            leaked = leaked or bool(fb)
            fb = ("Bagian ini sudah tepat." if c["points"] >= c["max_points"] - 1e-9
                  else "Bagian ini sebagian tepat." if c["points"] > 0
                  else "Bagian ini belum tepat.")
        points.append({"no": i, "points": c["points"], "max_points": c["max_points"],
                       "feedback": fb,
                       "block_ids": c.get("evidence_block_ids", [])})
    got = sum(p["points"] for p in points)
    total = sum(p["max_points"] for p in points)
    notes = ["feedback LLM bocor rubric -> diganti template"] if leaked else []
    return {"q_feedback": {"summary": f"Skor {r2(got)} dari {r2(total)}.", "points": points},
            "q_notes": notes}



async def finalize(state, config):
    q = state["q_question"]
    final = state.get("q_final", [])
    grade = r2(sum(c["points"] for c in final))
    confidence = state.get("q_confidence", 0.0)
    needs_review = bool(state.get("q_needs_review")) or confidence < S.CONFIDENCE_REVIEW
    criteria_result = [{"criterion_id": c["criterion_id"], "points": c["points"],
                        "max_points": c["max_points"], "evidence_block_ids": c.get("evidence_block_ids", []),
                        "reasoning": c.get("reasoning", "")} for c in final]
    result = {
        "question_id": q["id"],
        "answer_status": state.get("q_status", "answered"),
        "answer_text": state.get("q_answer_text", ""),
        "grade": min(grade, q["max_points"]),
        "criteria_result": criteria_result,
        "grading_internal": {
            "precheck": state.get("q_precheck"),
            "traits_used": state.get("q_traits", []),
            "samples": [[{"criterion_id": x["criterion_id"], "points": x["points"]} for x in s["criteria"]]
                        for s in state.get("q_samples", [])],
            "verify": state.get("q_verify"),
            "calculations": state.get("q_calcs", []),
            "notes": state.get("q_notes", []),
        },
        "student_feedback": state.get("q_feedback", {}),
        "bbox": state.get("q_bbox", []),
        "confidence": confidence,
        "needs_review": needs_review,
        "ocr_issue": state.get("q_ocr_issue"),
        "error": state.get("q_error"),
    }
    return {"results": [result]}
