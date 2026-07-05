"""住宿片区 hub 确定性打分（P5z-b）。"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

from app.services.stay_zone.segment import StaySegment

SPLIT_THRESHOLD_KM = 8.0
DEFAULT_RADIUS_M = 800.0
MIN_RADIUS_M = 600.0
MAX_RADIUS_M = 1200.0

_TRANSIT_KEYWORDS = re.compile(
    r"mrt|metro|subway|地铁|轻轨|bts|jr|station|枢纽|换乘",
    re.IGNORECASE,
)


@dataclass
class ScoredHub:
    lat: float
    lng: float
    query: str
    score: float
    address: str | None = None


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, a)))


def _parse_duration_hours(start: str | None, end: str | None) -> float:
    if not start or not end:
        return 1.0
    try:
        sh, sm = (int(x) for x in start.split(":")[:2])
        eh, em = (int(x) for x in end.split(":")[:2])
        mins = (eh * 60 + em) - (sh * 60 + sm)
        if mins <= 0:
            return 1.0
        return max(0.5, mins / 60.0)
    except (ValueError, TypeError):
        return 1.0


def _node_weight(node: dict[str, Any]) -> float:
    cat = node.get("category")
    if cat in ("airport", "transit"):
        return 0.3
    return _parse_duration_hours(node.get("start_time"), node.get("end_time"))


def day_weighted_centroid(itinerary: dict[str, Any] | None, day_index: int) -> tuple[float, float] | None:
    if not itinerary:
        return None
    days = itinerary.get("days") or []
    if day_index < 0 or day_index >= len(days):
        return None
    day = days[day_index]
    lat_sum = lng_sum = weight_sum = 0.0
    for node in day.get("nodes") or []:
        lat, lng = node.get("lat"), node.get("lng")
        if lat is None or lng is None:
            continue
        if abs(lat) < 0.01 and abs(lng) < 0.01:
            continue
        w = _node_weight(node)
        lat_sum += lat * w
        lng_sum += lng * w
        weight_sum += w
    if weight_sum <= 0:
        return None
    return lat_sum / weight_sum, lng_sum / weight_sum


def _activity_component(
    hub_lat: float,
    hub_lng: float,
    segment: StaySegment,
    itinerary: dict[str, Any] | None,
) -> float:
    dists: list[float] = []
    for day_idx in segment.day_indices:
        c = day_weighted_centroid(itinerary, day_idx)
        if c:
            dists.append(haversine_km(hub_lat, hub_lng, c[0], c[1]))
    if not dists:
        return 40.0
    avg = sum(dists) / len(dists)
    return max(0.0, 100.0 - avg * 8.0)


def _transit_component(query: str, prefs: dict[str, Any] | None) -> float:
    w = float((prefs or {}).get("transit", 1.0))
    bonus = 15.0 if _TRANSIT_KEYWORDS.search(query) else 5.0
    return w * bonus


def _flight_component(
    hub_lat: float,
    hub_lng: float,
    segment: StaySegment,
    itinerary: dict[str, Any] | None,
    flights: list[dict[str, Any]],
) -> float:
    if not flights or not segment.day_indices:
        return 0.0
    score = 0.0
    first_idx = min(segment.day_indices)
    last_idx = max(segment.day_indices)
    for flight in flights:
        role = flight.get("role")
        dest = flight.get("dest_iata") or flight.get("destination")
        origin = flight.get("origin_iata") or flight.get("origin")
        for day_idx, airport_query in (
            (first_idx, f"{dest or origin} airport"),
            (last_idx, f"{origin or dest} airport"),
        ):
            if role == "intercity" and day_idx != first_idx:
                continue
            airport = _find_airport_coords(itinerary, day_idx, airport_query)
            if not airport:
                continue
            dist = haversine_km(hub_lat, hub_lng, airport[0], airport[1])
            if dist < 25:
                score += max(0.0, 25.0 - dist)
    return score


def _find_airport_coords(
    itinerary: dict[str, Any] | None,
    day_index: int,
    fallback_query: str,
) -> tuple[float, float] | None:
    if not itinerary:
        return None
    days = itinerary.get("days") or []
    if day_index < 0 or day_index >= len(days):
        return None
    for node in days[day_index].get("nodes") or []:
        if node.get("category") == "airport":
            lat, lng = node.get("lat"), node.get("lng")
            if lat is not None and lng is not None:
                return float(lat), float(lng)
    return None


def _preference_component(prefs: dict[str, Any] | None) -> float:
    if not prefs:
        return 0.0
    score = 0.0
    if prefs.get("minimize_hotel_moves"):
        score += 10.0
    if prefs.get("safety_sensitive"):
        score += 5.0
    if prefs.get("quiet"):
        score += float(prefs["quiet"]) * 3.0
    if prefs.get("family_friendly"):
        score += float(prefs["family_friendly"]) * 3.0
    return score


def score_hub(
    hub_lat: float,
    hub_lng: float,
    *,
    query: str = "",
    segment: StaySegment,
    itinerary: dict[str, Any] | None,
    flights: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
) -> float:
    """分数越高越适合作为住宿 hub。"""
    return (
        _activity_component(hub_lat, hub_lng, segment, itinerary)
        + _transit_component(query, prefs)
        + _flight_component(hub_lat, hub_lng, segment, itinerary, flights or [])
        + _preference_component(prefs)
    )


def pick_best_geocoded_hub(
    candidates: list[ScoredHub],
) -> ScoredHub | None:
    if not candidates:
        return None
    return max(candidates, key=lambda h: h.score)


def rank_anchor_hints(
    hints: list[str],
    destination: str,
    segment: StaySegment,
    itinerary: dict[str, Any] | None,
    flights: list[dict[str, Any]] | None,
    prefs: dict[str, Any] | None,
    geocode_fn,
) -> ScoredHub | None:
    """Geocode 各 anchor_hint 并按 score 取最优。"""
    scored: list[ScoredHub] = []
    for hint in hints:
        if not hint or not str(hint).strip():
            continue
        hit = geocode_fn(str(hint).strip(), destination)
        if not hit:
            continue
        lat, lng = float(hit["lat"]), float(hit["lng"])
        s = score_hub(
            lat,
            lng,
            query=str(hint),
            segment=segment,
            itinerary=itinerary,
            flights=flights,
            prefs=prefs,
        )
        scored.append(
            ScoredHub(
                lat=lat,
                lng=lng,
                query=str(hint),
                score=s,
                address=hit.get("address"),
            )
        )
    return pick_best_geocoded_hub(scored)


def compute_zone_radius_m(
    hub_lat: float,
    hub_lng: float,
    zone: dict[str, Any],
    itinerary: dict[str, Any] | None,
    *,
    default_radius_m: float = DEFAULT_RADIUS_M,
) -> float:
    """按覆盖日内最远 POI 估算 circle 半径。"""
    covers = zone.get("covers_day_indices") or []
    if not itinerary or not covers:
        return default_radius_m

    max_dist_km = 0.0
    days = itinerary.get("days") or []
    for day_idx in covers:
        if day_idx < 0 or day_idx >= len(days):
            continue
        for node in days[day_idx].get("nodes") or []:
            lat, lng = node.get("lat"), node.get("lng")
            if lat is None or lng is None:
                continue
            if abs(lat) < 0.01 and abs(lng) < 0.01:
                continue
            if node.get("category") in ("airport", "transit"):
                continue
            max_dist_km = max(max_dist_km, haversine_km(hub_lat, hub_lng, float(lat), float(lng)))

    if max_dist_km <= 0:
        return default_radius_m
    radius = max_dist_km * 1000.0 * 1.15
    return float(max(MIN_RADIUS_M, min(MAX_RADIUS_M, radius)))


def detect_split_warnings(
    segment: StaySegment,
    itinerary: dict[str, Any] | None,
) -> list[str]:
    """相邻天 centroid 距离超阈值时提示可考虑分段换住。"""
    if not itinerary or len(segment.day_indices) < 2:
        return []
    warnings: list[str] = []
    indices = sorted(segment.day_indices)
    for i in range(len(indices) - 1):
        a, b = indices[i], indices[i + 1]
        ca = day_weighted_centroid(itinerary, a)
        cb = day_weighted_centroid(itinerary, b)
        if not ca or not cb:
            continue
        dist = haversine_km(ca[0], ca[1], cb[0], cb[1])
        if dist >= SPLIT_THRESHOLD_KM:
            warnings.append(
                f"Day {a + 1} 与 Day {b + 1} 活动重心相距约 {dist:.1f}km，"
                "可考虑分段换住或接受折中片区"
            )
    return warnings
