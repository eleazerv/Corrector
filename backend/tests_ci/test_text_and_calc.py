"""Fungsi murni: pembersih teks, kalkulator aman, parser JSON dari LLM, helper kecil."""
from decimal import Decimal

import pytest

from modules.shared import num, page_key
from pipeline import calculator, text_utils
from providers.embedding.base import to_pgvector
from providers.llm.json_utils import parse_json_object


# ---------------------------------------------------------------- text_utils
@pytest.mark.parametrize("text, expected", [
    ("1. Jawaban", 1), ("No 3: x = 2", 3), ("Soal 12", 12), ("nomor 4. abc", 4),
    ("2) hasil", 2), ("jawaban 5: ...", 5),
    ("3.14 adalah pi", None),          # desimal bukan nomor soal
    ("Diketahui v = 2", None), ("", None), (None, None),
])
def test_question_number(text, expected):
    assert text_utils.question_number(text) == expected


def test_strip_marker():
    assert text_utils.strip_marker("2. x = 5") == "x = 5"
    assert text_utils.strip_marker("3) hasil") == "hasil"
    assert text_utils.strip_marker("tanpa nomor") == "tanpa nomor"
    assert text_utils.strip_marker(None) == ""


@pytest.mark.xfail(strict=True, reason="BUG: 'No 3: jawab' menyisakan ': jawab' (QUESTION_WORD_RE cocok duluan "
                                       "dan berhenti sebelum titik dua). Hapus xfail ini setelah diperbaiki.")
def test_strip_marker_with_word_prefix():
    assert text_utils.strip_marker("No 3: jawab") == "jawab"


def test_normalize_and_compact():
    assert text_utils.normalize("  Halo   DUNIA \n") == "halo dunia"
    assert text_utils.compact("X = 1,5 m/s") == "x15ms"
    assert text_utils.compact_answer("x = -1,5 m/s") == "x-1.5m/s"      # koma desimal dijaga jadi titik


def test_remove_copied_question():
    question = "Sebuah benda bermassa dua kilogram bergerak dengan kecepatan tetap sepuluh meter per detik"
    answer = question + " maka energi kinetiknya 100 J"
    assert text_utils.remove_copied_question(answer, question) == "maka energi kinetiknya 100 J"
    short = "energi kinetiknya 100 J"
    assert text_utils.remove_copied_question(short, question) == short   # tidak ada salinan -> utuh


def test_garbage_ratio_and_truncate():
    assert text_utils.garbage_ratio("x = 2 + 3") == 0.0
    assert text_utils.garbage_ratio("") == 0.0
    assert text_utils.garbage_ratio("@@@@") == 1.0
    assert text_utils.truncate("abcdef", 3) == "abc …"
    assert text_utils.truncate("abc", 3) == "abc"


# ---------------------------------------------------------------- kalkulator angka
@pytest.mark.parametrize("expr, expected", [
    ("150/12", 12.5), ("2 × 9,8", 19.6), ("2^3", 8.0), ("√16", 4.0),
    ("sin(30)", 0.5),                 # derajat, bukan radian
    ("-3 + 5", 2.0), ("log(100)", 2.0),
])
def test_evaluate(expr, expected):
    assert calculator.evaluate(expr) == pytest.approx(expected)


@pytest.mark.parametrize("expr", [
    "__import__('os').system('ls')",  # kode berbahaya
    "open('x')", "x + 1", "abc", "", "1/0",
    "9**9**9",                        # pangkat raksasa (bisa membuat server hang)
    "1+" * 150 + "1",                 # terlalu panjang
])
def test_evaluate_rejects_unsafe_or_invalid(expr):
    assert calculator.evaluate(expr) is None


def test_is_close_and_normalize_kind():
    assert calculator.is_close(0.33, 1 / 3)
    assert not calculator.is_close(1.0, 1.1)
    assert calculator.normalize_kind("Definite Integral") == "integral_tentu"
    assert calculator.normalize_kind("derivative") == "turunan"
    assert calculator.normalize_kind(None) == "angka"
    assert calculator.normalize_kind("ngawur") is None


# ---------------------------------------------------------------- parser JSON LLM
@pytest.mark.parametrize("text, expected", [
    ('{"a": 1}', {"a": 1}),
    ('```json\n{"a": 1}\n```', {"a": 1}),
    ('Berikut hasilnya: {"a": 1} semoga membantu', {"a": 1}),
    ("[1, 2]", None), ("bukan json", None), ("", None), (None, None), ('{"a": ', None),
])
def test_parse_json_object(text, expected):
    assert parse_json_object(text) == expected


# ---------------------------------------------------------------- helper kecil
def test_num_page_key_pgvector():
    assert num(None) is None
    assert num(Decimal("12.50")) == 12.5 and isinstance(num(Decimal("1")), float)
    assert num(7) == 7
    assert page_key("s", "ct", "st", 3, ".jpg") == "s/ct/st-003.jpg"
    assert to_pgvector([0.5, 1, -2.25]) == "[0.5,1,-2.25]"
