"""Validasi upload: baca ZIP (termasuk pengaman zip bomb) dan deteksi tipe gambar dari isi file."""
import io
import zipfile

import pytest

from core.errors import AppError
from modules.submission import service

JPEG = b"\xff\xd8\xff" + b"0" * 20
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 20
WEBP = b"RIFF0000WEBP" + b"0" * 20


def make_zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_read_zip_groups_pages_by_nim():
    pages, unmatched = service.read_zip(make_zip({
        "2501234567_1.jpg": JPEG,
        "kelasA/2501234567-p2.png": PNG,        # di dalam folder + pola "-p2"
        "2507654321_page03.jpeg": JPEG,
        "catatan.txt": b"x",                    # bukan gambar
        "foto_tanpa_nim.jpg": JPEG,             # nama tidak cocok
        "__MACOSX/2501234567_1.jpg": JPEG,      # sampah macOS -> dilewati diam-diam
        ".hidden.jpg": JPEG,
    }))
    assert set(pages) == {"2501234567", "2507654321"}
    assert sorted(pages["2501234567"]) == [1, 2]
    assert sorted(pages["2507654321"]) == [3]
    assert sorted(unmatched) == ["catatan.txt", "foto_tanpa_nim.jpg"]


def test_read_zip_duplicate_page_keeps_first():
    pages, unmatched = service.read_zip(make_zip({"2501234567_1.jpg": b"A", "x/2501234567_1.png": b"B"}))
    assert pages["2501234567"][1] == b"A"
    assert unmatched == ["x/2501234567_1.png"]


def test_read_zip_rejects_invalid_file():
    with pytest.raises(AppError) as e:
        service.read_zip(b"ini bukan zip")
    assert e.value.status == 422


def test_read_zip_limits(monkeypatch):
    monkeypatch.setattr(service, "MAX_ZIP_ENTRIES", 2)
    with pytest.raises(AppError) as e:
        service.read_zip(make_zip({f"250123456{i}_1.jpg": JPEG for i in range(3)}))
    assert e.value.status == 422

    monkeypatch.setattr(service, "MAX_ZIP_ENTRIES", 2000)
    monkeypatch.setattr(service, "MAX_IMAGE_BYTES", 10)                 # 1 file terlalu besar
    with pytest.raises(AppError) as e:
        service.read_zip(make_zip({"2501234567_1.jpg": JPEG}))
    assert e.value.status == 413

    monkeypatch.setattr(service, "MAX_IMAGE_BYTES", 10 * 1024 * 1024)
    monkeypatch.setattr(service, "MAX_ZIP_TOTAL_BYTES", 30)             # total setelah ekstrak (zip bomb)
    with pytest.raises(AppError) as e:
        service.read_zip(make_zip({"2501234567_1.jpg": JPEG, "2501234567_2.jpg": JPEG}))
    assert e.value.status == 413


def test_sniff_image_uses_content_not_name():
    assert service.sniff_image(JPEG) == "image/jpeg"
    assert service.sniff_image(PNG) == "image/png"
    assert service.sniff_image(WEBP) == "image/webp"
    assert service.sniff_image(b"<html>bukan gambar</html>") is None


def test_check_image():
    assert service.check_image(PNG, "a.png") == (PNG, "image/png")
    for data, status in ((b"", 422), (b"MZ exe menyamar", 415)):
        with pytest.raises(AppError) as e:
            service.check_image(data, "foto.jpg")
        assert e.value.status == status
