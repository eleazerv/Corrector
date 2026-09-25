from pydantic_settings import BaseSettings, SettingsConfigDict 
from pydantic import Field 

class Settings(BaseSettings): 
    model_config = SettingsConfigDict(env_file=".env",extra="ignore")
    ENV : str = "development"
    DATABASE_URL :str 
    REDIS_URL : str
    REDIS_API: str
    
    SUPABASE_KEY : str
    SUPABASE_URL : str 
    WORKER_TOKEN : str = Field(min_length=32)
    
    LLM_PROVIDER : str 
    AI_API_KEY : str 
    OCR_PROVIDER : str = "local" # local | api 
    
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    LLM_CONCURRENCY: int = 5

    OCR_PROVIDER: str                     # local | api | fake
    OCR_MODEL_ID: str
    OCR_MAX_NEW_TOKENS: int 
    OCR_MAX_IMAGE_SIDE: int 
    OCR_API_URL: str                       # mis. https://xxx/v1
    OCR_API_KEY: str 
    OCR_API_MODEL: str 
    OCR_API_TIMEOUT: float 
    
settings = Settings()