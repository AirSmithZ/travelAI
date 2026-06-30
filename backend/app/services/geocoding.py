import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.data.city_aliases import normalize_city
from app.services.geocode_providers import (
    AutocompleteResult,
    GeocodeProviderError,
    run_autocomplete,
)

logger = logging.getLogger(__name__)

_GEOCODE_CACHE: dict[tuple[str, str], dict[str, Any] | None] = {}
_GEOCODE_CACHE_MAX = 256


def build_query_variants(name: str, destination: str = "") -> list[str]:
    """生成 geocoder 检索串列表：别名 city + 裸关键词（P64）。"""
    name = name.strip()
    if not name:
        return []

    city_norm = normalize_city(destination)
    variants: list[str] = []
    if city_norm:
        variants.append(f"{name}, {city_norm}")
    if destination.strip() and destination.strip() != city_norm:
        variants.append(f"{name}, {destination.strip()}")
    variants.append(name)

    seen: set[str] = set()
    out: list[str] = []
    for v in variants:
        key = v.lower()
        if key not in seen:
            seen.add(key)
            out.append(v)
    return out


def geocode_autocomplete(
    name: str,
    destination: str = "",
    limit: int = 5,
    *,
    settings: Settings | None = None,
) -> AutocompleteResult:
    queries = build_query_variants(name, destination)
    if not queries:
        return AutocompleteResult(results=[], warnings=["搜索关键词为空"])
    return run_autocomplete(queries, limit=limit, settings=settings)


def _cache_key(name: str, destination: str) -> tuple[str, str]:
    return (name.strip().lower(), destination.strip().lower())


def geocode_place(name: str, destination: str = "") -> dict[str, Any] | None:
    """批量编码用：失败返回 None，不抛异常。"""
    key = _cache_key(name, destination)
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]

    try:
        result = geocode_autocomplete(name, destination, limit=1)
        if not result.results:
            hit: dict[str, Any] | None = None
        else:
            first = result.results[0]
            hit = {
                "lat": first.lat,
                "lng": first.lng,
                "address": first.address,
                "coord_confidence": "medium",
                "coord_source": first.coord_source,
            }
    except GeocodeProviderError as e:
        logger.warning("geocode_place failed for %s: %s", name, e)
        hit = None

    if len(_GEOCODE_CACHE) >= _GEOCODE_CACHE_MAX:
        _GEOCODE_CACHE.pop(next(iter(_GEOCODE_CACHE)))
    _GEOCODE_CACHE[key] = hit
    return hit


def geocode_reverse(lat: float, lng: float) -> dict[str, Any] | None:
    cfg = get_settings()
    reverse_url = f"{cfg.nominatim_base_url.rstrip('/')}/reverse"
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                reverse_url,
                params={"lat": lat, "lon": lng, "format": "json"},
                headers={"User-Agent": cfg.geocode_user_agent},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            address = data.get("display_name", "")
            name = data.get("name") or (address.split(",")[0].strip() if address else "")
            return {
                "name": name,
                "address": address,
                "lat": lat,
                "lng": lng,
                "coord_source": "nominatim_reverse",
            }
    except Exception as e:
        logger.warning("geocode reverse failed for %s,%s: %s", lat, lng, e)
        return None


def _has_valid_coords(node: dict[str, Any]) -> bool:
    lat = node.get("lat") or 0
    lng = node.get("lng") or 0
    return bool(lat and lng and not (lat == 0 and lng == 0))


def _node_needs_geocode(node: dict[str, Any]) -> bool:
    conf = node.get("coord_confidence", "none")
    if conf in ("high", "manual") and _has_valid_coords(node):
        return False
    if not _has_valid_coords(node):
        return True
    return conf in ("none", "low", None)


def _apply_geocode_to_node(node: dict[str, Any], destination: str) -> None:
    name = node.get("name", "")
    result = geocode_place(name, destination)
    if result:
        node.update(result)
    else:
        node["coord_confidence"] = "low"


def geocode_itinerary(
    itinerary: dict[str, Any],
    destination: str,
    *,
    max_workers: int = 4,
    on_progress: Callable[[int, int], None] | None = None,
) -> dict[str, Any]:
    """为缺失坐标的节点补全地理编码（并行 + 缓存）。"""
    dest = destination.strip()
    pending: list[dict[str, Any]] = []
    for day in itinerary.get("days", []):
        for node in day.get("nodes", []):
            if _node_needs_geocode(node):
                pending.append(node)

    total = len(pending)
    if total == 0:
        if on_progress:
            on_progress(0, 0)
        return itinerary

    workers = max(1, min(max_workers, total))
    started = time.perf_counter()
    done_count = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_apply_geocode_to_node, node, dest) for node in pending]
        for fut in as_completed(futures):
            fut.result()
            done_count += 1
            if on_progress:
                on_progress(done_count, total)

    logger.info(
        "geocode_itinerary done nodes=%s workers=%s latency_ms=%s",
        total,
        workers,
        int((time.perf_counter() - started) * 1000),
    )
    return itinerary
