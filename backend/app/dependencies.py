from app.config import get_settings
from app.services.llm_client import LLMClient


def get_llm_client() -> LLMClient | None:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return None
    try:
        return LLMClient(settings)
    except ValueError:
        return None
