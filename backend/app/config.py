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
    # QWeather Console V4: dedicated hosts are *.qweatherapi.com (not *.qweather.com).
    if (
        host not in _ALLOWED_API_HOSTS
        and not host.endswith(".qweather.com")
        and not host.endswith(".qweatherapi.com")
    ):
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
    # 4 日 × 日闭环/三餐/name_en；reasoning 模型另占 completion，3500 易 length 截断（P90）
    llm_max_tokens_generate: int = Field(
        default=8000,
        validation_alias="LLM_MAX_TOKENS_GENERATE",
    )
    geocode_max_workers: int = Field(default=4, validation_alias="GEOCODE_MAX_WORKERS")
    geocode_timeout_sec: float = Field(default=6.0, validation_alias="GEOCODE_TIMEOUT_SEC")
    nominatim_timeout_sec: float = Field(
        default=6.0,
        validation_alias="NOMINATIM_TIMEOUT_SEC",
    )
    geocode_fence_km: float = Field(default=150.0, validation_alias="GEOCODE_FENCE_KM")
    # GEO-CACHE-01：成功长 TTL / 失败短 TTL；0 = 不写缓存
    geocode_cache_ttl_sec: int = Field(
        default=86400,
        validation_alias="GEOCODE_CACHE_TTL_SEC",
    )
    geocode_cache_miss_ttl_sec: int = Field(
        default=600,
        validation_alias="GEOCODE_CACHE_MISS_TTL_SEC",
    )
    dest_center_cache_ttl_sec: int = Field(
        default=86400,
        validation_alias="DEST_CENTER_CACHE_TTL_SEC",
    )
    dest_center_cache_miss_ttl_sec: int = Field(
        default=600,
        validation_alias="DEST_CENTER_CACHE_MISS_TTL_SEC",
    )
    weather_cache_ttl_sec: int = Field(
        default=14400,
        validation_alias="WEATHER_CACHE_TTL_SEC",
    )
    serp_circuit_backoff_sec: float = Field(
        default=120.0,
        validation_alias="SERP_CIRCUIT_BACKOFF_SEC",
    )
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
    # HOT-RG-02: RollingGo MCP 搜店（Bearer；与 Cursor MCP 同 Key）
    rollinggo_mcp_api_key: str = Field(
        default="",
        validation_alias="ROLLINGGO_MCP_API_KEY",
    )
    rollinggo_mcp_url: str = Field(
        default="https://mcp.rollinggo.cn/mcp",
        validation_alias="ROLLINGGO_MCP_URL",
    )
    rollinggo_mcp_timeout_sec: float = Field(
        default=45.0,
        validation_alias="ROLLINGGO_MCP_TIMEOUT_SEC",
    )
    # Serp lodging 默认关（额度不充时用 RollingGo + Trip）；显式 true 才回退 Maps
    lodging_enable_serp: bool = Field(
        default=False,
        validation_alias="LODGING_ENABLE_SERP",
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
    # Console → Settings dedicated host, e.g. https://xxxx.yy.qweatherapi.com
    # Legacy shared hosts (devapi/api.qweather.com) return 403 Invalid Host.
    qweather_api_host: str = Field(
        default="",
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

    # EvidencePack 控费 / WS-08a 轻量 POI（见 docs/llm-travel-data/21 §0.1）
    evidence_cache_ttl_sec: int = Field(
        default=604800,  # 7 days; 0 = disable
        validation_alias="EVIDENCE_CACHE_TTL_SEC",
    )
    evidence_poi_validate: bool = Field(
        default=True,
        validation_alias="EVIDENCE_POI_VALIDATE",
    )
    evidence_poi_validate_max: int = Field(
        default=5,
        validation_alias="EVIDENCE_POI_VALIDATE_MAX",
    )

    # ACT-POOL / doc 34：地图封闭池 + 出池代码执法
    closed_poi_enforce: bool = Field(
        default=True,
        validation_alias="CLOSED_POI_ENFORCE",
    )
    closed_poi_maps_enable: bool = Field(
        default=True,
        validation_alias="CLOSED_POI_MAPS_ENABLE",
    )
    closed_poi_maps_min_seed: int = Field(
        default=4,
        validation_alias="CLOSED_POI_MAPS_MIN_SEED",
    )
    closed_poi_maps_limit: int = Field(
        default=16,
        validation_alias="CLOSED_POI_MAPS_LIMIT",
    )
    closed_poi_pool_max: int = Field(
        default=24,
        validation_alias="CLOSED_POI_POOL_MAX",
    )
    closed_poi_max_km: float = Field(
        default=35.0,
        validation_alias="CLOSED_POI_MAX_KM",
    )
    closed_poi_match_threshold: float = Field(
        default=0.72,
        validation_alias="CLOSED_POI_MATCH_THRESHOLD",
    )
    closed_poi_adopt_geocode_max: int = Field(
        default=8,
        validation_alias="CLOSED_POI_ADOPT_GEOCODE_MAX",
    )

    # 通勤 TRN-02：geocode 后仅对可疑边自动补算（默认开；无 Key 时仍可走提示词/估算）
    commute_auto_enrich: bool = Field(
        default=True,
        validation_alias="COMMUTE_AUTO_ENRICH",
    )
    commute_auto_use_directions: bool = Field(
        default=True,
        validation_alias="COMMUTE_AUTO_USE_DIRECTIONS",
    )
    commute_auto_max_edges: int = Field(
        default=8,
        validation_alias="COMMUTE_AUTO_MAX_EDGES",
    )
    commute_cache_ttl_sec: int = Field(
        default=604800,  # 7 days; 0 = disable
        validation_alias="COMMUTE_CACHE_TTL_SEC",
    )
    commute_suspicious_walk_m: float = Field(
        default=900.0,
        validation_alias="COMMUTE_SUSPICIOUS_WALK_M",
    )
    commute_suspicious_long_m: float = Field(
        default=3000.0,
        validation_alias="COMMUTE_SUSPICIOUS_LONG_M",
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
        """Key + dedicated API Host (legacy shared hosts alone are not enough)."""
        if not self.qweather_api_key.strip():
            return False
        raw = (self.qweather_api_host or "").strip()
        if not raw:
            return False
        host = (urlparse(raw).hostname or "").lower()
        if host in {"devapi.qweather.com", "api.qweather.com", "geoapi.qweather.com"}:
            return False
        return host.endswith(".qweatherapi.com")

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
