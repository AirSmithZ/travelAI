"""In-process TTL cache for SerpApi Directions legs (TRN-02)."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.commute.directions import DirectionLeg

# key -> (expires_at_monotonic, legs as dict rows)
_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_MAX = 512


def clear_commute_cache() -> None:
    """Test / ops helper."""
    _CACHE.clear()


def cache_key(
    *,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
    travel_mode: int,
) -> str:
    # ~11m precision — enough to reuse nearby lookups
    return (
        f"{round(start_lat, 4)},{round(start_lng, 4)}"
        f"->{round(end_lat, 4)},{round(end_lng, 4)}:{travel_mode}"
    )


def cache_get(key: str) -> list[DirectionLeg] | None:
    from app.services.commute.directions import DirectionLeg

    row = _CACHE.get(key)
    if not row:
        return None
    expires_at, items = row
    if time.monotonic() >= expires_at:
        _CACHE.pop(key, None)
        return None
    out: list[DirectionLeg] = []
    for d in items:
        out.append(
            DirectionLeg(
                transport_mode=d["transport_mode"],
                duration_minutes=int(d["duration_minutes"]),
                distance_meters=d.get("distance_meters"),
                label=str(d.get("label") or ""),
                summary=str(d.get("summary") or ""),
                fare_estimate=d.get("fare_estimate"),
                currency=d.get("currency"),
            )
        )
    return out


def cache_set(key: str, legs: list[DirectionLeg], ttl_sec: int) -> None:
    if ttl_sec <= 0:
        return
    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.pop(next(iter(_CACHE)), None)
    rows = [
        {
            "transport_mode": leg.transport_mode,
            "duration_minutes": leg.duration_minutes,
            "distance_meters": leg.distance_meters,
            "label": leg.label,
            "summary": leg.summary,
            "fare_estimate": leg.fare_estimate,
            "currency": leg.currency,
        }
        for leg in legs
    ]
    _CACHE[key] = (time.monotonic() + float(ttl_sec), rows)
