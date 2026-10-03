import difflib 
import re 
import unicodedata 

_WS = re.compile(r"\s+")

QUESTION_MARK_RE = re.compile(
    r"^\s*(?:no(?:mor)?\.?|soal|jawaban|jwb\.?)?\s*(\d{1,2})\s*(?:[a-z])?\s*[\.\)\:\-]",
    re.IGNORECASE,
)


QUESTION_WORD_RE = re.compile(r"^\s*(?:no(?:mor)?\.?|soal)\s*(\d{1,2})\b", re.IGNORECASE)



def normalize(text: str) -> str:
    t = unicodedata.normalize("NFKC", text or "").lower()
    return _WS.sub(" ", t).strip()


def compact(text: str) -> str:
    """Buang semua selain huruf/angka (untuk exact match)."""
    return re.sub(r"[^0-9a-z]", "", normalize(text))

def compact_answer(text: str) -> str:
    """Untuk isian: buang spasi & tanda baca ringan, tapi JAGA . , - / supaya angka tidak berubah."""
    t = normalize(text).replace(",", ".")          # 1,5 -> 1.5
    return re.sub(r"[^0-9a-z\.\-/]", "", t)        # "x = -1.5 m/s" -> "x-1.5m/s"


_WORD = re.compile(r"\S+")


def _word_key(word: str) -> str:
    """Bentuk kata untuk dibandingkan: huruf kecil, tanpa tanda baca di tepi."""
    return normalize(word).strip(".,;:!?()[]\"'")


def remove_copied_question(answer: str, question: str, min_words: int = 8) -> str:
    """Buang bagian jawaban yang menyalin soal (>= min_words kata berurutan sama persis).
    Tidak ada salinan -> kembalikan `answer` tanpa perubahan."""
    answer = answer or ""
    a_spans = [(m.start(), m.end()) for m in _WORD.finditer(answer)]
    a_words = [_word_key(answer[s:e]) for s, e in a_spans]
    q_words = [_word_key(w) for w in (question or "").split()]
    if len(a_words) < min_words or len(q_words) < min_words:
        return answer
    sm = difflib.SequenceMatcher(None, a_words, q_words, autojunk=False)
    drop = [(blk.a, blk.a + blk.size) for blk in sm.get_matching_blocks() if blk.size >= min_words]
    if not drop:
        return answer
    keep, last = [], 0
    for start, end in drop:                    # indeks KATA di jawaban
        keep.append(answer[last:a_spans[start][0]])
        last = a_spans[end - 1][1]
    keep.append(answer[last:])
    return " ".join(part.strip() for part in keep if part.strip())


def garbage_ratio(text: str) -> float:
    t = re.sub(r"\s", "", text or "")
    if not t:
        return 0.0
    ok = sum(1 for ch in t if ch.isalnum() or ch in "+-*/=^()[]{}.,:;%<>'\"_|√∑∫πθαβγλμσΔ·×÷≤≥≠≈")
    return 1 - ok / len(t)


def question_number(text: str) -> int | None:
    m = QUESTION_WORD_RE.match(text or "") or QUESTION_MARK_RE.match(text or "")
    return int(m.group(1)) if m else None


def strip_marker(text: str) -> str:
    """Buang penanda nomor soal di awal ("2. ", "No 3:") supaya tidak dihitung sebagai jawaban."""
    m = QUESTION_WORD_RE.match(text or "") or QUESTION_MARK_RE.match(text or "")
    return (text[m.end():] if m else text or "").strip()


def truncate(text: str, n: int) -> str:
    text = text or ""
    return text if len(text) <= n else text[:n] + " …"
