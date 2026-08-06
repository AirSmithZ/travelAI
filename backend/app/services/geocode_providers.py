import logging
import math
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
    country_code: str | None = None


@dataclass
class GeocodeBias:
    """目的地偏置：bbox / countrycodes / Photon lat-lon。"""

    lat: float | None = None
    lng: float | None = None
    country_code: str | None = None
    # Photon: minLon, minLat, maxLon, maxLat
    bbox: tuple[float, float, float, float] | None = None


@dataclass
class AutocompleteResult:
    results: list[GeocodeHit] = field(default_factory=list)
    provider: str | None = None
    warnings: list[str] = field(default_factory=list)
    rejected_out_of_fence: int = 0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """球面距离（km）。与 stay_zone.score 同公式，供围栏复用且避免循环依赖。"""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, a)))


def bbox_from_center(lat: float, lng: float, radius_km: float) -> tuple[float, float, float, float]:
    """由中心点与半径生成 Photon bbox (minLon, minLat, maxLon, maxLat)。"""
    dlat = radius_km / 111.0
    cos_lat = max(0.2, abs(math.cos(math.radians(lat))))
    dlng = radius_km / (111.0 * cos_lat)
    return (lng - dlng, lat - dlat, lng + dlng, lat + dlat)


def filter_hits_by_fence(
    hits: list[GeocodeHit],
    *,
    center_lat: float,
    center_lng: float,
    fence_km: float,
) -> tuple[list[GeocodeHit], int]:
    """保留距目的地中心 ≤ fence_km 的命中；返回 (kept, rejected_count)。"""
    kept: list[GeocodeHit] = []
    rejected = 0
    for hit in hits:
        dist = haversine_km(center_lat, center_lng, hit.lat, hit.lng)
        if dist <= fence_km:
            kept.append(hit)
        else:
            rejected += 1
            logger.info(
                "geocode fence reject source=%s dist_km=%.1f name=%r",
                hit.coord_source,
                dist,
                hit.name,
            )
    return kept, rejected


class GeocodeProvider(ABC):
    name: str

    @abstractmethod
    def autocomplete(
        self,
        query: str,
        *,
        limit: int,
        bias: GeocodeBias | None = None,
    ) -> list[GeocodeHit]:
        raise NotImplementedError


class NominatimProvider(GeocodeProvider):
    name = "nominatim"

    def __init__(self, settings: Settings) -> None:
        self._base = settings.nominatim_base_url.rstrip("/")
        self._user_agent = settings.geocode_user_agent
        self._timeout = float(settings.nominatim_timeout_sec)

    def autocomplete(
        self,
        query: str,
        *,
        limit: int,
        bias: GeocodeBias | None = None,
    ) -> list[GeocodeHit]:
        url = f"{self._base}/search"
        params: dict[str, Any] = {
            "q": query,
            "format": "json",
            "limit": limit,
            "addressdetails": 1,
        }
        if bias:
            if bias.country_code:
                params["countrycodes"] = bias.country_code.lower()
            if bias.bbox:
                min_lon, min_lat, max_lon, max_lat = bias.bbox
                # Nominatim viewbox: left,top,right,bottom
                params["viewbox"] = f"{min_lon},{max_lat},{max_lon},{min_lat}"
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.get(
                url,
                params=params,
                headers={"User-Agent": self._user_agent},
            )
            resp.raise_for_status()
            data = resp.json()
        if not isinstance(data, list) or not data:
            return []

        hits: list[GeocodeHit] = []
        for item in data:
            display = item.get("display_name", query)
            addr = item.get("address") if isinstance(item.get("address"), dict) else {}
            cc = (addr or {}).get("country_code")
            hits.append(
                GeocodeHit(
                    name=item.get("name") or display.split(",")[0].strip() or query,
                    address=display,
                    lat=float(item["lat"]),
                    lng=float(item["lon"]),
                    place_id=str(item.get("place_id") or item.get("osm_id") or ""),
                    coord_source="nominatim",
                    country_code=str(cc).lower() if cc else None,
                )
            )
        return hits


class PhotonProvider(GeocodeProvider):
    name = "photon"

    def __init__(self, settings: Settings) -> None:
        self._base = settings.photon_base_url.rstrip("/")
        self._user_agent = settings.geocode_user_agent
        self._timeout = float(settings.geocode_timeout_sec)

    def autocomplete(
        self,
        query: str,
        *,
        limit: int,
        bias: GeocodeBias | None = None,
    ) -> list[GeocodeHit]:
        url = f"{self._base}/api/"
        params: dict[str, Any] = {"q": query, "limit": limit}
        if bias:
            if bias.lat is not None and bias.lng is not None:
                params["lat"] = bias.lat
                params["lon"] = bias.lng
            if bias.bbox:
                params["bbox"] = ",".join(str(x) for x in bias.bbox)
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.get(
                url,
                params=params,
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
            cc = props.get("countrycode") or props.get("country_code")
            hits.append(
                GeocodeHit(
                    name=str(name),
                    address=address,
                    lat=lat,
                    lng=lng,
                    place_id=f"{osm_type}/{osm_id}",
                    coord_source="photon",
                    country_code=str(cc).lower() if cc else None,
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
    bias: GeocodeBias | None = None,
    fence_km: float | None = None,
    bare_query: str | None = None,
    allow_bare_without_fence: bool = False,
) -> AutocompleteResult:
    """按配置顺序尝试多 provider × 多 query 变体（P61/P63 + GEO-01 围栏）。

    - 有 bias 时传 viewbox/bbox/countrycodes / Photon lat-lon。
    - 有 fence（bias 中心 + fence_km）时丢弃过远命中并继续尝试下一变体。
    - 目的地已知时默认不接受裸名全球 Top1（裸名命中必须过围栏）。
    """
    cfg = settings or get_settings()
    providers = _build_providers(cfg)
    if not providers:
        raise GeocodeProviderError("未配置 geocoding provider")

    warnings: list[str] = []
    provider_errors: list[str] = []
    had_successful_call = False
    rejected_out_of_fence = 0
    bare_norm = (bare_query or "").strip().lower()
    use_fence = bool(
        bias is not None
        and bias.lat is not None
        and bias.lng is not None
        and fence_km is not None
        and fence_km > 0
    )
    dest_known = bias is not None and (
        bias.lat is not None or bias.country_code is not None or bias.bbox is not None
    )

    for provider in providers:
        for q in queries:
            if not q.strip():
                continue
            is_bare = bool(bare_norm) and q.strip().lower() == bare_norm
            # 目的地已知但无围栏中心：跳过裸名（禁止全球 Top1）
            if is_bare and dest_known and not allow_bare_without_fence and not use_fence:
                continue
            try:
                hits = provider.autocomplete(q, limit=max(limit, 5), bias=bias)
                had_successful_call = True
                if use_fence and bias is not None and fence_km is not None:
                    assert bias.lat is not None and bias.lng is not None
                    hits, n_rej = filter_hits_by_fence(
                        hits,
                        center_lat=bias.lat,
                        center_lng=bias.lng,
                        fence_km=fence_km,
                    )
                    rejected_out_of_fence += n_rej
                    if is_bare and not hits:
                        # 禁止裸名全球 Top1：围栏外全部丢弃后不再采用
                        continue
                if hits:
                    return AutocompleteResult(
                        results=hits[:limit],
                        provider=provider.name,
                        warnings=warnings,
                        rejected_out_of_fence=rejected_out_of_fence,
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

    if rejected_out_of_fence:
        warnings.append(
            f"已排除 {rejected_out_of_fence} 个距目的地过远的可疑坐标"
        )

    warnings.append("未找到匹配地点，请调整关键词或改用手动/地图选点")
    return AutocompleteResult(
        results=[],
        warnings=warnings,
        rejected_out_of_fence=rejected_out_of_fence,
    )
