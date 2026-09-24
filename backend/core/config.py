from pydantic_settings import BaseSettings, SettingsConfigDict 
from pydantic import Field 

class Settings(BaseSettings): 
    model_config = SettingsConfigDict(env_file=".env",extra="ignore")
    ENV : str = "development"
    DATABASE_URL :str 
    REDIS_URL : str
    
    SUPABASE_KEY : str
    SUPABASE_URL : str 
    WORKER_TOKEN : str = Field(min_length=32)
    
    LLM_PROVIDER : str = "deepseek"
    DEEPSEEK_API : str = ""
    OCR_PROVIDER : str = "local" # local | api 
    
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    LLM_CONCURRENCY: int = 5

settings = Settings()