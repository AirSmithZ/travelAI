"""住宿片区推荐：LLM + heuristic 回退。"""

from __future__ import annotations

import json
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.config import Settings
from app.schemas.stay_zone import (
    RecommendedStayZoneOut,
    StayZoneRecommendRequest,
    StayZoneRecommendResponse,
)
from app.services.geocoding import geocode_place
from app.services.llm_client import LLMClient
from app.services.stay_zone.enrich import attach_purchase_url, attach_zone_geometry
from app.services.stay_zone.prompt import STAY_ZONE_SYSTEM
from app.services.stay_zone.score import detect_split_warnings
from app.services.stay_zone.segment import StaySegment, segment_stays

logger = logging.getLogger(__name__)


def _compact_itinerary(itinerary: dict[str, Any] | None) -> dict[str, Any] | None:
    if not itinerary:
        return None
    days_out: list[dict[str, Any]] = []
    for i, day in enumerate(itinerary.get("days") or []):
        nodes_out: list[dict[str, Any]] = []
        for n in day.get("nodes") or []:
            node: dict[str, Any] = {
                "name": n.get("name"),
                "category": n.get("category"),
                "region": n.get("region"),
                "start_time": n.get("start_time"),
                "end_time": n.get("end_time"),
            }
            lat, lng = n.get("lat"), n.get("lng")
            if lat and lng and (abs(lat) > 0.01 or abs(lng) > 0.01):
                node["lat"] = lat
                node["lng"] = lng
            nodes_out.append(node)
        days_out.append(
            {
                "day_index": day.get("day_index", i + 1),
                "date": day.get("date"),
                "region": day.get("region"),
                "nodes": nodes_out,
            }
        )
    return {"destination": itinerary.get("destination"), "days": days_out}


def _dominant_region(itinerary: dict[str, Any] | None, day_indices: list[int]) -> str:
    if not itinerary:
        return ""
    regions: list[str] = []
    for i in day_indices:
        day = (itinerary.get("days") or [])[i] if i < len(itinerary.get("days") or []) else None
        if not day:
            continue
        if day.get("region"):
            regions.append(str(day["region"]))
        for n in day.get("nodes") or []:
            cat = n.get("category")
            if cat in ("airport", "transit"):
                continue
            if n.get("region"):
                regions.append(str(n["region"]))
    if not regions:
        return ""
    return Counter(regions).most_common(1)[0][0]


def _heuristic_zone(
    seg: StaySegment,
    seq: int,
    itinerary: dict[str, Any] | None,
    destination: str,
) -> dict[str, Any]:
    region = _dominant_region(itinerary, seg.day_indices) or destination
    day_labels = [f"Day {i + 1}" for i in seg.day_indices]
    label = f"{region} · 公共交通枢纽带" if region else f"{destination} · 枢纽带"
    rationale = (
        f"主要覆盖 {'、'.join(day_labels)}，活动集中在「{region}」一带。"
        "默认优先近 MRT/地铁枢纽，减少每日回店通勤；若某天主玩远郊，地图上会标注折中。"
    )
    anchor = f"{region} MRT station {destination}" if region else f"{destination} downtown MRT"
    return {
        "id": str(uuid.uuid4()),
        "sequence": seq,
        "city": seg.city,
        "label": label,
        "check_in": seg.check_in,
        "check_out": seg.check_out,
        "rationale": rationale,
        "transit_note": "基于行程 region 与公共交通默认权重推荐",
        "strategy": "compromise",
        "anchor_hints": [anchor, f"{destination} city center"],
        "covers_day_indices": seg.day_indices,
        "status": "proposed",
    }


def _llm_zones(
    body: StayZoneRecommendRequest,
    segments: list[StaySegment],
    compact: dict[str, Any] | None,
    settings: Settings,
) -> list[dict[str, Any]] | None:
    if not settings.deepseek_api_key:
        return None
    try:
        client = LLMClient(settings)
    except ValueError:
        return None

    payload = {
        "trip_request": body.trip_request.model_dump(),
        "flights": body.flights,
        "itinerary": compact,
        "preferences": body.preferences.model_dump() if body.preferences else None,
        "segments": [
            {
                "city": s.city,
                "check_in": s.check_in,
                "check_out": s.check_out,
                "day_indices": s.day_indices,
            }
            for s in segments
        ],
    }
    user = json.dumps(payload, ensure_ascii=False)
    try:
        raw = client.chat_json(system=STAY_ZONE_SYSTEM, user=user, temperature=0.25, endpoint="stay_zones")
    except Exception as e:
        logger.warning("stay zone LLM failed: %s", e)
        return None

    zones_raw = raw.get("zones") if isinstance(raw, dict) else None
    if not isinstance(zones_raw, list) or not zones_raw:
        return None

    out: list[dict[str, Any]] = []
    for i, z in enumerate(zones_raw):
        if not isinstance(z, dict):
            continue
        seg = segments[i] if i < len(segments) else segments[0]
        out.append(
            {
                "id": str(uuid.uuid4()),
                "sequence": i + 1,
                "city": z.get("city") or seg.city,
                "label": z.get("label") or seg.city,
                "check_in": z.get("check_in") or seg.check_in,
                "check_out": z.get("check_out") or seg.check_out,
                "rationale": z.get("rationale") or "",
                "transit_note": z.get("transit_note"),
                "strategy": z.get("strategy") or "compromise",
                "anchor_hints": z.get("anchor_hints") or [],
                "covers_day_indices": z.get("covers_day_indices") or seg.day_indices,
                "status": "proposed",
            }
        )
    return out or None


def recommend_stay_zones(
    body: StayZoneRecommendRequest,
    settings: Settings,
) -> StayZoneRecommendResponse:
    warnings: list[str] = []
    tr = body.trip_request.model_dump()
    itinerary = body.itinerary
    destination = (tr.get("destination") or "").strip() or "目的地"
    segments = segment_stays(tr, itinerary)
    compact = _compact_itinerary(itinerary)

    if not itinerary:
        warnings.append("尚未生成路线图，推荐基于目的地与日期，完善行程后请重新推荐")

    zones_raw = _llm_zones(body, segments, compact, settings)
    source: str = "llm"
    if not zones_raw:
        source = "heuristic"
        zones_raw = [
            _heuristic_zone(seg, i + 1, itinerary, destination) for i, seg in enumerate(segments)
        ]
        warnings.append("LLM 未可用或解析失败，已使用行程 region 启发式推荐")

    adults = tr.get("travelers") or 2
    prefs_dict = body.preferences.model_dump() if body.preferences else None
    enriched: list[dict[str, Any]] = []
    for i, z in enumerate(zones_raw):
        seg = segments[i] if i < len(segments) else segments[0]
        if itinerary:
            for w in detect_split_warnings(seg, itinerary):
                if w not in warnings:
                    warnings.append(w)
        attach_zone_geometry(
            z,
            destination,
            segment=seg,
            itinerary=itinerary,
            flights=body.flights,
            prefs=prefs_dict,
        )
        attach_purchase_url(z, adults=adults)
        if not z.get("geometry"):
            warnings.append(f"「{z.get('label')}」未能 geocode 枢纽，仅文本推荐")
        enriched.append(z)

    zones = [RecommendedStayZoneOut.model_validate(z) for z in enriched]
    fetched_at = datetime.now(timezone.utc).isoformat()
    return StayZoneRecommendResponse(
        zones=zones,
        fetched_at=fetched_at,
        source=source,  # type: ignore[arg-type]
        warnings=warnings,
    )
