from supabase import AsyncClient 
from core.logging import log 
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
        
        return _pick(res,"signedURL","signedUrl","signed_url")
    
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