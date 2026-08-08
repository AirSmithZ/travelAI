"""HOT-02: lodging candidates near a stay-zone hub via SerpApi Google Maps."""

from __future__ import annotations

import logging
import math
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def search_lodging_near(
    *,
    lat: float,
    lng: float,
    city: str,
    label: str = "",
    settings: Settings,
    limit: int = 8,
    radius_m: float = 1200.0,
) -> list[dict[str, Any]]:
    """Return lodging-like places sorted by distance to hub. Price via deep link only."""
    key = (settings.serpapi_api_key or "").strip()
    if not key:
        return []

    q = f"hotel {label or city}".strip()
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
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("lodging search failed: %s", e)
        return []

    if not isinstance(data, dict) or data.get("error"):
        return []

    raw_items: list[dict[str, Any]] = []
    place = data.get("place_results")
    if isinstance(place, dict):
        raw_items.append(place)
    local = data.get("local_results")
    if isinstance(local, list):
        raw_items.extend(x for x in local if isinstance(x, dict))

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
        if dist > radius_m * 1.5:
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
