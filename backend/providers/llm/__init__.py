from core.config import settings 

from .base import (
    LlmError, LlmJson, LlmProvider, LlmUsage, PermanentLlmError, TransientLlmError,
)


__all__ = [
    "LlmError", "LlmJson", "LlmProvider", "LlmUsage",
    "PermanentLlmError", "TransientLlmError", "get_llm_provider",
]

def get_llm_provider() -> LlmProvider : 
    """ Pilih provider dari LLM_PROVIDER di .env"""
    provider = settings.LLM_PROVIDER.lower()
    if provider == "deepseek": 
        from .deepseek import DeepseekLlm
        return DeepseekLlm(
            base_url=settings.LLM_BASE_URL, 
            api_key=settings.LLM_API_KEY,
            model=settings.LLM_MODEL,
            timeout=settings.LLM_TIMEOUT,
            max_tokens=settings.LLM_MAX_TOKENS,
            json_mode=settings.LLM_JSON_MODE
            )
    if provider == "fake": 
        from .fake import FakeLlm
        return FakeLlm()
    raise RuntimeError(f"LLM_PROVIDER tidak dikenal: {settings.LLM_PROVIDER!r} (pilih deepseek | fake)")