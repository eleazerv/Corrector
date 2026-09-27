from dataclasses import dataclass , field 
from typing import Protocol 


class OcrError(Exception):
    """Base class for OCR errors."""
    
class PermanentOcrError(OcrError):
    """Error yang tidak akan sembuh walau di-retry (gambar rusak, format salah)."""

class TransientOcrError(OcrError): 
    """Error sementara (timeout, jaringan, GPU penuh). Boleh di-retry."""
    
    
@dataclass
class OcrBlock: 
    text: str 
    label: str 
    bbox: list[int] = field(default_factory=list)
    html: str = ""
    
class OcrProvider(Protocol): 
    name : str 
    async def start(self) -> None : 
        """ dipanggil sekali di startup worker ( load model )"""
        ...
    async def extract(self, image_bytes:bytes) -> list [OcrBlock]: 
        """extract text from image"""
        ...
    async def close(self) -> None : 
        """ dipanggil setelah shutdown workernya """
        ...