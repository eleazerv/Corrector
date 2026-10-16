from supabase import AsyncClient 
from core.logging import log 
from core.config import settings 
from .base import StorageError , StorageNotFound 


def _pick(data: dict, *keys:str): 
    """ambil nilai dari key pertama 
    ( ngecek apakah )
    """
    for k in keys: 
        if isinstance(data,dict) and data.get(k): 
            return data[k]
    raise StorageError(f"Response storage tidak dikenali : {data!r}")

def _is_not_found(e:Exception)-> bool : 
    text = str(e).lower()
    return "not found" in text or "404" in text or "does not exist" in text 

def _public(url: str) -> str:
    """ ganti host internal (mis. http://host.docker.internal:54321)
    dengan SUPABASE_PUBLIC_URL supaya link foto bisa dibuka browser. Path + token tidak diubah.
    Juga menangani signed URL relatif ("/object/sign/...") dari versi supabase-py tertentu."""
    public = (settings.SUPABASE_PUBLIC_URL or "").rstrip("/")
    if not public or not url:
        return url
    internal = settings.SUPABASE_URL.rstrip("/")
    if url.startswith(internal):
        return public + url[len(internal):]
    if url.startswith("/"):
        return f"{public}/storage/v1{url}" if not url.startswith("/storage/") else public + url
    return url


class SupabaseStorage: 
    def __init__(self, sb:AsyncClient,bucket:str): 
        self._bucket_name = bucket 
        self._bucket = sb.storage.from_(bucket)
        
    async def upload(self,key:str,data:bytes,content_type:str)->None : 
        try : 
            await self._bucket.upload(
                key,
                data,
                file_options={
                    "content-type":content_type,
                    "upsert": "true",
                },
            )
        except Exception as e : 
            raise StorageError(f"failed to upload key={key}:{e}" ) from e
    
    
    async def download(self,key:str) -> bytes: 
        try: 
            return await self._bucket.download(key)
        except Exception as e : 
            if _is_not_found(e): 
                raise StorageNotFound(f"file {key} not found") from e
            raise StorageError(f"failed to download key={key}:{e}") from e
        
        
    async def signed_url(self,key:str,expires_in: int = 3600)-> str: 
        try: 
            res = await self._bucket.create_signed_url(key,expires_in)        
        except Exception as e: 
            if _is_not_found(e): 
                raise StorageNotFound(f"file {key} not found") from e
            raise StorageError(f" signed_url failed url key={key}:{e}") from e
        
        return _public(_pick(res,"signedURL","signedUrl","signed_url"))  
    
    async def presign_upload(self,key:str)-> dict : 
        try : 
            res = await self._bucket.create_signed_upload_url(key)
        except Exception as e : 
            raise StorageError(f"presign_upload failed url key={key}:{e}") from e
        return { 
                "url": _pick(res,"signedURL","signedUrl","signed_url"),
                "token": _pick(res,"token"),
                "key": key
                }
        
    async def delete (self, keys: list[str])-> None : 
        if not keys: 
            return 
        try: 
            await self._bucket.remove(keys)
        except Exception as e : 
            raise StorageError(f"failed to delete keys={keys[:5]}...:{e}") from e
        log.info("storage delete bucket=%s keys=%s",self._bucket_name,keys) 