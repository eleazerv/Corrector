"""
Test OCR provider saja — tanpa DB, Redis, worker, atau job.

Pakai (dari root project, venv OCR aktif):
    python -m scripts.test_ocr                        # default: samples/jawaban1.jpg
    python -m scripts.test_ocr jawaban2.jpg           # nama saja → dicari di samples/
    python -m scripts.test_ocr foto.jpg
    python -m scripts.test_ocr foto.jpg --provider fake
    python -m scripts.test_ocr folder_foto/            # semua gambar di folder
    python -m scripts.test_ocr foto.jpg --no-draw      # tanpa gambar bbox

Output:
    - daftar blok (label, bbox, teks) di terminal
    - waktu OCR per gambar
    - samples/output/<nama>_bbox.jpg : gambar dengan kotak bbox
    - samples/output/<nama>.json     : semua blok lengkap (text, label, bbox, html)
"""
import argparse
import asyncio
import json
import os
from dataclasses import asdict
import time
from pathlib import Path

IMAGE_EXT = {".jpg", ".jpeg", ".png"}
ROOT = Path(__file__).resolve().parent.parent      # root project (folder di atas scripts/)
SAMPLES_DIR = ROOT / "samples"
OUTPUT_DIR = SAMPLES_DIR / "output"
DEFAULT_IMAGE = "../samples/foto_jawaban2.png"


def _resolve(target: str) -> Path:
    """Cari file: path apa adanya dulu, kalau tidak ada coba di samples/."""
    p = Path(target)
    if p.exists():
        return p
    candidate = SAMPLES_DIR / target
    if candidate.exists():
        return candidate
    raise SystemExit(f"file tidak ditemukan: {target} (juga dicari di {SAMPLES_DIR})")


def _collect(path: Path) -> list[Path]:
    if path.is_dir():
        return sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT)
    return [path]


def _draw_bbox(image_path: Path, blocks) -> Path:
    from PIL import Image, ImageDraw, ImageOps

    img = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img)
    for i, b in enumerate(blocks):
        if len(b.bbox) != 4:
            continue
        x0, y0, x1, y1 = b.bbox
        # bbox Chandra skala 0-1000 → pixel
        box = (x0 * w / 1000, y0 * h / 1000, x1 * w / 1000, y1 * h / 1000)
        draw.rectangle(box, outline="red", width=3)
        draw.text((box[0] + 4, box[1] + 4), f"{i}:{b.label}", fill="red")

    out = OUTPUT_DIR / f"{image_path.stem}_bbox.jpg"
    img.save(out, quality=90)
    return out


async def main(target: str, provider_name: str | None, draw: bool):
    # OCR_PROVIDER harus di-set SEBELUM config di-import
    if provider_name:
        os.environ["OCR_PROVIDER"] = provider_name


    from backend.providers.ocr import get_ocr_provider 
    files = _collect(_resolve(target))
    if not files:
        print("tidak ada gambar ditemukan")
        return

    ocr = get_ocr_provider()
    print(f"provider = {ocr.name}")

    t0 = time.perf_counter()
    await ocr.start()                      # local: load model (lama, cuma sekali)
    print(f"start    = {time.perf_counter() - t0:.1f}s\n")

    try:
        for path in files:
            print("=" * 70)
            print(path.name)
            print("=" * 70)

            t = time.perf_counter()
            try:
                blocks = await ocr.extract(path.read_bytes())
            except Exception as e:
                print(f"ERROR {type(e).__name__}: {e}\n")
                continue
            dt = time.perf_counter() - t

            for i, b in enumerate(blocks):
                preview = b.text.replace("\n", " / ")
                if len(preview) > 120:
                    preview = preview[:120] + "..."
                print(f"[{i:02d}] {b.label:<16} {b.bbox}  {preview}")

            total_chars = sum(len(b.text) for b in blocks)
            print(f"\n{len(blocks)} blok, {total_chars} karakter, {dt:.1f}s")

            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            json_path = OUTPUT_DIR / f"{path.stem}.json"
            json_path.write_text(json.dumps({
                "image": path.name,
                "provider": ocr.name,
                "seconds": round(dt, 2),
                "blocks": [asdict(b) for b in blocks],
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"json -> {json_path}")

            if draw and blocks:
                 print(f"bbox -> {_draw_bbox(path, blocks)}")
            print()
    finally:
        await ocr.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?", default=DEFAULT_IMAGE,
                    help=f"file/folder gambar (default: samples/{DEFAULT_IMAGE})")
    ap.add_argument("--provider", choices=["local", "api", "fake"], help="timpa OCR_PROVIDER di .env")
    ap.add_argument("--no-draw", action="store_true", help="jangan buat gambar bbox")
    args = ap.parse_args()
    asyncio.run(main(args.target, args.provider, not args.no_draw))