from supabase import AsyncClient

from core.config import settings

from .base import StorageError, StorageNotFound, StorageProvider
from .supabase_storage import SupabaseStorage

__all__ = ["StorageProvider", "StorageError", "StorageNotFound", "get_storage_provider"]


def get_storage_provider(sb: AsyncClient) -> StorageProvider:
    # Nanti kalau ada STORAGE_PROVIDER=r2, tambahkan cabang di sini.
    return SupabaseStorage(sb, bucket=settings.SUPABASE_BUCKET)