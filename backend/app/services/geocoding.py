import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.data.city_aliases import country_code_for_destination, normalize_city
from app.services.geocode_providers import (
    AutocompleteResult,
    GeocodeBias,
    GeocodeProviderError,
    bbox_from_center,
    run_autocomplete,
)

logger = logging.getLogger(__name__)

_GEOCODE_CACHE: dict[tuple[str, str], dict[str, Any] | None] = {}
_GEOCODE_CACHE_MAX = 256
_DEST_CENTER_CACHE: dict[str, "DestinationCenter | None"] = {}
_DEST_CENTER_CACHE_MAX = 64


@dataclass(frozen=True)
class DestinationCenter:
    lat: float
    lng: float
    country_code: str | None = None
    query: str = ""


def clear_geocode_caches() -> None:
    """测试用：清空 in-process 地点与目的地中心缓存。"""
    _GEOCODE_CACHE.clear()
    _DEST_CENTER_CACHE.clear()


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


def resolve_destination_center(
    destination: str,
    *,
    settings: Settings | None = None,
) -> DestinationCenter | None:
    """解析目的地中心 lat/lng（geocode 城市一次，进程内缓存）。"""
    raw = destination.strip()
    if not raw:
        return None

    cache_key = raw.lower()
    if cache_key in _DEST_CENTER_CACHE:
        return _DEST_CENTER_CACHE[cache_key]

    cfg = settings or get_settings()
    city_q = normalize_city(raw)
    alias_cc = country_code_for_destination(raw)
    # 城市中心解析：仅 countrycodes（Nominatim），不传 lat/lon 以免 Photon 偏到 0,0
    bias = GeocodeBias(country_code=alias_cc) if alias_cc else None

    center: DestinationCenter | None = None
    try:
        # 不套围栏；查询仅为城市本身
        result = run_autocomplete(
            [city_q] if city_q else [raw],
            limit=1,
            settings=cfg,
            bias=bias,
            fence_km=None,
            bare_query=None,
            allow_bare_without_fence=True,
        )
        if result.results:
            hit = result.results[0]
            center = DestinationCenter(
                lat=hit.lat,
                lng=hit.lng,
                country_code=hit.country_code or alias_cc,
                query=city_q or raw,
            )
    except GeocodeProviderError as e:
        logger.warning("resolve_destination_center failed for %s: %s", raw, e)

    if len(_DEST_CENTER_CACHE) >= _DEST_CENTER_CACHE_MAX:
        _DEST_CENTER_CACHE.pop(next(iter(_DEST_CENTER_CACHE)))
    _DEST_CENTER_CACHE[cache_key] = center
    return center


def _bias_for_destination(
    destination: str,
    *,
    settings: Settings | None = None,
) -> tuple[GeocodeBias | None, float | None, list[str]]:
    """构建 bias + fence；返回 (bias, fence_km, setup_warnings)。"""
    cfg = settings or get_settings()
    warnings: list[str] = []
    dest = destination.strip()
    if not dest:
        return None, None, warnings

    center = resolve_destination_center(dest, settings=cfg)
    alias_cc = country_code_for_destination(dest)
    fence_km = float(cfg.geocode_fence_km)

    if center is None:
        warnings.append("目的地中心未能解析，未启用地理围栏距离校验")
        if alias_cc:
            return GeocodeBias(country_code=alias_cc), None, warnings
        return None, None, warnings

    cc = center.country_code or alias_cc
    bbox = bbox_from_center(center.lat, center.lng, fence_km)
    bias = GeocodeBias(
        lat=center.lat,
        lng=center.lng,
        country_code=cc,
        bbox=bbox,
    )
    return bias, fence_km, warnings


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

    cfg = settings or get_settings()
    bias, fence_km, setup_warnings = _bias_for_destination(destination, settings=cfg)
    outcome = run_autocomplete(
        queries,
        limit=limit,
        settings=cfg,
        bias=bias,
        fence_km=fence_km,
        bare_query=name.strip(),
        allow_bare_without_fence=fence_km is None,
    )
    if setup_warnings:
        outcome.warnings = [*setup_warnings, *outcome.warnings]
    return outcome


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
            if result.rejected_out_of_fence:
                hit["coord_confidence"] = "low"
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
    timeout = float(cfg.nominatim_timeout_sec)
    try:
        with httpx.Client(timeout=timeout) as client:
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


@dataclass
class _GeocodeNodeOutcome:
    name: str
    ok: bool
    out_of_fence: bool = False
    suspicious: bool = False


def _apply_geocode_to_node(node: dict[str, Any], destination: str) -> _GeocodeNodeOutcome:
    name = str(node.get("name", "") or "")
    key = _cache_key(name, destination)
    if key in _GEOCODE_CACHE:
        cached = _GEOCODE_CACHE[key]
        if cached:
            node.update(cached)
            return _GeocodeNodeOutcome(name=name, ok=True)
        node["coord_confidence"] = "low"
        return _GeocodeNodeOutcome(name=name, ok=False)

    try:
        result = geocode_autocomplete(name, destination, limit=1)
        out_of_fence = result.rejected_out_of_fence > 0 and not result.results
        if result.results:
            first = result.results[0]
            hit = {
                "lat": first.lat,
                "lng": first.lng,
                "address": first.address,
                "coord_confidence": "low" if result.rejected_out_of_fence else "medium",
                "coord_source": first.coord_source,
            }
            node.update(hit)
            if len(_GEOCODE_CACHE) >= _GEOCODE_CACHE_MAX:
                _GEOCODE_CACHE.pop(next(iter(_GEOCODE_CACHE)))
            _GEOCODE_CACHE[key] = hit
            return _GeocodeNodeOutcome(
                name=name,
                ok=True,
                out_of_fence=False,
                suspicious=bool(result.rejected_out_of_fence),
            )
        node["coord_confidence"] = "low"
        if len(_GEOCODE_CACHE) >= _GEOCODE_CACHE_MAX:
            _GEOCODE_CACHE.pop(next(iter(_GEOCODE_CACHE)))
        _GEOCODE_CACHE[key] = None
        return _GeocodeNodeOutcome(name=name, ok=False, out_of_fence=out_of_fence)
    except GeocodeProviderError as e:
        logger.warning("geocode node failed for %s: %s", name, e)
        node["coord_confidence"] = "low"
        return _GeocodeNodeOutcome(name=name, ok=False)


def geocode_itinerary(
    itinerary: dict[str, Any],
    destination: str,
    *,
    max_workers: int = 4,
    on_progress: Callable[[int, int], None] | None = None,
) -> dict[str, Any]:
    """为缺失坐标的节点补全地理编码（并行 + 缓存 + 目的地围栏）。"""
    dest = destination.strip()
    pending: list[dict[str, Any]] = []
    for day in itinerary.get("days", []):
        for node in day.get("nodes", []):
            if _node_needs_geocode(node):
                pending.append(node)

    # 预热目的地中心，避免并行时重复解析
    setup_warnings: list[str] = []
    if dest:
        _, _, setup_warnings = _bias_for_destination(dest)

    total = len(pending)
    if total == 0:
        if on_progress:
            on_progress(0, 0)
        _merge_meta_warnings(itinerary, setup_warnings)
        return itinerary

    workers = max(1, min(max_workers, total))
    started = time.perf_counter()
    done_count = 0
    outcomes: list[_GeocodeNodeOutcome] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_apply_geocode_to_node, node, dest) for node in pending]
        for fut in as_completed(futures):
            outcomes.append(fut.result())
            done_count += 1
            if on_progress:
                on_progress(done_count, total)

    failed = [o for o in outcomes if not o.ok]
    out_of_fence = [o for o in outcomes if o.out_of_fence]
    suspicious = [o for o in outcomes if o.suspicious]

    warn_msgs = list(setup_warnings)
    if failed:
        sample = "、".join(o.name for o in failed[:3] if o.name)
        extra = f"等 {len(failed)} 处" if len(failed) > 3 else f"{len(failed)} 处"
        if sample:
            warn_msgs.append(
                f"地理编码失败：{sample}（{extra}），请在地图上点选校正"
            )
        else:
            warn_msgs.append(f"地理编码失败：{len(failed)} 个地点未找到坐标，请在地图上点选")
    if out_of_fence:
        warn_msgs.append(
            f"已丢弃 {len(out_of_fence)} 个距目的地过远的可疑坐标，建议地图点选"
        )
    elif suspicious:
        warn_msgs.append(
            f"{len(suspicious)} 个地点在候选中出现过远结果（已按围栏过滤）"
        )

    _merge_meta_warnings(itinerary, warn_msgs)

    logger.info(
        "geocode_itinerary done nodes=%s workers=%s failed=%s fence_drop=%s latency_ms=%s",
        total,
        workers,
        len(failed),
        len(out_of_fence),
        int((time.perf_counter() - started) * 1000),
    )
    return itinerary


def _merge_meta_warnings(itinerary: dict[str, Any], new_warnings: list[str]) -> None:
    if not new_warnings:
        return
    meta = itinerary.setdefault("meta", {})
    existing = list(meta.get("warnings") or [])
    for w in new_warnings:
        if w and w not in existing:
            existing.append(w)
    meta["warnings"] = existing
