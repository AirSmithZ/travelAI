from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]

# 官方模型 ID；404 时按序回退（P1）
DEFAULT_LLM_FALLBACKS = "deepseek-v4-flash,deepseek-chat"

# SEC-04: 外部 base URL 主机白名单（防 Key 外泄到不可信主机）
_ALLOWED_API_HOSTS = frozenset(
    {
        "api.deepseek.com",
        "api.tikhub.io",
        "serpapi.com",
        "nominatim.openstreetmap.org",
        "photon.komoot.io",
        "devapi.qweather.com",
        "api.qweather.com",
        "api.tavily.com",
        "mcp.tavily.com",
    }
)


def _validate_https_allowlisted_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return raw
    parsed = urlparse(raw)
    if parsed.scheme != "https":
        raise ValueError(f"SEC-04: URL must use https (got {parsed.scheme or 'empty'}): {raw}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_API_HOSTS and not host.endswith(".qweather.com"):
        raise ValueError(f"SEC-04: host not allowlisted: {host}")
    return raw


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deepseek_api_key: str = Field(default="", validation_alias="DEEPSEEK_API_KEY")
    deepseek_api_base: str = Field(
        default="https://api.deepseek.com/v1",
        validation_alias="DEEPSEEK_API_BASE",
    )
    llm_model: str = Field(default="deepseek-v4-pro", validation_alias="LLM_MODEL")
    llm_model_rewrite: str = Field(
        default="deepseek-v4-flash",
        validation_alias="LLM_MODEL_REWRITE",
    )
    llm_model_fallbacks: str = Field(
        default=DEFAULT_LLM_FALLBACKS,
        validation_alias="LLM_MODEL_FALLBACKS",
    )
    llm_max_tokens_parse: int = Field(default=2500, validation_alias="LLM_MAX_TOKENS_PARSE")
    llm_max_tokens_generate: int = Field(
        default=3500,
        validation_alias="LLM_MAX_TOKENS_GENERATE",
    )
    geocode_max_workers: int = Field(default=4, validation_alias="GEOCODE_MAX_WORKERS")
    geocode_timeout_sec: float = Field(default=6.0, validation_alias="GEOCODE_TIMEOUT_SEC")
    nominatim_timeout_sec: float = Field(
        default=6.0,
        validation_alias="NOMINATIM_TIMEOUT_SEC",
    )
    geocode_fence_km: float = Field(default=150.0, validation_alias="GEOCODE_FENCE_KM")
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        validation_alias="CORS_ORIGINS",
    )
    chat_max_message_chars: int = 8000
    chat_history_limit: int = 20
    geocode_providers: str = Field(
        default="serpapi,photon,nominatim",
        validation_alias="GEOCODE_PROVIDERS",
    )
    # SerpApi Google Maps（L1 主地理源 · https://serpapi.com/）
    serpapi_api_key: str = Field(default="", validation_alias="SERPAPI_API_KEY")
    serpapi_base_url: str = Field(
        default="https://serpapi.com",
        validation_alias="SERPAPI_BASE_URL",
    )
    serpapi_timeout_sec: float = Field(
        default=20.0,
        validation_alias="SERPAPI_TIMEOUT_SEC",
    )
    geocode_user_agent: str = Field(
        default="TravelPlanner/0.2 (https://github.com/travel-planner)",
        validation_alias="GEOCODE_USER_AGENT",
    )
    nominatim_base_url: str = Field(
        default="https://nominatim.openstreetmap.org",
        validation_alias="NOMINATIM_BASE_URL",
    )
    photon_base_url: str = Field(
        default="https://photon.komoot.io",
        validation_alias="PHOTON_BASE_URL",
    )

    tripcom_affiliate_alliance_id: str = Field(
        default="",
        validation_alias="TRIPCOM_AFFILIATE_ALLIANCE_ID",
    )
    tripcom_affiliate_sid: str = Field(
        default="",
        validation_alias="TRIPCOM_AFFILIATE_SID",
    )
    tripcom_affiliate_sub1: str = Field(
        default="",
        validation_alias="TRIPCOM_AFFILIATE_SUB1",
    )
    tripcom_affiliate_sub3: str = Field(
        default="",
        validation_alias="TRIPCOM_AFFILIATE_SUB3",
    )
    tripcom_default_currency: str = Field(
        default="CNY",
        validation_alias="TRIPCOM_DEFAULT_CURRENCY",
    )
    flight_include_letsfg: bool = Field(
        default=False,
        validation_alias="FLIGHT_INCLUDE_LETSFG",
    )
    flight_letsfg_timeout_sec: int = Field(
        default=300,
        validation_alias="FLIGHT_LETSFG_TIMEOUT_SEC",
    )
    flight_default_preference: str = Field(
        default="balanced",
        validation_alias="FLIGHT_DEFAULT_PREFERENCE",
    )
    ignav_api_key: str = Field(default="", validation_alias="IGNAV_API_KEY")
    flight_include_ignav: bool = Field(
        default=True,
        validation_alias="FLIGHT_INCLUDE_IGNAV",
    )
    flight_ignav_timeout_sec: int = Field(
        default=120,
        validation_alias="FLIGHT_IGNAV_TIMEOUT_SEC",
    )

    # 和风天气 QWeather（WX-*）
    qweather_credential_id: str = Field(
        default="",
        validation_alias="QWEATHER_CREDENTIAL_ID",
    )
    qweather_api_key: str = Field(default="", validation_alias="QWEATHER_API_KEY")
    qweather_api_host: str = Field(
        default="https://devapi.qweather.com",
        validation_alias="QWEATHER_API_HOST",
    )

    # Tavily 联网（WS-*）
    tavily_api_key: str = Field(default="", validation_alias="TAVILY_API_KEY")
    tavily_mcp_url: str = Field(default="", validation_alias="TAVILY_MCP_URL")
    tavily_search_depth: str = Field(
        default="basic",
        validation_alias="TAVILY_SEARCH_DEPTH",
    )
    tavily_max_results: int = Field(default=5, validation_alias="TAVILY_MAX_RESULTS")

    # TikHub（小红书等 UGC · WS-07）
    tikhub_api_key: str = Field(default="", validation_alias="TIKHUB_API_KEY")
    tikhub_api_base: str = Field(
        default="https://api.tikhub.io",
        validation_alias="TIKHUB_API_BASE",
    )
    tikhub_timeout_sec: float = Field(
        default=30.0,
        validation_alias="TIKHUB_TIMEOUT_SEC",
    )
    tikhub_max_results: int = Field(
        default=8,
        validation_alias="TIKHUB_MAX_RESULTS",
    )

    @field_validator(
        "deepseek_api_base",
        "serpapi_base_url",
        "nominatim_base_url",
        "photon_base_url",
        "qweather_api_host",
        "tikhub_api_base",
        mode="after",
    )
    @classmethod
    def _sec04_external_bases(cls, v: str) -> str:
        return _validate_https_allowlisted_url(v)

    @field_validator("tavily_mcp_url", mode="after")
    @classmethod
    def _sec04_tavily_mcp(cls, v: str) -> str:
        return _validate_https_allowlisted_url(v)

    @property
    def weather_configured(self) -> bool:
        return bool(self.qweather_api_key.strip())

    @property
    def web_search_configured(self) -> bool:
        return bool(self.tavily_api_key.strip())

    @property
    def tikhub_configured(self) -> bool:
        return bool(self.tikhub_api_key.strip())

    @property
    def serpapi_configured(self) -> bool:
        return bool(self.serpapi_api_key.strip())

    @property
    def geocode_provider_chain(self) -> list[str]:
        return [p.strip().lower() for p in self.geocode_providers.split(",") if p.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_model_parse(self) -> str:
        """parse / 修复轮使用 flash 模型以降延迟。"""
        return (self.llm_model_rewrite or "deepseek-v4-flash").strip()

    @property
    def llm_model_chain(self) -> list[str]:
        seen: set[str] = set()
        chain: list[str] = []
        for name in [self.llm_model, *self.llm_model_fallbacks.split(",")]:
            n = name.strip()
            if n and n not in seen:
                seen.add(n)
                chain.append(n)
        return chain


@lru_cache
def get_settings() -> Settings:
    return Settings()
