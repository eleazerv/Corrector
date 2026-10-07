"""Penyaring data untuk MAHASISWA (daftar putih).

Aturan produk: mahasiswa melihat nilai, jawabannya sendiri, dan alasan per bagian, tapi
RUBRIK DOSEN TIDAK BOLEH BOCOR. Jadi di sini yang ditulis adalah apa yang BOLEH keluar;
field baru di test_answers otomatis tidak ikut terkirim sampai ditambahkan ke sini.

Yang tidak pernah keluar: criteria_result, grading_internal, deskripsi kriteria, key_answer,
confidence, needs_review, alasan override dosen, ai_summary / ai_recommendation keberatan.
"""
from modules.shared import num

BBOX_KEYS = ("page_no", "bbox", "kind", "block_id")
POINT_KEYS = ("no", "points", "max_points", "feedback", "block_ids")


def safe_bbox(bbox) -> list[dict]:
    """Kotak bukti di foto. criterion_id dibuang (id rubrik tidak perlu sampai ke mahasiswa)."""
    return [{k: b[k] for k in BBOX_KEYS if k in b} for b in (bbox or []) if isinstance(b, dict)]


def safe_feedback(feedback, adjusted: bool) -> dict:
    """student_feedback = {"summary": str, "points": [{no, points, max_points, feedback, block_ids}]}.

    adjusted=True  -> nilai soal ini sudah diubah dosen, jadi rincian poin per bagian dari AI
                      tidak lagi cocok dengan nilainya. Rinciannya dikosongkan.
    """
    if adjusted:
        return {"summary": "Nilai soal ini sudah disesuaikan oleh dosen.", "points": []}
    fb = feedback if isinstance(feedback, dict) else {}
    points = [{k: p[k] for k in POINT_KEYS if k in p} for p in (fb.get("points") or []) if isinstance(p, dict)]
    return {"summary": str(fb.get("summary") or ""), "points": points}


def answer_out(row, adjusted: bool) -> dict:
    """1 soal untuk mahasiswa. `row` = baris QUESTIONS_SQL di service.py."""
    return {
        "test_answer_id": row["answer_id"],            # dipakai saat mengajukan keberatan per soal
        "number": row["number"],
        "question_text": row["question_text"],
        "max_points": num(row["max_points"]),
        "answer_status": row["answer_status"],
        "answer_text": row["answer_text"],
        "grade": num(row["grade"]),
        "adjusted_by_teacher": adjusted,
        "bbox": safe_bbox(row["bbox"]),
        "student_feedback": safe_feedback(row["student_feedback"], adjusted),
    }
