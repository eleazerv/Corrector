import asyncio 
import httpx 
from core.logging import log

from .base import LlmError , TransientLlmError , PermanentLlmError, LlmProvider , LlmUsage , LlmJson
from .json_utils import parse_json_object

TRANSIENT_STATUS = {429, 500, 502, 503, 504}
PERMANENT_STATUS = {400, 401, 402, 403, 404, 422}


class DeepseekLlm : 
    """ 
    Deepseek via API OpenAI-compatible 
    default thinking = false 
    """
    name = "deepseek"
    
    def __init__ (self, * , base_url: str , api_key : str , model :str,
                  timeout: float = 120 , max_tokens: int = 4096, max_attempts: int = 3 , 
                  backoff: float = 2.0, json_mode: bool = True) : 
        if not api_key: 
            raise PermanentLlmError("DeepseekLlm: API key is empty")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_tokens = max_tokens
        self.max_attempts = max_attempts
        self.backoff = backoff
        self.json_mode = json_mode
        self._client: httpx.AsyncClient | None = None
    
    async def start(self) -> None : 
        if self._client is None : 
            self._client = httpx.AsyncClient(
                base_url = self.base_url,
                timeout= self.timeout,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
    
    async def close(self) -> None : 
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            
    def _body (self,messages: list[dict],temperature:float,max_tokens:int |None , thinking:bool)-> dict : 
        body = { 
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens or self.max_tokens,
            "thinking": {"type": "enabled" if thinking else "disabled"},
            "stream": False,
        }
        if not thinking:
            # mode thinking biasanya mengabaikan/menolak temperature
            body["temperature"] = temperature
        if self.json_mode:
            body["response_format"] = {"type": "json_object"}   # prompt WAJIB nyebut kata "json"
        return body
            
    async def complete_json(self, messages: list[dict],
                            * , 
                            temperature : float = 0.0,
                            max_tokens: int | None = None ,
                            thinking: bool = False) -> LlmJson :
        await self.start()
        body = self._body(messages,temperature,max_tokens,thinking)
        usage = LlmUsage()
        last_err : Exception | None = None
        for attempt in range(1,self.max_attempts + 1) : 
            try : 
                resp = await self._client.post("/chat/completions",json=body)
            except (httpx.TimeoutException, httpx.NetworkError) as e :
                last_err = TransientLlmError(f"network:{e!r}")
            else : 
                if resp.status_code in PERMANENT_STATUS:
                    raise PermanentLlmError(f"deepseek {resp.status_code}: {resp.text[:300]}")
                if resp.status_code in TRANSIENT_STATUS:
                    last_err = TransientLlmError(f"deepseek {resp.status_code}")
                elif resp.status_code != 200:
                    raise PermanentLlmError(f"deepseek {resp.status_code}: {resp.text[:300]}")
                else :
                    payload =  resp.json()
                    usage = usage + _usage(payload)    
                    content = _content(payload)
                    data = parse_json_object(content)
                    if data is not None : 
                        return LlmJson(data=data,usage=usage,model=payload.get("model",self.model))                                    
                    last_err = TransientLlmError(f"output bukan JSON: {content[:200]!r}")
            if attempt < self.max_attempts : 
                delay = self.backoff * attempt 
                log.warning("llm attempt %s/%s gagal (%s), retry %.0fs",
                attempt, self.max_attempts, last_err, delay) 
                await asyncio.sleep(delay) # sleep sebelum retry

        raise last_err or TransientLlmError("llm gagal tanpa error yang tercatat")


def _content(payload:dict) -> str : 
    try: 
        return payload["choices"][0]["message"].get("content") or ""
    except (KeyError, TypeError, IndexError): 
        return ""
        
def _usage(payload:dict) -> LlmUsage : 
    u = payload.get("usage") or {}
    return LlmUsage(
        input_tokens=u.get("prompt_tokens", 0),
        output_tokens=u.get("completion_tokens", 0),
        cached_tokens=u.get("prompt_cache_hit_tokens", 0),
    )
