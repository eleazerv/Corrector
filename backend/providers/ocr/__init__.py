from core.config import settings

from .base import OcrBlock, OcrError, OcrProvider, PermanentOcrError, TransientOcrError

__all__ = [
    "OcrBlock", "OcrError", "OcrProvider", "PermanentOcrError", "TransientOcrError",
    "get_ocr_provider",
]


def get_ocr_provider() -> OcrProvider:
    """
    Pilih provider dari OCR_PROVIDER di .env: local | api | fake.
    Import dilakukan DI DALAM cabang, supaya mode api/fake tidak memuat torch.
    """
    provider = settings.OCR_PROVIDER.lower()

    if provider == "api":
        from .api_ocr import DatalabOcr
        return DatalabOcr(
            base_url=settings.OCR_API_URL,
            api_key=settings.OCR_API_KEY,
            mode=settings.OCR_API_MODE,
            timeout=settings.OCR_API_TIMEOUT,
            max_image_side=settings.OCR_MAX_IMAGE_SIDE,
        )

    if provider == "fake":
        from .fake import FakeOcr
        return FakeOcr()

    raise RuntimeError(f"OCR_PROVIDER tidak dikenal: {settings.OCR_PROVIDER!r} (pilih local | api | fake)")