"""HOT-02 / HOT-02c: lodging candidates near a stay-zone hub via SerpApi Google Maps."""

from __future__ import annotations

import logging
import math
import re
import time
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx

from app.config import Settings, get_settings
from app.data.city_aliases import normalize_city
from app.services.flight.airport_search import search_airports

logger = logging.getLogger(__name__)

LodgingStatus = Literal["ok", "empty", "rate_limited", "provider_error", "unconfigured"]

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_DASH_RE = re.compile(r"[—–\-_|/]+")
_TRANSIENT_ERR_RE = re.compile(
    r"UNEXPECTED_EOF|SSL|Connection reset|RemoteProtocolError|"
    r"ReadTimeout|ConnectTimeout|timed out|Temporary failure|Server disconnected",
    re.I,
)


@dataclass
class LodgingSearchResult:
    candidates: list[dict[str, Any]] = field(default_factory=list)
    status: LodgingStatus = "empty"
    warnings: list[str] = field(default_factory=list)
    query: str = ""


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _is_transient(status: LodgingStatus | None, err_msg: str | None) -> bool:
    if status == "rate_limited":
        return True
    if status != "provider_error":
        return False
    return bool(_TRANSIENT_ERR_RE.search(err_msg or ""))


def resolve_lodging_city_en(city: str) -> str | None:
    """Map zone.city / zh label → English city token (aliases / airports; no hub hardcode)."""
    raw = (city or "").strip()
    if not raw:
        return None

    normalized = normalize_city(raw)
    if normalized and normalized != raw:
        head = normalized.split(",")[0].strip()
        if head and not _CJK_RE.search(head):
            return head

    if not _CJK_RE.search(raw) and re.fullmatch(r"[A-Za-z][A-Za-z\s.'.-]{1,48}", raw):
        return raw.split(",")[0].strip()

    hits = search_airports(raw, limit=3)
    for hit in hits:
        en = (hit.city or "").strip()
        if en and not _CJK_RE.search(en):
            return en
    return None


def city_en_from_coords(lat: float, lng: float, *, settings: Settings | None = None) -> str | None:
    """Nominatim reverse → English city/town (data-driven; covers 罗托鲁瓦 etc.)."""
    cfg = settings or get_settings()
    reverse_url = f"{cfg.nominatim_base_url.rstrip('/')}/reverse"
    timeout = float(cfg.nominatim_timeout_sec)
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                reverse_url,
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "addressdetails": 1,
                    "accept-language": "en",
                },
                headers={"User-Agent": cfg.geocode_user_agent},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.info("lodging reverse city failed for %s,%s: %s", lat, lng, e)
        return None

    if not isinstance(data, dict):
        return None
    addr = data.get("address") if isinstance(data.get("address"), dict) else {}
    for key in (
        "city",
        "town",
        "municipality",
        "city_district",
        "suburb",
        "village",
        "hamlet",
        "county",
    ):
        val = str(addr.get(key) or "").strip()
        if val and not _CJK_RE.search(val) and not re.search(r"\d", val):
            # Prefer shorter admin names (Rotorua over Rotorua Lakes District when both exist)
            if key == "county" and any(addr.get(k) for k in ("city", "town", "municipality")):
                continue
            return val.split("/")[0].strip()

    # Fallback: parse display_name for first plausible ASCII place token
    display = str(data.get("display_name") or "")
    for part in display.split(","):
        tok = part.strip().split("/")[0].strip()
        if (
            tok
            and not _CJK_RE.search(tok)
            and re.fullmatch(r"[A-Za-z][A-Za-z\s.'.-]{1,40}", tok)
            and tok.lower()
            not in {
                "new zealand",
                "aotearoa",
                "bay of plenty",
                "north island",
                "south island",
            }
            and "street" not in tok.lower()
            and "road" not in tok.lower()
        ):
            if re.search(r"\d", tok):
                continue
            return tok
    return None


def build_lodging_queries(
    *,
    city: str,
    label: str = "",
    city_en: str | None = None,
    has_coords: bool = True,
) -> list[str]:
    """Prefer EN city + generic 'hotels'; with coords never burn Chinese slogan q."""
    en = (city_en or "").strip() or resolve_lodging_city_en(city)
    queries: list[str] = []
    if en:
        queries.append(f"hotels near {en}")
    # Coords + ll=@ bias: bare "hotels" is strong enough for Maps
    queries.append("hotels")

    # Chinese / raw city token only when we have no coords AND no EN (should be rare)
    if not has_coords and not en:
        city_tok = _DASH_RE.split((city or "").strip())[0].strip()
        if city_tok and len(city_tok) <= 12:
            queries.append(f"hotel {city_tok}")

    _ = label  # API compat; never use LLM area slogans in q
    seen: set[str] = set()
    out: list[str] = []
    for q in queries:
        key = q.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out


def _parse_maps_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items: list[dict[str, Any]] = []
    place = data.get("place_results")
    if isinstance(place, dict):
        raw_items.append(place)
    local = data.get("local_results")
    if isinstance(local, list):
        raw_items.extend(x for x in local if isinstance(x, dict))
    return raw_items


def _filter_candidates(
    raw_items: list[dict[str, Any]],
    *,
    lat: float,
    lng: float,
    radius_m: float,
    limit: int,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_items:
        gps = item.get("gps_coordinates") if isinstance(item.get("gps_coordinates"), dict) else {}
        try:
            plat = float(gps.get("latitude"))
            plng = float(gps.get("longitude"))
        except (TypeError, ValueError):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        if not title:
            continue
        dist = _haversine_m(lat, lng, plat, plng)
        if dist > radius_m:
            continue
        place_id = str(item.get("place_id") or item.get("data_id") or "")
        dedupe = place_id or f"{plat:.5f},{plng:.5f}"
        if dedupe in seen:
            continue
        seen.add(dedupe)
        rating = item.get("rating")
        try:
            rating_f = float(rating) if rating is not None else None
        except (TypeError, ValueError):
            rating_f = None
        out.append(
            {
                "name": title,
                "lat": plat,
                "lng": plng,
                "address": str(item.get("address") or "").strip() or None,
                "place_id": place_id or None,
                "rating": rating_f,
                "distance_m": round(dist),
                "coord_source": "serpapi_lodging",
            }
        )
    out.sort(key=lambda x: (x["distance_m"], -(x["rating"] or 0)))
    return out[:limit]


def _serpapi_maps_get(
    *,
    q: str,
    lat: float,
    lng: float,
    settings: Settings,
) -> tuple[dict[str, Any] | None, LodgingStatus | None, str | None]:
    """Returns (data, error_status, error_message). error_status None means HTTP OK body."""
    from app.services.serp_circuit import (
        record_serp_rate_limit,
        serp_backoff_from_settings,
        serp_circuit_open,
        serp_circuit_remaining_sec,
    )

    if serp_circuit_open():
        rem = int(serp_circuit_remaining_sec())
        return None, "rate_limited", f"SerpApi 熔断中（约 {rem}s），请稍后或改用 Trip 深链"

    key = (settings.serpapi_api_key or "").strip()
    if not key:
        return None, "unconfigured", "SERPAPI_API_KEY 未配置"
    params: dict[str, Any] = {
        "engine": "google_maps",
        "q": q,
        "type": "search",
        "hl": "en",
        "ll": f"@{lat},{lng},14z",
        "api_key": key,
    }
    base = (settings.serpapi_base_url or "https://serpapi.com").rstrip("/")
    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.get(f"{base}/search.json", params=params)
            if resp.status_code == 429:
                record_serp_rate_limit(serp_backoff_from_settings(settings))
                return None, "rate_limited", "SerpApi 限流（429），请稍后重试"
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        code = e.response.status_code if e.response is not None else 0
        if code == 429:
            record_serp_rate_limit(serp_backoff_from_settings(settings))
            return None, "rate_limited", "SerpApi 限流（429），请稍后重试"
        return None, "provider_error", f"SerpApi HTTP {code}"
    except Exception as e:
        logger.warning("lodging search failed: %s", e)
        return None, "provider_error", str(e)[:160]

    if not isinstance(data, dict):
        return None, "provider_error", "SerpApi 返回非 JSON 对象"
    if data.get("error"):
        err = str(data.get("error"))
        if "429" in err or "rate" in err.lower():
            record_serp_rate_limit(serp_backoff_from_settings(settings))
            return None, "rate_limited", "SerpApi 限流，请稍后重试"
        return None, "provider_error", err[:160]
    return data, None, None


def search_lodging_near(
    *,
    lat: float,
    lng: float,
    city: str,
    label: str = "",
    settings: Settings,
    limit: int = 8,
    radius_m: float = 1200.0,
) -> LodgingSearchResult:
    """Return lodging-like places sorted by distance to hub. Price via deep link only."""
    if not (settings.serpapi_api_key or "").strip():
        return LodgingSearchResult(
            status="unconfigured",
            warnings=["SERPAPI_API_KEY 未配置，无法检索片区酒店"],
        )

    city_en = resolve_lodging_city_en(city)
    if not city_en:
        city_en = city_en_from_coords(lat, lng, settings=settings)
        if city_en:
            logger.info("lodging city_en from reverse: %r (zone.city=%r)", city_en, city)

    queries = build_lodging_queries(
        city=city,
        label=label,
        city_en=city_en,
        has_coords=True,
    )
    tight_r = max(float(radius_m) * 1.5, float(radius_m))
    wide_r = max(tight_r * 2.0, 2500.0, float(radius_m))
    last_status: LodgingStatus = "empty"
    last_warn = ""
    used_q = queries[0] if queries else "hotels"
    raw_pool: list[dict[str, Any]] = []

    for qi, q in enumerate(queries):
        used_q = q
        data, err_status, err_msg = _serpapi_maps_get(q=q, lat=lat, lng=lng, settings=settings)
        if _is_transient(err_status, err_msg):
            time.sleep(1.2)
            data, err_status, err_msg = _serpapi_maps_get(
                q=q, lat=lat, lng=lng, settings=settings
            )
        if err_status:
            last_status = err_status
            last_warn = err_msg or err_status
            logger.warning("lodging search %s q=%r: %s", err_status, q, err_msg)
            # Transient / rate-limit: do not burn a worse follow-up query
            if _is_transient(err_status, err_msg) or err_status == "rate_limited":
                break
            # Hard provider errors: stop too (coords-first "hotels" already tried)
            break

        assert data is not None
        raw_pool = _parse_maps_items(data)
        if raw_pool:
            break
        last_status = "empty"
        # Empty body only → try next EN/hotels variant
        if qi + 1 < len(queries):
            continue

    if last_status in ("rate_limited", "provider_error", "unconfigured") and not raw_pool:
        warn = last_warn or "片区酒店检索失败"
        if last_status == "provider_error" and _TRANSIENT_ERR_RE.search(warn):
            warn = f"上游连接中断，请稍后重试（{warn[:80]}）"
        return LodgingSearchResult(
            status=last_status,
            warnings=[warn],
            query=used_q,
        )

    candidates = _filter_candidates(
        raw_pool, lat=lat, lng=lng, radius_m=tight_r, limit=limit
    )
    if len(candidates) < min(3, limit) and raw_pool:
        wider = _filter_candidates(
            raw_pool, lat=lat, lng=lng, radius_m=wide_r, limit=limit
        )
        if len(wider) > len(candidates):
            candidates = wider
            return LodgingSearchResult(
                candidates=candidates,
                status="ok",
                warnings=["已扩大搜索半径以获取更多候选"],
                query=used_q,
            )

    if candidates:
        return LodgingSearchResult(
            candidates=candidates,
            status="ok",
            query=used_q,
        )

    return LodgingSearchResult(
        status="empty",
        warnings=["未找到片区内 lodging 候选；可手动输入酒店名或调整片区"],
        query=used_q,
    )


def search_lodging_near_list(**kwargs: Any) -> list[dict[str, Any]]:
    return search_lodging_near(**kwargs).candidates
