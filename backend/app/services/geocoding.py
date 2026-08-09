import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.data.city_aliases import country_code_for_destination, normalize_city
from app.services.qweather_geo import lookup_city_center
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
# P81: 名称完全无关时宁可不写坐标，也不要塌到目的地中心
_MIN_ACCEPT_NAME_SCORE = 1.0
# 与目的地中心过近且名称弱匹配 → 视为城市中心误命中
_CITY_COLLAPSE_RADIUS_KM = 1.5

logger = logging.getLogger(__name__)

_GEOCODE_CACHE: dict[tuple[str, str, str], dict[str, Any] | None] = {}
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


def _city_query_suffixes(destination: str) -> list[str]:
    """目的地后缀：英译城市优先，再原文。"""
    city_norm = normalize_city(destination)
    dest = destination.strip()
    suffixes: list[str] = []
    if city_norm:
        suffixes.append(city_norm)
        en_short = city_norm.split(",")[0].strip()
        if en_short and en_short.lower() != city_norm.lower():
            suffixes.append(en_short)
    if dest and dest != city_norm:
        suffixes.append(dest)
    return suffixes


def build_query_variants(
    name: str,
    destination: str = "",
    *,
    name_en: str | None = None,
) -> list[str]:
    """生成 geocoder 检索串：优先英文官方名（P82）+ 城市后缀，再中文变体（GEO-09）。"""
    name = name.strip()
    en = (name_en or "").strip()
    if not name and not en:
        return []

    suffixes = _city_query_suffixes(destination)
    variants: list[str] = []

    def _append_label(label: str) -> None:
        if not label:
            return
        for suf in suffixes:
            variants.append(f"{label}, {suf}")
        variants.append(label)

    # English-first when LLM provided official name — SerpApi/Photon match better
    if en:
        _append_label(en)
    if name and name.lower() != en.lower():
        _append_label(name)

    seen: set[str] = set()
    out: list[str] = []
    for v in variants:
        key = v.lower()
        if key not in seen:
            seen.add(key)
            out.append(v)
    return out


def _query_aliases(name: str, name_en: str | None = None) -> list[str]:
    """名称评分用的别名列表（中英都算匹配）。"""
    aliases: list[str] = []
    for label in ((name_en or "").strip(), (name or "").strip()):
        if label and label.lower() not in {a.lower() for a in aliases}:
            aliases.append(label)
    return aliases


def resolve_destination_center(
    destination: str,
    *,
    settings: Settings | None = None,
) -> DestinationCenter | None:
    """解析目的地中心 lat/lng（优先和风 GeoAPI，再 geocode；进程内缓存）。"""
    raw = destination.strip()
    if not raw:
        return None

    cache_key = raw.lower()
    if cache_key in _DEST_CENTER_CACHE:
        return _DEST_CENTER_CACHE[cache_key]

    cfg = settings or get_settings()
    city_q = normalize_city(raw)
    alias_cc = country_code_for_destination(raw)

    center: DestinationCenter | None = None

    # GEO-09：和风城市中心（有 Key 时优先）
    qw = lookup_city_center(city_q or raw, cfg)
    if qw is None and city_q and city_q != raw:
        qw = lookup_city_center(raw, cfg)
    if qw is not None:
        center = DestinationCenter(
            lat=float(qw["lat"]),
            lng=float(qw["lng"]),
            country_code=qw.get("country_code") or alias_cc,
            query=city_q or raw,
        )
    else:
        bias = GeocodeBias(country_code=alias_cc) if alias_cc else None
        try:
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
    name_en: str | None = None,
) -> AutocompleteResult:
    queries = build_query_variants(name, destination, name_en=name_en)
    if not queries:
        return AutocompleteResult(results=[], warnings=["搜索关键词为空"])

    cfg = settings or get_settings()
    bias, fence_km, setup_warnings = _bias_for_destination(destination, settings=cfg)
    dest = destination.strip()
    # 有目的地时永不允许「无围栏裸名全球 Top1」；仅无 destination 时才放开
    allow_bare = not dest and fence_km is None
    bare = (name_en or "").strip() or name.strip()
    outcome = run_autocomplete(
        queries,
        limit=limit,
        settings=cfg,
        bias=bias,
        fence_km=fence_km,
        bare_query=bare,
        allow_bare_without_fence=allow_bare,
    )
    if setup_warnings:
        outcome.warnings = [*setup_warnings, *outcome.warnings]
    return outcome


def _cache_key(name: str, destination: str, name_en: str = "") -> tuple[str, str, str]:
    return (
        name.strip().lower(),
        destination.strip().lower(),
        (name_en or "").strip().lower(),
    )


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
    # token overlap for multi-word / mixed CN-EN
    q_tokens = [t for t in q.replace(",", " ").split() if len(t) >= 2]
    if q_tokens and n:
        hits = sum(1 for t in q_tokens if t in n or t in a)
        if hits >= max(1, len(q_tokens) // 2):
            return 1.5
    if q in a:
        return 1.0
    return 0.0


def _name_relevance_aliases(
    aliases: list[str],
    hit_name: str,
    hit_address: str,
) -> float:
    if not aliases:
        return 0.0
    return max(_name_relevance(a, hit_name, hit_address) for a in aliases)


def _is_destination_label(text: str, destination: str) -> bool:
    t = (text or "").strip().lower()
    d = (destination or "").strip().lower()
    if not t or not d:
        return False
    if t == d:
        return True
    # "Singapore" / "新加坡" / "Singapore City"
    if d in t or t in d:
        return len(t) <= max(len(d) + 8, 16)
    return False


def _is_city_collapse_hit(
    aliases: list[str],
    hit: GeocodeHit,
    *,
    destination: str,
    center_lat: float | None,
    center_lng: float | None,
    category: str | None,
) -> bool:
    """True when hit is likely the city centroid rather than the POI."""
    name_s = _name_relevance_aliases(aliases, hit.name, hit.address)
    dest = (destination or "").strip().lower()
    primary = (aliases[0] if aliases else "").strip().lower()

    # Strong POI name match — keep even if near center (e.g. downtown hotel)
    if name_s >= 2.0:
        return False

    # Hit titled as the destination while query is a more specific place
    if dest and primary and primary != dest and (
        _is_destination_label(hit.name, destination)
        or _is_destination_label(hit.address.split(",")[0] if hit.address else "", destination)
    ):
        return True

    # Near city center + weak/no name match → classic collapse (many POIs → one point)
    if (
        center_lat is not None
        and center_lng is not None
        and name_s < _MIN_ACCEPT_NAME_SCORE
    ):
        dist = haversine_km(center_lat, center_lng, hit.lat, hit.lng)
        if dist <= _CITY_COLLAPSE_RADIUS_KM:
            return True

    # Zero relevance anywhere: do not accept (better manual pick than wrong shared point)
    if name_s < _MIN_ACCEPT_NAME_SCORE and category not in ("airport", "transit"):
        return True

    return False


def _candidate_score(
    aliases: list[str],
    hit: GeocodeHit,
    *,
    center_lat: float | None,
    center_lng: float | None,
) -> float:
    """名称相关性为主；距离仅作弱惩罚（避免名称 0 分时「离中心最近」赢）。"""
    name_score = _name_relevance_aliases(aliases, hit.name, hit.address)
    if name_score <= 0:
        # P81: no name signal → heavily penalize; distance must not elect city center
        return -100.0
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
    destination: str = "",
    category: str | None = None,
    query_aliases: list[str] | None = None,
) -> tuple[GeocodeHit | None, bool]:
    """选融合分最高且非城市塌缩的候选；无合格命中返回 (None, False)。"""
    if not hits:
        return None, False

    aliases = list(query_aliases) if query_aliases else [query]
    aliases = [a for a in aliases if (a or "").strip()]
    if not aliases:
        aliases = [query]

    scored = [
        (
            _candidate_score(aliases, h, center_lat=center_lat, center_lng=center_lng),
            _name_relevance_aliases(aliases, h.name, h.address),
            h,
        )
        for h in hits
    ]
    scored.sort(key=lambda t: t[0], reverse=True)

    for _fused, name_s, hit in scored:
        if _is_city_collapse_hit(
            aliases,
            hit,
            destination=destination,
            center_lat=center_lat,
            center_lng=center_lng,
            category=category,
        ):
            continue
        if name_s < _MIN_ACCEPT_NAME_SCORE and category not in ("airport", "transit"):
            continue
        ambiguous = any(
            abs(name_s - other_name) <= _GEOCODE_AMBIGUOUS_NAME_GAP
            for _, other_name, other in scored
            if other is not hit and other_name >= _MIN_ACCEPT_NAME_SCORE
        )
        return hit, ambiguous

    return None, False


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
    # P81: never overwrite LLM/user node name with provider title
    return {
        "lat": hit.lat,
        "lng": hit.lng,
        "address": hit.address,
        "coord_confidence": conf,
        "coord_source": hit.coord_source,
        "place_id": hit.place_id or "",
        "geocode_label": hit.name,
    }


def _wikidata_fallback(
    name: str,
    *,
    name_en: str | None,
    destination: str,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    """P82: SerpApi/Photon/Nominatim 失败时用 Wikidata P625 补坐标。"""
    from app.services.wikidata_geo import resolve_wikidata_place

    cfg = settings or get_settings()
    hit = resolve_wikidata_place(name, label_en=name_en, settings=cfg)
    if not hit:
        return None
    # Fence check against destination center when available
    bias, fence_km, _ = _bias_for_destination(destination, settings=cfg)
    if bias and bias.lat is not None and bias.lng is not None and fence_km:
        dist = haversine_km(bias.lat, bias.lng, float(hit["lat"]), float(hit["lng"]))
        if dist > float(fence_km):
            logger.info(
                "wikidata hit out of fence for %r (%.1fkm > %.1fkm)",
                name,
                dist,
                fence_km,
            )
            return None
    return hit


def geocode_place(
    name: str,
    destination: str = "",
    *,
    raise_on_provider_error: bool = False,
    name_en: str | None = None,
) -> dict[str, Any] | None:
    """批量编码用：失败默认返回 None。

    HTTP `/geocode/search` 应传 ``raise_on_provider_error=True``，
    避免上游全挂时被误报成 404。
    """
    en = (name_en or "").strip()
    key = _cache_key(name, destination, en)
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]

    aliases = _query_aliases(name, en)
    try:
        # 多候选 + 名称/距离融合，减轻围栏内同名错点
        result = geocode_autocomplete(name, destination, limit=5, name_en=en or None)
        if not result.results:
            hit: dict[str, Any] | None = None
        else:
            bias, fence_km, _ = _bias_for_destination(destination)
            best, ambiguous = _pick_best_hit(
                name,
                result.results,
                center_lat=bias.lat if bias else None,
                center_lng=bias.lng if bias else None,
                destination=destination,
                query_aliases=aliases,
            )
            hit = (
                _hit_payload(
                    best,
                    fence_km=fence_km,
                    destination=destination,
                    ambiguous=ambiguous,
                )
                if best is not None
                else None
            )
        if hit is None:
            hit = _wikidata_fallback(name, name_en=en or None, destination=destination)
    except GeocodeProviderError as e:
        if raise_on_provider_error:
            raise
        logger.warning("geocode_place failed for %s: %s", name, e)
        hit = _wikidata_fallback(name, name_en=en or None, destination=destination)

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


def _apply_hit_fields(node: dict[str, Any], hit: dict[str, Any]) -> None:
    """Apply geocode fields without clobbering the itinerary node display name."""
    for key, value in hit.items():
        if key == "name":
            continue
        node[key] = value


def _apply_geocode_to_node(node: dict[str, Any], destination: str) -> _GeocodeNodeOutcome:
    name = str(node.get("name", "") or "")
    name_en = str(node.get("name_en") or "").strip()
    category = str(node.get("category") or "") or None
    aliases = _query_aliases(name, name_en or None)
    key = _cache_key(name, destination, name_en)
    if key in _GEOCODE_CACHE:
        cached = _GEOCODE_CACHE[key]
        if cached:
            _apply_hit_fields(node, cached)
            return _GeocodeNodeOutcome(name=name, ok=True)
        node["coord_confidence"] = "low"
        return _GeocodeNodeOutcome(name=name, ok=False)

    try:
        result = geocode_autocomplete(
            name, destination, limit=5, name_en=name_en or None
        )
        out_of_fence = result.rejected_out_of_fence > 0 and not result.results
        hit: dict[str, Any] | None = None
        if result.results:
            bias, fence_km, _ = _bias_for_destination(destination)
            first, ambiguous = _pick_best_hit(
                name,
                result.results,
                center_lat=bias.lat if bias else None,
                center_lng=bias.lng if bias else None,
                destination=destination,
                category=category,
                query_aliases=aliases,
            )
            if first is not None:
                hit = _hit_payload(
                    first,
                    fence_km=fence_km,
                    destination=destination,
                    ambiguous=ambiguous,
                )
        if hit is None:
            hit = _wikidata_fallback(
                name, name_en=name_en or None, destination=destination
            )
            if hit is None and out_of_fence:
                node["coord_confidence"] = "low"
                if len(_GEOCODE_CACHE) >= _GEOCODE_CACHE_MAX:
                    _GEOCODE_CACHE.pop(next(iter(_GEOCODE_CACHE)))
                _GEOCODE_CACHE[key] = None
                return _GeocodeNodeOutcome(name=name, ok=False, out_of_fence=True)
        if hit is not None:
            _apply_hit_fields(node, hit)
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
        hit = _wikidata_fallback(
            name, name_en=name_en or None, destination=destination
        )
        if hit is not None:
            _apply_hit_fields(node, hit)
            if len(_GEOCODE_CACHE) >= _GEOCODE_CACHE_MAX:
                _GEOCODE_CACHE.pop(next(iter(_GEOCODE_CACHE)))
            _GEOCODE_CACHE[key] = hit
            return _GeocodeNodeOutcome(name=name, ok=True)
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

    collapse_n = _count_coord_collapses(itinerary)
    if collapse_n >= 2:
        warn_msgs.append(
            f"{collapse_n} 个节点坐标过近（可能仍有误定位），请在地图核对或点选校正"
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


def _count_coord_collapses(itinerary: dict[str, Any], *, radius_km: float = 0.08) -> int:
    """Count non-hotel nodes that share nearly identical coords with another node."""
    points: list[tuple[float, float, str]] = []
    for day in itinerary.get("days") or []:
        for node in day.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            if node.get("category") == "hotel":
                continue
            if not _has_valid_coords(node):
                continue
            points.append((float(node["lat"]), float(node["lng"]), str(node.get("name") or "")))
    collapsed = 0
    for i, (lat, lng, _) in enumerate(points):
        for j in range(i + 1, len(points)):
            lat2, lng2, _ = points[j]
            if haversine_km(lat, lng, lat2, lng2) <= radius_km:
                collapsed += 1
                break
    return collapsed
