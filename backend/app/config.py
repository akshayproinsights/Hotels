from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: str
    r2_endpoint: str
    r2_access_key: str
    r2_secret_key: str
    r2_bucket: str
    r2_public_url: str

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
