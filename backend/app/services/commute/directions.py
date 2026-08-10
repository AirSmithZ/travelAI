"""SerpApi Google Maps Directions client (TRN-01)."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.config import Settings, get_settings
from app.services.api_usage import record_usage

logger = logging.getLogger(__name__)

TransportMode = Literal["walk", "subway", "bus", "taxi", "flight", "ferry"]

# SerpApi travel_mode codes
_MODE_WALK = 2
_MODE_TRANSIT = 3
_MODE_DRIVE = 0
_MODE_BEST = 6


@dataclass(frozen=True)
class DirectionLeg:
    transport_mode: TransportMode
    duration_minutes: int
    distance_meters: int | None
    label: str
    summary: str
    fare_estimate: float | None = None
    currency: str | None = None


def _map_travel_mode(raw: str | None, prefer: str | None = None) -> TransportMode:
    s = (raw or prefer or "").strip().lower()
    if s in {"walking", "walk"}:
        return "walk"
    if s in {"driving", "drive", "taxi"}:
        return "taxi"
    if s in {"transit"}:
        return "subway"  # refined below from trips
    if s in {"subway", "metro", "rail", "train", "tram"}:
        return "subway"
    if s in {"bus"}:
        return "bus"
    if s in {"ferry", "boat"}:
        return "ferry"
    if s in {"flight", "flying"}:
        return "flight"
    return "taxi"


def _refine_transit_mode(direction: dict[str, Any]) -> TransportMode:
    trips = direction.get("trips") or []
    modes: list[str] = []
    for t in trips:
        if not isinstance(t, dict):
            continue
        tm = str(t.get("travel_mode") or "").lower()
        title = str(t.get("title") or "").lower()
        icon = str(t.get("icon") or "").lower()
        blob = f"{tm} {title} {icon}"
        if any(k in blob for k in ("subway", "metro", "mrt", "rail", "train", "tram")):
            modes.append("subway")
        elif "bus" in blob:
            modes.append("bus")
        elif any(k in blob for k in ("ferry", "boat")):
            modes.append("ferry")
        elif tm == "transit":
            modes.append("subway")
    if "ferry" in modes:
        return "ferry"
    if modes.count("bus") > modes.count("subway"):
        return "bus"
    if modes:
        return "subway"  # type: ignore[return-value]
    return "subway"


def _duration_minutes(direction: dict[str, Any]) -> int | None:
    dur = direction.get("duration")
    if isinstance(dur, (int, float)) and dur >= 0:
        # SerpApi samples use seconds
        if dur >= 180:  # ≥3 min in seconds heuristic
            return max(1, int(round(dur / 60.0)))
        # already minutes (small values)
        return max(1, int(round(dur)))
    formatted = str(direction.get("formatted_duration") or "")
    # "16 min" / "1 hr 1 min"
    hours = re.search(r"(\d+)\s*hr", formatted, re.I)
    mins = re.search(r"(\d+)\s*min", formatted, re.I)
    total = 0
    if hours:
        total += int(hours.group(1)) * 60
    if mins:
        total += int(mins.group(1))
    return total or None


def _distance_meters(direction: dict[str, Any]) -> int | None:
    d = direction.get("distance")
    if isinstance(d, (int, float)) and d >= 0:
        return int(d)
    return None


def _summarize(direction: dict[str, Any], mode: TransportMode) -> tuple[str, str]:
    via = str(direction.get("via") or "").strip()
    formatted = str(direction.get("formatted_duration") or "").strip()
    trips = direction.get("trips") or []
    line_bits: list[str] = []
    for t in trips:
        if isinstance(t, dict) and t.get("travel_mode") == "Transit" and t.get("title"):
            line_bits.append(str(t["title"]).strip())
        if len(line_bits) >= 2:
            break
    if line_bits:
        label = " / ".join(line_bits)[:48]
        summary = f"{mode} · {label}" + (f" · {formatted}" if formatted else "")
        return label, summary
    if via:
        return via[:48], f"{mode} · via {via}" + (f" · {formatted}" if formatted else "")
    return mode, f"{mode}" + (f" · {formatted}" if formatted else "")


def parse_directions_payload(data: dict[str, Any]) -> list[DirectionLeg]:
    """Normalize SerpApi google_maps_directions JSON into legs."""
    out: list[DirectionLeg] = []
    directions = data.get("directions") or []
    if not isinstance(directions, list):
        return out

    for direction in directions:
        if not isinstance(direction, dict):
            continue
        raw_mode = str(direction.get("travel_mode") or "")
        mode = _map_travel_mode(raw_mode)
        if mode == "subway" or raw_mode.lower() == "transit":
            mode = _refine_transit_mode(direction)
        minutes = _duration_minutes(direction)
        if minutes is None:
            continue
        dist = _distance_meters(direction)
        label, summary = _summarize(direction, mode)
        fare = direction.get("cost")
        fare_f = float(fare) if isinstance(fare, (int, float)) else None
        currency = direction.get("currency")
        currency_s = str(currency) if currency else None
        out.append(
            DirectionLeg(
                transport_mode=mode,
                duration_minutes=minutes,
                distance_meters=dist,
                label=label,
                summary=summary,
                fare_estimate=fare_f,
                currency=currency_s,
            )
        )
    return out


def _fetch_one(
    settings: Settings,
    *,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
    travel_mode: int,
) -> list[DirectionLeg]:
    from app.services.commute.cache import cache_get, cache_key, cache_set

    ck = cache_key(
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        travel_mode=travel_mode,
    )
    ttl = int(getattr(settings, "commute_cache_ttl_sec", 0) or 0)
    if ttl > 0:
        cached = cache_get(ck)
        if cached is not None:
            return cached

    key = (settings.serpapi_api_key or "").strip()
    if not key:
        return []
    base = (settings.serpapi_base_url or "https://serpapi.com").rstrip("/")
    params = {
        "engine": "google_maps_directions",
        "api_key": key,
        "start_coords": f"{start_lat},{start_lng}",
        "end_coords": f"{end_lat},{end_lng}",
        "travel_mode": str(travel_mode),
        "hl": "zh-cn",
    }
    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=float(settings.serpapi_timeout_sec or 20)) as client:
            resp = client.get(f"{base}/search", params=params)
            ms = int((time.perf_counter() - t0) * 1000)
            data = resp.json()
            if not isinstance(data, dict):
                record_usage("serpapi", "directions", ok=False, latency_ms=ms, error="bad_json")
                return []
            if data.get("error"):
                record_usage(
                    "serpapi",
                    "directions",
                    ok=False,
                    latency_ms=ms,
                    error=str(data.get("error"))[:200],
                )
                logger.info("serpapi directions error: %s", data.get("error"))
                return []
            legs = parse_directions_payload(data)
            record_usage("serpapi", "directions", ok=True, latency_ms=ms)
            if ttl > 0:
                cache_set(ck, legs, ttl)
            return legs
    except Exception as e:
        ms = int((time.perf_counter() - t0) * 1000)
        record_usage("serpapi", "directions", ok=False, latency_ms=ms, error=str(e)[:200])
        logger.info("serpapi directions failed: %s", e)
        return []


def select_travel_modes(straight_line_m: float) -> list[int]:
    """Cost control: 1–2 Directions calls based on straight-line distance."""
    if straight_line_m < 900:
        return [_MODE_WALK]
    if straight_line_m < 3500:
        return [_MODE_WALK, _MODE_TRANSIT]
    if straight_line_m < 12000:
        return [_MODE_TRANSIT, _MODE_DRIVE]
    return [_MODE_DRIVE, _MODE_TRANSIT]


def fetch_direction_legs(
    *,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
    straight_line_m: float,
    settings: Settings | None = None,
) -> tuple[list[DirectionLeg], list[str]]:
    cfg = settings or get_settings()
    warnings: list[str] = []
    if not cfg.serpapi_configured:
        warnings.append("未配置 SERPAPI_API_KEY，跳过 Directions")
        return [], warnings

    modes = select_travel_modes(straight_line_m)
    seen_modes: set[str] = set()
    legs: list[DirectionLeg] = []
    for tm in modes:
        batch = _fetch_one(
            cfg,
            start_lat=start_lat,
            start_lng=start_lng,
            end_lat=end_lat,
            end_lng=end_lng,
            travel_mode=tm,
        )
        for leg in batch:
            key = f"{leg.transport_mode}:{leg.duration_minutes}:{leg.distance_meters}"
            if key in seen_modes:
                continue
            seen_modes.add(key)
            legs.append(leg)

    if not legs:
        warnings.append("Directions 未返回可用路线（海路/山路等可能搜不到）")
    return legs, warnings
