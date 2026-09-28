from typing import Protocol


class StorageError(Exception):
    """Error apa pun dari storage (upload/download gagal, file tidak ada, dll)."""


class StorageNotFound(StorageError):
    """File dengan key tersebut tidak ada di bucket."""


class StorageProvider(Protocol):
    """Kontrak yang wajib dipenuhi semua provider storage (Supabase, R2, dll)."""

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        """Simpan file. Kalau key sudah ada, file lama bakal ditimpa."""
        ...

    async def download(self, key: str) -> bytes:
        """Ambil isi file. Raise StorageNotFound kalau tidak ada."""
        ...

    async def signed_url(self, key: str, expires_in: int = 3600) -> str:
        """URL sementara untuk MELIHAT file (bucket private)."""
        ...

    async def presign_upload(self, key: str) -> dict:
        """URL sementara untuk frontend UPLOAD langsung ke bucket.
        Return: {"url": str, "token": str, "key": str}
        """
        ...

    async def delete(self, keys: list[str]) -> None:
        """Hapus beberapa file sekaligus. Key yang tidak ada diabaikan."""
        ...