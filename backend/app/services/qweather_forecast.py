"""WX-01: QWeather daily forecast → DayWeather (soft-fail)."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from app.config import Settings
from app.services.api_usage import record_usage
from app.services.qweather_client import qweather_api_key, qweather_get_json
from app.services.qweather_geo import lookup_city_center
from app.services.weather_tool import WEATHER_ICONS

logger = logging.getLogger(__name__)

# QWeather icon code ranges → project WeatherIcon
_ICON_CODE_MAP_PREFIX: list[tuple[tuple[int, int], str]] = [
    ((100, 100), "sunny"),
    ((101, 103), "cloudy"),
    ((104, 104), "overcast"),
    ((150, 151), "sunny"),
    ((152, 153), "cloudy"),
    ((300, 301), "rain"),
    ((302, 304), "storm"),
    ((305, 399), "rain"),
    ((400, 499), "snow"),
    ((500, 515), "overcast"),
    ((900, 901), "sunny"),
]


def map_qweather_icon(icon_code: str | int | None, text: str = "") -> str:
    """Map QWeather iconDay / textDay to sunny|cloudy|overcast|rain|storm|snow."""
    t = (text or "").strip()
    if any(k in t for k in ("雷", "强对流", "冰雹")):
        return "storm"
    if "雪" in t or "冰针" in t:
        return "snow"
    if any(k in t for k in ("雨", "毛毛", "阵雨", "雷阵雨")):
        return "storm" if "雷" in t else "rain"
    if any(k in t for k in ("阴", "雾", "霾", "沙", "尘")):
        return "overcast"
    if "晴" in t or "热" in t:
        return "sunny"
    if any(k in t for k in ("多云", "少云", "晴间多云")):
        return "cloudy"

    try:
        code = int(str(icon_code).strip())
    except (TypeError, ValueError):
        return "cloudy"
    for (lo, hi), icon in _ICON_CODE_MAP_PREFIX:
        if lo <= code <= hi:
            return icon
    return "cloudy"


def _pick_days_span(*, date_start: date, day_count: int, today: date | None = None) -> str:
    """Choose 3d/7d/10d/15d/30d so the window covers trip end from *today*."""
    today = today or date.today()
    n_days = max(1, min(int(day_count or 3), 30))
    trip_end = date_start + timedelta(days=n_days - 1)
    # API daily series starts from "today"; need enough days to reach trip_end.
    needed = (trip_end - today).days + 1
    if needed < n_days:
        needed = n_days
    n = max(1, min(needed, 30))
    if n <= 3:
        return "3d"
    if n <= 7:
        return "7d"
    if n <= 10:
        return "10d"
    if n <= 15:
        return "15d"
    return "30d"


def _parse_daily_row(row: dict[str, Any]) -> dict[str, Any] | None:
    fx = str(row.get("fxDate") or "").strip()[:10]
    if not fx:
        return None
    text = str(row.get("textDay") or row.get("text") or "").strip()
    icon_code = row.get("iconDay") or row.get("icon")
    icon = map_qweather_icon(icon_code, text)
    if icon not in WEATHER_ICONS:
        icon = "cloudy"
    try:
        t_min = int(float(row.get("tempMin")))
        t_max = int(float(row.get("tempMax")))
    except (TypeError, ValueError):
        t_min, t_max = 22, 30
    desc = text or icon
    return {
        "date": fx,
        "temp_min": t_min,
        "temp_max": t_max,
        "icon": icon,
        "description": desc,
        "source": "api",
        "provider": "qweather",
    }


def fetch_trip_forecast(
    destination: str,
    date_start: date,
    day_count: int,
    settings: Settings,
    *,
    timeout: float = 10.0,
) -> list[dict[str, Any]]:
    """
    Fetch daily forecast for trip dates. Soft-fails → [].

    Returns list of {date, temp_min, temp_max, icon, description, source}.
    Dates outside API window are omitted (caller keeps LLM weather).
    """
    key = qweather_api_key(settings)
    dest = (destination or "").strip()
    if not key or not dest:
        return []

    city = lookup_city_center(dest, settings, timeout=timeout)
    if not city:
        return []

    loc = city.get("location_id")
    if not loc and city.get("lat") is not None and city.get("lng") is not None:
        # QWeather: location=lng,lat
        loc = f"{float(city['lng']):.2f},{float(city['lat']):.2f}"
    if not loc:
        return []

    span = _pick_days_span(date_start=date_start, day_count=day_count)
    data, ms, err = qweather_get_json(
        f"/v7/weather/{span}",
        settings=settings,
        params={"location": loc, "lang": "zh"},
        timeout=timeout,
    )
    if err or not data:
        record_usage(
            "qweather",
            "forecast",
            ok=False,
            latency_ms=ms,
            error=(err or "empty")[:200],
        )
        if err and err != "unconfigured":
            logger.warning("QWeather forecast failed for %s: %s", dest, err)
        return []

    if str(data.get("code") or "") != "200":
        code = data.get("code")
        record_usage("qweather", "forecast", ok=False, latency_ms=ms, error=f"code_{code}")
        logger.info("QWeather forecast code=%s for %s", code, dest)
        return []
    record_usage("qweather", "forecast", ok=True, latency_ms=ms)

    daily = data.get("daily")
    if not isinstance(daily, list):
        return []

    by_date: dict[str, dict[str, Any]] = {}
    for row in daily:
        if not isinstance(row, dict):
            continue
        parsed = _parse_daily_row(row)
        if parsed:
            by_date[parsed["date"]] = parsed

    out: list[dict[str, Any]] = []
    n = max(1, min(int(day_count or 3), 30))
    for i in range(n):
        d = (date_start + timedelta(days=i)).isoformat()
        if d in by_date:
            out.append(by_date[d])
    return out
