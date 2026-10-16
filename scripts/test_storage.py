"""
Test cepat storage. Jalankan dari root project:
    python -m scripts.test_storage path/ke/foto.jpg
"""

import asyncio
import sys
from pathlib import Path 
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from supabase import acreate_client

from core.config import settings
from providers.storage import StorageNotFound, get_storage_provider


async def main(path: str):
    sb = await acreate_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    storage = get_storage_provider(sb)
    key = "_test/foto.jpg"

    data = open(path, "rb").read()
    await storage.upload(key, data, "image/jpeg")
    print("upload ok")

    await storage.upload(key, data, "image/jpeg")
    print("upload ulang (upsert) ok")

    got = await storage.download(key)
    print("download ok, sama:", got == data)

    print("signed url:", await storage.signed_url(key, 60))
    print("presign upload:", await storage.presign_upload("_test/upload.jpg"))

    await storage.delete([key])
    for _ in range(5):
        try:
            await storage.download(key)
            await asyncio.sleep(2)      
        except StorageNotFound:
            print("delete ok")
            break
    else:
        print("SALAH: file masih ada setelah 10 detik")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))