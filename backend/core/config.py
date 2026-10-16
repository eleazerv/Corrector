from pydantic_settings import BaseSettings, SettingsConfigDict 
from pydantic import Field 
from pathlib import Path
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

class Settings(BaseSettings): 
    model_config = SettingsConfigDict(env_file=ENV_FILE,extra="ignore")
    ENV : str = "development"
    DATABASE_URL :str 
    REDIS_URL : str
    REDIS_API: str
    
    SUPABASE_KEY : str
    SUPABASE_URL : str 
    SUPABASE_BUCKET : str 
    SUPABASE_PUBLIC_URL: str | None = None
    WORKER_TOKEN : str = Field(min_length=32)
    
    LLM_PROVIDER : str 
    LLM_BASE_URL: str
    LLM_MODEL : str 
    LLM_API_KEY : str
    LLM_MAX_TOKENS: int 
    LLM_TIMEOUT: float = 120  
    LLM_JSON_MODE: bool = True 
    LLM_CONCURRENCY: int = 5 
    
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    
    LANGGRAPH_CHECKPOINT: str = "postgres"     # postgres 
    
    EMBEDDING_PROVIDER: str = "fake"       # api | local | fake
    EMBEDDING_BASE_URL: str = ""           # endpoint OpenAI-compatible, mis. .../v1
    EMBEDDING_MODEL: str = ""
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_DIM: int = 768               # HARUS sama dengan kolom vector(768)
    EMBEDDING_SEND_DIMENSIONS: bool = True # kirim param `dimensions` (matikan kalau API nolak)


    OCR_PROVIDER: str                     # local | api | fake
    OCR_MAX_IMAGE_SIDE: int 
    
    OCR_API_URL: str                       # mis. https://xxx/v1
    OCR_API_KEY: str 
    OCR_API_MODE: str 
    OCR_API_TIMEOUT: float 
    

settings = Settings()
