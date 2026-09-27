import asyncio

from .base import OcrBlock , PermanentOcrError , TransientOcrError


class FakeOcr : 
    """
    OCR palsu untuk test & development tanpa GPU.
    mode:
      "ok"        → selalu 2 blok teks
      "empty"     → tidak ada teks (uji needs_reupload)
      "slow"      → tidur `delay` detik (uji timeout)
      "transient" → selalu TransientOcrError (uji retry)
      "permanent" → selalu PermanentOcrError
    """
    
    name = "fake"
    
    def __init__(self, mode="ok", delay=0): 
        self.mode = mode 
        self.delay = delay
        self.calls = 0 
        
    async def start(self) ->None : 
            pass 
        
    async def extract(self, image_bytes: bytes) -> list[OcrBlock]:
        self.calls += 1
        if self.delay or self.mode == "slow":
            await asyncio.sleep(self.delay or 999)
        if self.mode == "transient":
            raise TransientOcrError("fake transient")
        if self.mode == "permanent":
            raise PermanentOcrError("fake permanent")
        if self.mode == "empty":
            return []
        return [
            OcrBlock(text="1. Jawaban soal nomor satu", label="Text", bbox=[50, 80, 950, 160]),
            OcrBlock(text="2. x = 5, karena 2x = 10", label="Text", bbox=[50, 200, 950, 280]),
        ]
 
    async def close(self) -> None:
        pass