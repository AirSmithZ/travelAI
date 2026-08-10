"""GEO-09: QWeather GeoAPI city lookup (center lat/lng only — not forecast)."""

from __future__ import annotations

import logging
from typing import Any

from app.config import Settings
from app.services.api_usage import record_usage
from app.services.qweather_client import qweather_api_key, qweather_get_json

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
    if not qweather_api_key(settings) or not destination.strip():
        return None

    data, ms, err = qweather_get_json(
        "/geo/v2/city/lookup",
        settings=settings,
        params={
            "location": destination.strip(),
            "number": 1,
            "lang": "zh",
        },
        timeout=timeout,
    )
    if err or not data:
        record_usage(
            "qweather",
            "geo_lookup",
            ok=False,
            latency_ms=ms,
            error=(err or "empty")[:200],
        )
        if err and err != "unconfigured":
            logger.warning("QWeather geo lookup failed for %s: %s", destination, err)
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
