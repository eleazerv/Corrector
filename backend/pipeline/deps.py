from dataclasses import dataclass, field 
from typing import Any, Awaitable , Callable 
import asyncio 

@dataclass 
class GradingDeps: 
    """Dependency non-serializable untuk node. Dikirim lewat
    config["configurable"]["deps"], jadi TIDAK ikut disimpan checkpointer."""
    pool : Any 
    llm : Any 
    embedder : Any | None = None 
    semaphore: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(5))
    publish : Callable [[dict],Awaitable[None]] | None = None 
    dry_run : bool = False 
    
    async def emit(self,payload:dict) -> None : 
        if self.publish is  None : 
            return 
        try : 
            await self.publish(payload)
        except Exception : 
            pass
        
def get_deps(config)-> GradingDeps: 
    return config["configurable"]["deps"]
