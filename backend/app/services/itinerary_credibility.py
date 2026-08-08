"""玩法可信度：预报覆盖、雨日室外审计、通勤粗校验（WX-01 / commute soft）。"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.geocode_providers import haversine_km
from app.services.weather_tool import WEATHER_ICONS

logger = logging.getLogger(__name__)

_OUTDOOR_CATS = frozenset({"attraction", "landmark"})
_WET_ICONS = frozenset({"rain", "storm", "snow"})

# Rough city-walk heuristics (not routing)
_COMMUTE_KM_WARN = 12.0
_COMMUTE_MOVE_MIN_WARN = 180
_WALK_KMH = 4.5


def format_weather_constraints_block(forecast: list[dict[str, Any]] | None) -> str:
    if not forecast:
        return ""
    compact = [
        {
            "date": f.get("date"),
            "icon": f.get("icon"),
            "temp_min": f.get("temp_min"),
            "temp_max": f.get("temp_max"),
            "description": f.get("description"),
        }
        for f in forecast
        if isinstance(f, dict) and f.get("date")
    ]
    if not compact:
        return ""
    wet = [f["date"] for f in compact if f.get("icon") in _WET_ICONS]
    wet_note = ""
    if wet:
        wet_note = (
            f"预报有雨/雪的日期：{', '.join(wet)} — "
            "这些天优先室内或有顶棚景点，并在 tips 写一句雨备；"
            "勿把整天排成纯露天连走。\n"
        )
    return (
        "\n\n===== BEGIN WEATHER（API 预报，软约束；排程应参考）=====\n"
        "下列天气来自气象 API（source=api）。生成 days[].weather 时优先采用这些数值与 icon；\n"
        f"{wet_note}"
        f"{json.dumps(compact, ensure_ascii=False)}\n"
        "===== END WEATHER ====="
    )


def format_poi_fact_block(poi_candidates: list[dict[str, Any]] | None) -> str:
    """Soft fact signals from Places enrich (types / rating / hours)."""
    if not poi_candidates:
        return ""
    rows: list[dict[str, Any]] = []
    for p in poi_candidates:
        if not isinstance(p, dict) or not p.get("verified") or not p.get("name"):
            continue
        row: dict[str, Any] = {"name": p.get("name")}
        if p.get("place_types"):
            row["types"] = list(p.get("place_types") or [])[:3]
        if p.get("rating") is not None:
            row["rating"] = p.get("rating")
        if p.get("hours_text"):
            row["hours"] = str(p.get("hours_text"))[:120]
        if p.get("open_state"):
            row["open_state"] = str(p.get("open_state"))[:80]
        if len(row) > 1:
            rows.append(row)
        if len(rows) >= 8:
            break
    if not rows:
        return ""
    return (
        "\n\n===== BEGIN POI_FACTS（类型/评分/营业信息，可能过时；软参考）=====\n"
        "开放时间未核验官方页前勿写成硬保证；冲突时以 HARD CONSTRAINTS 为准。\n"
        f"{json.dumps(rows, ensure_ascii=False)}\n"
        "===== END POI_FACTS ====="
    )


def apply_forecast_to_itinerary(
    itinerary: dict[str, Any],
    forecast: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Overlay API weather onto matching days (authoritative vs LLM guess)."""
    if not forecast:
        return itinerary
    by_date = {
        str(f.get("date"))[:10]: f
        for f in forecast
        if isinstance(f, dict) and f.get("date")
    }
    if not by_date:
        return itinerary
    applied = 0
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        d = str(day.get("date") or "")[:10]
        w = by_date.get(d)
        if not w:
            continue
        icon = str(w.get("icon") or "cloudy").lower()
        if icon not in WEATHER_ICONS:
            icon = "cloudy"
        day["weather"] = {
            "temp_min": int(w.get("temp_min", 22)),
            "temp_max": int(w.get("temp_max", 30)),
            "icon": icon,
            "description": str(w.get("description") or icon),
            "source": "api",
        }
        applied += 1
    if applied:
        meta = itinerary.setdefault("meta", {})
        warnings = list(meta.get("warnings") or [])
        note = f"已写入 {applied} 天 API 天气预报"
        if note not in warnings:
            warnings.append(note)
        meta["warnings"] = warnings
        meta["weather_source"] = "qweather"
    return itinerary


def audit_rain_outdoor_days(itinerary: dict[str, Any]) -> list[str]:
    """Warn when wet forecast days are packed with outdoor attractions."""
    notes: list[str] = []
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        weather = day.get("weather") or {}
        icon = str(weather.get("icon") or "").lower()
        if icon not in _WET_ICONS:
            continue
        outdoor = [
            n
            for n in (day.get("nodes") or [])
            if isinstance(n, dict)
            and str(n.get("category") or "") in _OUTDOOR_CATS
            and not n.get("is_optional")
        ]
        if len(outdoor) >= 3:
            idx = day.get("day_index") or "?"
            names = "、".join(str(n.get("name") or "") for n in outdoor[:3])
            notes.append(
                f"第{idx}天预报偏雨雪，仍排了较多室外点（如 {names}），建议备室内替代"
            )
    return notes


def _node_coords(node: dict[str, Any]) -> tuple[float, float] | None:
    try:
        lat = float(node.get("lat"))
        lng = float(node.get("lng"))
    except (TypeError, ValueError):
        return None
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        return None
    if lat < -90 or lat > 90 or lng < -180 or lng > 180:
        return None
    return lat, lng


def audit_commute_load(itinerary: dict[str, Any]) -> list[str]:
    """
    Rough day load from haversine path + edge durations.
    Runs best after geocode; still useful with LLM edge minutes only.
    """
    notes: list[str] = []
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        nodes = [n for n in (day.get("nodes") or []) if isinstance(n, dict)]
        if len(nodes) < 2:
            continue
        path_km = 0.0
        coords_used = 0
        for i in range(1, len(nodes)):
            a, b = _node_coords(nodes[i - 1]), _node_coords(nodes[i])
            if a and b:
                path_km += haversine_km(a[0], a[1], b[0], b[1])
                coords_used += 1

        edge_min = 0
        for e in day.get("edges") or []:
            if not isinstance(e, dict):
                continue
            if str(e.get("type") or "primary") == "alternative":
                continue
            try:
                edge_min += int(e.get("duration_minutes") or 0)
            except (TypeError, ValueError):
                pass

        move_from_km = int(path_km / _WALK_KMH * 60) if coords_used else 0
        move_min = max(edge_min, move_from_km)

        idx = day.get("day_index") or "?"
        if path_km >= _COMMUTE_KM_WARN:
            notes.append(
                f"第{idx}天景点直线路程约 {path_km:.1f} km，偏满，建议拆天或加交通"
            )
        elif move_min >= _COMMUTE_MOVE_MIN_WARN:
            notes.append(
                f"第{idx}天交通合计约 {move_min} 分钟，节奏偏紧，留意体力与衔接"
            )
    return notes


def append_credibility_warnings(
    itinerary: dict[str, Any],
    extra: list[str],
) -> dict[str, Any]:
    if not extra:
        return itinerary
    meta = itinerary.setdefault("meta", {})
    warnings = list(meta.get("warnings") or [])
    for w in extra:
        if w and w not in warnings:
            warnings.append(w)
    meta["warnings"] = warnings
    return itinerary


def enrich_itinerary_credibility(
    itinerary: dict[str, Any],
    forecast: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Apply forecast overlay + soft audits (call after LLM; again after geocode if needed)."""
    itinerary = apply_forecast_to_itinerary(itinerary, forecast)
    notes = audit_rain_outdoor_days(itinerary) + audit_commute_load(itinerary)
    return append_credibility_warnings(itinerary, notes)
