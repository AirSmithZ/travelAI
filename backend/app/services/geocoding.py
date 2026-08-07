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
    GeocodeHit,
    GeocodeProviderError,
    bbox_from_center,
    haversine_km,
    run_autocomplete,
)

# 名称分与距离加权：约每 50km 扣 1 名称分，避免围栏内远距同名抢 Top1
_GEOCODE_DIST_PENALTY_PER_KM = 0.02
# 次优与最优名称分接近且更近时，标 low 促人工复核
_GEOCODE_AMBIGUOUS_NAME_GAP = 0.5

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
        # 复检 P1：中心失败时仍保留 countrycodes，禁止完全放开裸名全球 Top1
        if alias_cc:
            warnings.append(
                "目的地中心未能解析，已降级为国家码过滤（无距离围栏）；坐标请人工复核"
            )
            return GeocodeBias(country_code=alias_cc), None, warnings
        warnings.append(
            "目的地中心未能解析且无国家码别名，地理围栏未启用；坐标强制低信心"
        )
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
    dest = destination.strip()
    # 有目的地时永不允许「无围栏裸名全球 Top1」；仅无 destination 时才放开
    allow_bare = not dest and fence_km is None
    outcome = run_autocomplete(
        queries,
        limit=limit,
        settings=cfg,
        bias=bias,
        fence_km=fence_km,
        bare_query=name.strip(),
        allow_bare_without_fence=allow_bare,
    )
    if setup_warnings:
        outcome.warnings = [*setup_warnings, *outcome.warnings]
    return outcome


def _cache_key(name: str, destination: str) -> tuple[str, str]:
    return (name.strip().lower(), destination.strip().lower())


def _name_relevance(query: str, hit_name: str, hit_address: str) -> float:
    """围栏内防「近但错」：简单名称一致性分（越高越好）。"""
    q = (query or "").strip().lower()
    if not q:
        return 0.0
    n = (hit_name or "").strip().lower()
    a = (hit_address or "").strip().lower()
    if q == n:
        return 3.0
    if n and (q in n or n in q):
        return 2.0
    if q in a:
        return 1.0
    return 0.0


def _candidate_score(
    query: str,
    hit: GeocodeHit,
    *,
    center_lat: float | None,
    center_lng: float | None,
) -> float:
    """名称相关性 − 距目的地中心惩罚；无中心时退化为纯名称分。"""
    name_score = _name_relevance(query, hit.name, hit.address)
    if center_lat is None or center_lng is None:
        return name_score
    dist = haversine_km(center_lat, center_lng, hit.lat, hit.lng)
    return name_score - dist * _GEOCODE_DIST_PENALTY_PER_KM


def _pick_best_hit(
    query: str,
    hits: list[GeocodeHit],
    *,
    center_lat: float | None,
    center_lng: float | None,
) -> tuple[GeocodeHit, bool]:
    """选融合分最高候选；名称近分的多候选标 ambiguous→low 促复核。"""
    scored = [
        (
            _candidate_score(query, h, center_lat=center_lat, center_lng=center_lng),
            _name_relevance(query, h.name, h.address),
            h,
        )
        for h in hits
    ]
    scored.sort(key=lambda t: t[0], reverse=True)
    _best_fused, best_name, best = scored[0]
    ambiguous = any(
        abs(best_name - name_s) <= _GEOCODE_AMBIGUOUS_NAME_GAP for _, name_s, _ in scored[1:]
    )
    return best, ambiguous


def _hit_payload(
    hit: GeocodeHit,
    *,
    fence_km: float | None,
    destination: str,
    ambiguous: bool,
) -> dict[str, Any]:
    conf = "medium"
    if (fence_km is None and destination.strip()) or ambiguous:
        conf = "low"
    return {
        "lat": hit.lat,
        "lng": hit.lng,
        "address": hit.address,
        "coord_confidence": conf,
        "coord_source": hit.coord_source,
    }


def geocode_place(
    name: str,
    destination: str = "",
    *,
    raise_on_provider_error: bool = False,
) -> dict[str, Any] | None:
    """批量编码用：失败默认返回 None。

    HTTP `/geocode/search` 应传 ``raise_on_provider_error=True``，
    避免上游全挂时被误报成 404。
    """
    key = _cache_key(name, destination)
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]

    try:
        # 多候选 + 名称/距离融合，减轻围栏内同名错点
        result = geocode_autocomplete(name, destination, limit=5)
        if not result.results:
            hit: dict[str, Any] | None = None
        else:
            bias, fence_km, _ = _bias_for_destination(destination)
            best, ambiguous = _pick_best_hit(
                name,
                result.results,
                center_lat=bias.lat if bias else None,
                center_lng=bias.lng if bias else None,
            )
            hit = _hit_payload(
                best,
                fence_km=fence_km,
                destination=destination,
                ambiguous=ambiguous,
            )
    except GeocodeProviderError as e:
        if raise_on_provider_error:
            raise
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
        result = geocode_autocomplete(name, destination, limit=5)
        out_of_fence = result.rejected_out_of_fence > 0 and not result.results
        if result.results:
            bias, fence_km, _ = _bias_for_destination(destination)
            first, ambiguous = _pick_best_hit(
                name,
                result.results,
                center_lat=bias.lat if bias else None,
                center_lng=bias.lng if bias else None,
            )
            hit = _hit_payload(
                first,
                fence_km=fence_km,
                destination=destination,
                ambiguous=ambiguous,
            )
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
