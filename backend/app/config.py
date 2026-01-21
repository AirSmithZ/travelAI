import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库配置
    DB_HOST: str = os.getenv("DB_HOST", "127.0.0.1")
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "19961001")
    DB_NAME: str = os.getenv("DB_NAME", "travel")
    DB_PORT: int = int(os.getenv("DB_PORT", "3306"))
    DB_CHARSET: str = "utf8mb4"
    
    # Redis配置
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD", None)
    
    # Celery配置
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    
    # API Keys（不要在代码中写默认值，统一通过环境变量注入）
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    AMAP_API_KEY: str = os.getenv("AMAP_API_KEY", "")
    AMAP_SECURITY_KEY: str = os.getenv("AMAP_SECURITY_KEY", "")
    GOOGLE_PLACES_API_KEY: Optional[str] = os.getenv("GOOGLE_PLACES_API_KEY", None)
    
    # 应用配置
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Travel Planner API"
    VERSION: str = "1.0.0"
    
    # CORS配置
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# 关键密钥缺失时给出明确报错（避免“静默失败”）
def _require(name: str, value: str):
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}. Please set it in backend/.env (see backend/.env.example).")

_require("DEEPSEEK_API_KEY", settings.DEEPSEEK_API_KEY)
_require("AMAP_API_KEY", settings.AMAP_API_KEY)
_require("AMAP_SECURITY_KEY", settings.AMAP_SECURITY_KEY)
