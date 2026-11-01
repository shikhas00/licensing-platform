from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # App info
    app_name: str = "Licensing Platform API"
    app_version: str = "0.1.0"
    debug: bool = True

    # Database
    database_url: str = "sqlite:///./licensing_platform.db"

    # File uploads
    upload_dir: str = "uploads"
    max_upload_size: int = 10 * 1024 * 1024  # 10MB

    # CORS (frontend URL)
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance - call this to get settings"""
    return Settings()
