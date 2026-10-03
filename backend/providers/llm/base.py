from dataclasses import dataclass , field
from typing import Protocol 

class LlmError(Exception):
    """Base error LLM."""


class TransientLlmError(LlmError):
    """Sementara: timeout, 429, 5xx, output kosong. Boleh retry."""


class PermanentLlmError(LlmError):
    """Permanen: key salah, saldo habis, request invalid, JSON rusak terus."""

@dataclass 
class LlmUsage : 
    input_tokens: int = 0 
    output_tokens: int = 0
    cached_tokens: int = 0
    
    @property 
    def total(self) -> int : 
        return self.input_tokens + self.output_tokens
    
    def __add__ (self,other:"LlmUsage") -> "LlmUsage": 
        return LlmUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cached_tokens=self.cached_tokens + other.cached_tokens
    )
        
@dataclass 
class LlmJson: 
    data: dict 
    usage : LlmUsage = field(default_factory=LlmUsage)
    model: str =""
    
class LlmProvider(Protocol): 
    name : str 
    model : str 
    
    async def start(self) -> None : ...
    
    async def complete_json(
        self, message: list[dict],
        *,
        temperature: float = 0.0,
        max_tokens:int | None = None) -> LlmJson: 
        """Panggil LLM, WAJIB balikin JSON object (dict)."""
        ...

    async def close(self) -> None: ...