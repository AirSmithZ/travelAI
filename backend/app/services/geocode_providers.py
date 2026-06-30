import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class GeocodeProviderError(Exception):
    """所有 geocoding 上游均不可用。"""


@dataclass
class GeocodeHit:
    name: str
    address: str
    lat: float
    lng: float
    place_id: str
    coord_source: str


@dataclass
class AutocompleteResult:
    results: list[GeocodeHit] = field(default_factory=list)
    provider: str | None = None
    warnings: list[str] = field(default_factory=list)


class GeocodeProvider(ABC):
    name: str

    @abstractmethod
    def autocomplete(self, query: str, *, limit: int) -> list[GeocodeHit]:
        raise NotImplementedError


class NominatimProvider(GeocodeProvider):
    name = "nominatim"

    def __init__(self, settings: Settings) -> None:
        self._base = settings.nominatim_base_url.rstrip("/")
        self._user_agent = settings.geocode_user_agent

    def autocomplete(self, query: str, *, limit: int) -> list[GeocodeHit]:
        url = f"{self._base}/search"
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                url,
                params={"q": query, "format": "json", "limit": limit},
                headers={"User-Agent": self._user_agent},
            )
            resp.raise_for_status()
            data = resp.json()
        if not isinstance(data, list) or not data:
            return []

        hits: list[GeocodeHit] = []
        for item in data:
            display = item.get("display_name", query)
            hits.append(
                GeocodeHit(
                    name=item.get("name") or display.split(",")[0].strip() or query,
                    address=display,
                    lat=float(item["lat"]),
                    lng=float(item["lon"]),
                    place_id=str(item.get("place_id") or item.get("osm_id") or ""),
                    coord_source="nominatim",
                )
            )
        return hits


class PhotonProvider(GeocodeProvider):
    name = "photon"

    def __init__(self, settings: Settings) -> None:
        self._base = settings.photon_base_url.rstrip("/")
        self._user_agent = settings.geocode_user_agent

    def autocomplete(self, query: str, *, limit: int) -> list[GeocodeHit]:
        url = f"{self._base}/api/"
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                url,
                params={"q": query, "limit": limit},
                headers={"User-Agent": self._user_agent},
            )
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features") if isinstance(data, dict) else []
        hits: list[GeocodeHit] = []
        for feature in features or []:
            props = feature.get("properties") or {}
            geom = feature.get("geometry") or {}
            coords = geom.get("coordinates") or []
            if len(coords) < 2:
                continue
            lng, lat = float(coords[0]), float(coords[1])
            name = props.get("name") or query
            address = _photon_address(props)
            osm_type = props.get("osm_type") or "x"
            osm_id = props.get("osm_id") or ""
            hits.append(
                GeocodeHit(
                    name=str(name),
                    address=address,
                    lat=lat,
                    lng=lng,
                    place_id=f"{osm_type}/{osm_id}",
                    coord_source="photon",
                )
            )
        return hits


def _photon_address(props: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("street", "locality", "city", "state", "country"):
        val = props.get(key)
        if val and str(val) not in parts:
            parts.append(str(val))
    return ", ".join(parts) if parts else str(props.get("name") or "")


def _build_providers(settings: Settings) -> list[GeocodeProvider]:
    registry: dict[str, type[GeocodeProvider]] = {
        "nominatim": NominatimProvider,
        "photon": PhotonProvider,
    }
    providers: list[GeocodeProvider] = []
    for token in settings.geocode_provider_chain:
        cls = registry.get(token)
        if cls:
            providers.append(cls(settings))
        else:
            logger.warning("unknown geocode provider: %s", token)
    return providers


def run_autocomplete(
    queries: list[str],
    *,
    limit: int,
    settings: Settings | None = None,
) -> AutocompleteResult:
    """按配置顺序尝试多 provider × 多 query 变体（P61/P63）。"""
    cfg = settings or get_settings()
    providers = _build_providers(cfg)
    if not providers:
        raise GeocodeProviderError("未配置 geocoding provider")

    warnings: list[str] = []
    provider_errors: list[str] = []
    had_successful_call = False

    for provider in providers:
        for q in queries:
            if not q.strip():
                continue
            try:
                hits = provider.autocomplete(q, limit=limit)
                had_successful_call = True
                if hits:
                    return AutocompleteResult(
                        results=hits[:limit],
                        provider=provider.name,
                        warnings=warnings,
                    )
            except httpx.HTTPStatusError as e:
                msg = f"{provider.name} HTTP {e.response.status_code}"
                provider_errors.append(msg)
                logger.warning("geocode %s failed for %r: %s", provider.name, q, msg)
            except Exception as e:
                msg = f"{provider.name}: {type(e).__name__}"
                provider_errors.append(msg)
                logger.warning("geocode %s failed for %r: %s", provider.name, q, e)

    if not had_successful_call and provider_errors:
        unique = list(dict.fromkeys(provider_errors))
        raise GeocodeProviderError(
            f"地理编码服务不可用（{'；'.join(unique[:3])}）"
        )

    if provider_errors:
        unique = list(dict.fromkeys(provider_errors))
        warnings.append(f"部分数据源不可用：{'；'.join(unique[:2])}")

    warnings.append("未找到匹配地点，请调整关键词或改用手动/地图选点")
    return AutocompleteResult(results=[], warnings=warnings)
