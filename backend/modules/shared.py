"""Hal kecil yang dipakai lebih dari satu modul."""
from decimal import Decimal

# status student_tests
SHEET_IN_PROGRESS = ("ocr_queued", "ocr_processing", "grading")     # masih dikerjakan worker
SHEET_GRADED = ("graded", "reviewed", "published")                  # sudah punya nilai
SHEET_REPLACEABLE = ("absent", "needs_reupload", "failed")          # boleh ditimpa upload baru

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024        # sama dengan batas bucket joints-uploads
MAX_PAGES_PER_STUDENT = 30
SIGNED_URL_TTL = 600                      # detik; URL foto untuk frontend


def num(x) -> float | None:
    """numeric Postgres (Decimal) -> float untuk JSON. None tetap None."""
    if x is None:
        return None
    return float(x) if isinstance(x, Decimal) else x


def page_key(school_id, class_test_id, student_id, page_no: int, ext: str) -> str:
    """Path file di bucket. Pola sama dengan tasks/ingest_zip.py."""
    return f"{school_id}/{class_test_id}/{student_id}-{page_no:03d}{ext}"
