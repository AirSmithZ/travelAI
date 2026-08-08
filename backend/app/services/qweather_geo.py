"""GEO-09: QWeather GeoAPI city lookup (center lat/lng only — not forecast)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import Settings

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
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("QWeather geo lookup failed for %s: %s", destination, e)
        return None

    if not isinstance(data, dict):
        return None
    code = str(data.get("code") or "")
    if code not in ("200", "204"):
        logger.info("QWeather geo lookup code=%s for %s", code, destination)
        return None

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

    return {
        "lat": lat,
        "lng": lng,
        "country_code": cc or None,
        "name": str(item.get("name") or destination).strip(),
        "query": destination.strip(),
        "source": "qweather_geo",
    }
