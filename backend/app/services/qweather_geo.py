"""GEO-09: QWeather GeoAPI city lookup (center lat/lng only — not forecast)."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.config import Settings
from app.services.api_usage import record_usage

logger = logging.getLogger(__name__)


def lookup_city_center(
    destination: str,
    settings: Settings,
    *,
    timeout: float = 8.0,
) -> dict[str, Any] | None:
    """Return {lat, lng, country_code, name, query} or None.

    Uses GeoAPI /geo/v2/city/lookup — does not call weather forecast.
    """
    key = (settings.qweather_api_key or "").strip()
    if not key or not destination.strip():
        return None

    host = (settings.qweather_api_host or "https://devapi.qweather.com").rstrip("/")
    url = f"{host}/geo/v2/city/lookup"
    params = {
        "location": destination.strip(),
        "key": key,
        "number": 1,
        "lang": "zh",
    }
    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        ms = int((time.perf_counter() - t0) * 1000)
    except Exception as e:
        record_usage(
            "qweather",
            "geo_lookup",
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=str(e)[:200],
        )
        logger.warning("QWeather geo lookup failed for %s: %s", destination, e)
        return None

    if not isinstance(data, dict):
        record_usage("qweather", "geo_lookup", ok=False, latency_ms=ms, error="bad_json")
        return None
    code = str(data.get("code") or "")
    if code not in ("200", "204"):
        record_usage("qweather", "geo_lookup", ok=False, latency_ms=ms, error=f"code_{code}")
        logger.info("QWeather geo lookup code=%s for %s", code, destination)
        return None
    record_usage("qweather", "geo_lookup", ok=True, latency_ms=ms)

    locations = data.get("location")
    if not isinstance(locations, list) or not locations:
        return None
    item = locations[0]
    if not isinstance(item, dict):
        return None
    try:
        lat = float(item.get("lat"))
        lng = float(item.get("lon") or item.get("lng"))
    except (TypeError, ValueError):
        return None

    cc = str(item.get("country") or "").strip().lower()
    # QWeather may return ISO2 or Chinese; keep 2-letter if looks like ISO
    if len(cc) != 2:
        cc = ""

    loc_id = str(item.get("id") or "").strip() or None

    return {
        "lat": lat,
        "lng": lng,
        "country_code": cc or None,
        "name": str(item.get("name") or destination).strip(),
        "query": destination.strip(),
        "location_id": loc_id,
        "source": "qweather_geo",
    }
