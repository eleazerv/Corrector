"""
OCR lewat Datalab API (https://www.datalab.to).

Alur Datalab (async):
  1. POST /convert           → kirim gambar, dapat request_id + request_check_url
  2. GET  /convert/{id}      → polling sampai status == "complete"
  3. ambil hasil `json`      → pohon blok (Page → blok-blok layout)

Hasil diubah ke list[OcrBlock] dengan bbox skala 0-1000,
jadi sama persis bentuknya dengan provider local.
"""

import asyncio 
import re
import time 
from html import unescape 

import httpx 
from core.logging  import log 

from .base import OcrBlock , PermanentOcrError, TransientOcrError 
from .image import load_image , to_jpeg_bytes 

_CONTAINER_TYPES = {"Document","Page"}

_TAG_RE = re.compile(r"<[^>]+>")
_BLOCK_END_RE = re.compile(r"</(p|li|tr|h[1-6]|div)>|<(li|ol|ul)[^>]*>|<br\s*/?>", re.IGNORECASE) 
 
def _html_to_text(html: str) -> str:
    text = _BLOCK_END_RE.sub("\n", html or "")
    text = _TAG_RE.sub("", text)
    text = unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n", text).strip()


def _to_1000 (bbox, page_w: float, page_h: float) -> list[int] : 
    """ pixel halaman 0-1000"""
    if not bbox or len(bbox) < 4 or page_w <= 0 or page_h <= 0 : 
        return []
    x0, y0, x1, y1 = bbox[:4]
    clamp = lambda v: max(0, min(1000, int(round(v))))  
    return [clamp(x0 * 1000 / page_w), clamp(y0 * 1000 / page_h),
            clamp(x1 * 1000 / page_w), clamp(y1 * 1000 / page_h)]
    


def parse_datalab_json(data: dict, image_w: int, image_h: int) -> list[OcrBlock]:
    """
    Pohon JSON Datalab → list[OcrBlock].
    Ambil blok isi teratas di tiap Page (setara satu blok layout Chandra).
    Ukuran halaman diambil dari bbox Page; kalau tidak ada, pakai ukuran gambar yang dikirim.
    """
    blocks: list[OcrBlock] = []
 
    def walk(node: dict, page_w: float, page_h: float):
        btype = node.get("block_type") or ""
        if btype in _CONTAINER_TYPES or not btype:
            if btype == "Page" and node.get("bbox") and len(node["bbox"]) >= 4:
                px0, py0, px1, py1 = node["bbox"][:4]
                page_w, page_h = (px1 - px0) or page_w, (py1 - py0) or page_h
            for child in node.get("children") or []:
                walk(child, page_w, page_h)
            return
 
        html = node.get("html") or ""
        text = _html_to_text(html)
        if text:
            blocks.append(OcrBlock(
                text=text,
                label=btype or "Text",
                bbox=_to_1000(node.get("bbox"), page_w, page_h),
                html=html,
            ))
 
    root = data.get("json") if isinstance(data.get("json"), dict) else data
    walk(root, float(image_w), float(image_h))
    return blocks




class DatalabOcr:
    name = "datalab"
 
    def __init__(
        self,
        base_url: str,
        api_key: str,
        mode: str = "accurate",          # fast | balanced | accurate
        timeout: float = 150.0,          # total waktu tunggu (submit + polling)
        poll_interval: float = 2.0,
        max_image_side: int = 1600,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.mode = mode
        self.timeout = timeout
        self.poll_interval = poll_interval
        self.max_image_side = max_image_side
        self._client: httpx.AsyncClient | None = None
    
    async def start(self) -> None: 
        if not self.api_key: 
            raise RuntimeError("OCR_PRIVER=api tapi OCR_API_KEY kosong")
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"X-API-Key": self.api_key},
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        log.info("OCR datalab ready base_url=%s mode=%s", self.base_url, self.mode)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            
    async def extract(self, image_bytes: bytes) -> list[OcrBlock]: 
        if self._client is None : 
            raise TransientOcrError("model belum di-load panggil start()")
        
        img = load_image(image_bytes, self.max_image_side)
        jpeg = to_jpeg_bytes(img)
        deadline = time.monotonic() + self.timeout
        
        check_url = await self._submit(jpeg)
        result = await self._poll(check_url, deadline)
       
        return parse_datalab_json(result, img.width, img.height)
        
    async def _submit(self, jpeg: bytes) -> str:
        res = await self._request(
            "POST",
            "/convert",
            files={"file": ("image.jpg", jpeg, "image/jpeg")},
            data={"output_format": "json", "mode": self.mode},  
        )
        body = res.json()
        if not body.get("success", True) or not body.get("request_check_url"):   # [FIX] url huruf kecil
            raise PermanentOcrError(f"datalab menolak request: {body.get('error') or body}")
        return body["request_check_url"]
    
    async def _poll(self, check_Url: str, deadline:float) -> dict: 
        while True: 
            if time.monotonic() > deadline : 
                raise TransientOcrError(f"datalab belum selesai setelah {self.timeout:.0f}s")
            
            await asyncio.sleep(self.poll_interval)
            body = (await self._request("GET", check_Url)).json()
            
            if body.get("status") == "complete":
                if not body.get("success",True): 
                    raise PermanentOcrError(f"datalab gagal memproses: {body.get('error')}")

                return body 
    
    async def _request (self, method: str , url: str , **kwargs): 
        try : 
            res = await self._client.request(method, url, **kwargs)
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            raise TransientOcrError(f"datalab timeout: {e}") from e
        
        if res.status_code == 429 or res.status_code >= 500:
            raise TransientOcrError(f"datalab {res.status_code}: {res.text[:300]}")
        if res.status_code >= 400: 
            raise PermanentOcrError(f"datalab error: {res.status_code} {res.text}")
        return res
    
    