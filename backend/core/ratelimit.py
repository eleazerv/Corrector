import time 
from fastapi import Depends , Request 

from core.deps import CurrentUser , get_current_user , get_redis 
from core.errors import AppError , forbidden

def rate_limit (group: str , limit: int , window_sec: int = 60) : 
   # rate limit biasa ( harus udah login ) apply ke router yg perlu login 
     async def dependency(
         request : Request , user : CurrentUser = Depends(get_current_user) , redis = Depends(get_redis)
     ): 
         key =f"rl:{group}:{user.user_id}"
         now = time.time()
         pipe = redis.pipeline()
         pipe.zremrangebyscore(key, 0, now - window_sec)  
         pipe.zadd(key, {str(now): now})                   
         pipe.zcard(key)                                  
         pipe.expire(key, window_sec)
         _, _, count, _ = await pipe.execute()

         if count > limit:
            raise AppError("RATE_LIMITED", f"Maks {limit} request per {window_sec} detik", 429)

     return dependency
 

def rate_limit_ip (group: str, limit:str , window_sec:int = 60): 
    # apply ke rate_limit per IP 
    async def dependency(
        request : Request , redis = Depends(get_redis)
    ): 
        key = f"rl:{group}:{request.client.host}"
        now = time.time()
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - window_sec)  
        pipe.zadd(key, {str(now): now})                   
        pipe.zcard(key)                                  
        pipe.expire(key, window_sec)
        _, _, count, _ = await pipe.execute()

        if count > limit:
            raise AppError("RATE_LIMITED", f"Maks {limit} request per {window_sec} detik", 429)

    return dependency


























 