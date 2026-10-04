"""Angka-angka tuning pipeline. Ubah di sini, bukan di node."""

# grade_samples
SAMPLES_DEFAULT = 2                   # essay
SAMPLES_CALCULATION = 3               # hitungan: lebih rawan beda
SAMPLE_TEMPERATURES = [0.0, 0.4, 0.7]
MAX_VALIDATE_RETRIES = 2              # output tidak valid -> minta ulang maks 2x
LONG_ANSWER_CHARS = 4000              # di atas ini + >1 kriteria -> nilai per kriteria

# score_confidence / verify
CONFIDENCE_VERIFY = 0.80              # di bawah ini -> debate
CONFIDENCE_REVIEW = 0.60              # tetap di bawah ini setelah verify -> needs_review

# retrieve_traits: semua trait aktif dosen + matkul masuk prompt, dibatasi
MAX_TRAITS = 2
TRAIT_FETCH_LIMIT = 200               # batas aman jumlah trait yang dibaca dari DB
TRAIT_FILTER_MAX_TOKENS = 600         # output penyaring kecil (daftar id)

# check_calculations (soal calculation saja). LLM menulis ekspresi, calculator.py menghitung.
CALC_CHECK_ENABLED = True             # False -> node dilewati (untuk banding di eval_grading)
CALC_MAX_ITEMS = 30                   # maksimal item per soal
CALC_PLAN_MAX_TOKENS = 1500           # output rencana (JSON) kecil
CALC_SYMBOLIC_ENABLED = True          # turunan/integral/limit/aljabar pakai SymPy
SYMPY_TIMEOUT_SEC = 3.0               # per item; lewat -> diulang mode cepat, lalu dibuang
SYMPY_BUDGET_SEC = 20.0               # total per soal

# tanda curiga -> needs_review walau sampel sepakat
SUSPICIOUS_ZERO_MIN_CHARS = 80        # essay panjang tapi semua kriteria 0

# precheck
MIN_ANSWER_CHARS = 3
MIN_COPIED_WORDS = 8                  # >= 8 kata berurutan sama dengan soal = dianggap salinan soal
GARBAGE_RATIO = 0.60                  # porsi karakter aneh -> kemungkinan OCR rusak

# segment_answers
IGNORED_LABELS = {"pageheader", "page-header", "pagefooter", "page-footer"}
SEGMENT_TEXT_PREVIEW = 160            # karakter per blok yang dikirim ke LLM

# budget_guard
REQUIRE_ACTIVE_PLAN = False           # True -> sekolah tanpa paket aktif tidak bisa grading

# grade_question: LLM error sementara (503/429) di 1 soal -> coba lagi di dalam node dulu,
# supaya soal lain sempat selesai & tersimpan di checkpoint sebelum job di-retry
QUESTION_TRANSIENT_RETRIES = 2
QUESTION_RETRY_DELAY = 15.0           # detik, dikali nomor percobaan

MAX_TEXT_CHARS = 6000                 # potong teks panjang sebelum masuk prompt
