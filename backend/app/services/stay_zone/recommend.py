"""住宿片区推荐：LLM + heuristic 回退；试点城走封闭目录排序（HOT-ZONE-CATALOG）。"""

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
from app.services.llm_client import LLMClient
from app.services.stay_zone.catalog import (
    catalog_compact_for_prompt,
    entry_to_zone_dict,
    get_stay_zone_catalog_for_city,
    order_catalog_by_ids,
)
from app.services.stay_zone.enrich import attach_purchase_url, attach_zone_geometry
from app.services.stay_zone.prompt import STAY_ZONE_CATALOG_RANK_SYSTEM, STAY_ZONE_SYSTEM
from app.services.stay_zone.score import detect_split_warnings
from app.services.stay_zone.segment import StaySegment, segment_stays
from app.services.stay_zone.theme_extract import (
    align_zone_themes,
    extract_themes,
    themes_summary_labels,
    uncovered_themes_for_zone,
)
from app.services.stay_zone.zone_tags import apply_tags_to_zones

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
        "fit_tag": "current_anchor",
        "bookable": True,
        "tag_note": "当前目的地城内 · 公交枢纽启发式",
    }


def _llm_zones(
    body: StayZoneRecommendRequest,
    segments: list[StaySegment],
    compact: dict[str, Any] | None,
    settings: Settings,
    prompt_themes: list[dict[str, Any]] | None = None,
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
        "prompt_themes": prompt_themes or [],
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
    allowed_strategy = {"compromise", "split", "main_cluster"}
    for i, z in enumerate(zones_raw):
        if not isinstance(z, dict):
            continue
        seg = segments[i] if i < len(segments) else segments[0]
        strategy = str(z.get("strategy") or "compromise").strip()
        if strategy not in allowed_strategy:
            strategy = "compromise"
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
                "strategy": strategy,
                "anchor_hints": z.get("anchor_hints") or [],
                "covers_day_indices": z.get("covers_day_indices") or seg.day_indices,
                "status": "proposed",
                "fit_tag": z.get("fit_tag"),
                "tag_note": z.get("tag_note"),
                "matched_themes": z.get("matched_themes") or [],
            }
        )
    return out or None


def _llm_rank_catalog_ids(
    body: StayZoneRecommendRequest,
    catalog: list[dict[str, Any]],
    seg: StaySegment,
    settings: Settings,
    prompt_themes: list[dict[str, Any]] | None = None,
) -> tuple[list[str], dict[str, str]]:
    """Returns (ordered_ids, rationale_by_id). Empty ordered_ids → caller uses default order."""
    if not settings.deepseek_api_key:
        return [], {}
    try:
        client = LLMClient(settings)
    except ValueError:
        return [], {}

    payload = {
        "city": seg.city,
        "check_in": seg.check_in,
        "check_out": seg.check_out,
        "catalog": catalog_compact_for_prompt(catalog),
        "trip_request": body.trip_request.model_dump(),
        "flights": body.flights,
        "preferences": body.preferences.model_dump() if body.preferences else None,
        "prompt_themes": prompt_themes or [],
    }
    try:
        raw = client.chat_json(
            system=STAY_ZONE_CATALOG_RANK_SYSTEM,
            user=json.dumps(payload, ensure_ascii=False),
            temperature=0.2,
            endpoint="stay_zones_catalog_rank",
        )
    except Exception as e:
        logger.warning("stay zone catalog rank LLM failed: %s", e)
        return [], {}

    if not isinstance(raw, dict):
        return [], {}
    ids_raw = raw.get("ordered_ids") or raw.get("ids") or []
    ordered: list[str] = []
    if isinstance(ids_raw, list):
        for x in ids_raw:
            if isinstance(x, str) and x.strip():
                ordered.append(x.strip())
    notes: dict[str, str] = {}
    notes_raw = raw.get("notes")
    if isinstance(notes_raw, list):
        for n in notes_raw:
            if not isinstance(n, dict):
                continue
            nid = str(n.get("id") or "").strip()
            rat = str(n.get("rationale") or "").strip()
            if nid and rat:
                notes[nid] = rat
    return ordered, notes


def _catalog_zones_for_segment(
    body: StayZoneRecommendRequest,
    seg: StaySegment,
    settings: Settings,
    prompt_themes: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str, list[str]]:
    """Build zones from closed catalog. source catalog_llm | catalog."""
    catalog = get_stay_zone_catalog_for_city(seg.city)
    if not catalog:
        return [], "", []
    warnings: list[str] = []
    ordered_ids, notes = _llm_rank_catalog_ids(
        body, catalog, seg, settings, prompt_themes=prompt_themes
    )
    allowed = {str(e["id"]) for e in catalog}
    dropped = [i for i in ordered_ids if i not in allowed]
    if dropped:
        warnings.append(f"已丢弃目录外片区 id：{', '.join(dropped[:5])}")
    ranked = order_catalog_by_ids(catalog, ordered_ids)
    source = "catalog_llm" if ordered_ids else "catalog"
    if not ordered_ids:
        warnings.append("目录排序 LLM 未可用，已按封闭目录默认顺序全列")
    else:
        warnings.append(f"已按封闭目录排序（{len(ranked)} 区 · 禁止编造新区）")
    zones: list[dict[str, Any]] = []
    for i, entry in enumerate(ranked):
        zones.append(
            entry_to_zone_dict(
                entry,
                sequence=i + 1,
                check_in=seg.check_in,
                check_out=seg.check_out,
                day_indices=seg.day_indices,
                rationale=notes.get(str(entry["id"])),
            )
        )
    return zones, source, warnings


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

    theme_result = extract_themes(tr)
    prompt_theme_dicts = [t.as_dict() for t in theme_result.themes]
    labels = themes_summary_labels(theme_result.themes)
    if labels:
        warnings.append(f"已从描述识别主题：{' · '.join(labels)}")

    primary = segments[0] if segments else None
    zones_raw: list[dict[str, Any]] | None = None
    source: str = "llm"
    if primary:
        catalog_zones, cat_source, cat_warns = _catalog_zones_for_segment(
            body, primary, settings, prompt_themes=prompt_theme_dicts
        )
        warnings.extend(cat_warns)
        if catalog_zones:
            source = cat_source or "catalog"
            zones_raw = catalog_zones

    if not zones_raw:
        zones_raw = _llm_zones(
            body, segments, compact, settings, prompt_themes=prompt_theme_dicts
        )
        source = "llm"
    if not zones_raw:
        source = "heuristic"
        zones_raw = [
            _heuristic_zone(seg, i + 1, itinerary, destination) for i, seg in enumerate(segments)
        ]
        warnings.append("LLM 未可用或解析失败，已使用行程 region 启发式推荐")

    zones_raw = apply_tags_to_zones(
        zones_raw,
        trip_request=tr,
        segments=segments,
        flights=body.flights,
    )
    for z in zones_raw:
        if not z.get("id"):
            z["id"] = str(uuid.uuid4())
        matched = align_zone_themes(z, theme_result.themes)
        z["matched_themes"] = matched
        z["uncovered_themes"] = uncovered_themes_for_zone(matched, theme_result.themes)

    if any(z.get("fit_tag") == "needs_city_change" for z in zones_raw):
        warnings.append(
            "部分片区更贴合偏好但与当前城段不同城（需换城）；可「加为下一段」后锁店，或改目的地/忽略"
        )

    adults = tr.get("travelers") or 2
    prefs_dict = body.preferences.model_dump() if body.preferences else None
    from_catalog = source in ("catalog", "catalog_llm")
    enriched: list[dict[str, Any]] = []
    for i, z in enumerate(zones_raw):
        seg = segments[i] if i < len(segments) else segments[0]
        if itinerary and z.get("bookable", True):
            for w in detect_split_warnings(seg, itinerary):
                if w not in warnings:
                    warnings.append(w)
        if not (from_catalog and z.get("geometry")):
            attach_zone_geometry(
                z,
                destination if z.get("bookable", True) else str(z.get("city") or destination),
                segment=seg,
                itinerary=itinerary if z.get("bookable", True) else None,
                flights=body.flights if z.get("bookable", True) else None,
                prefs=prefs_dict,
            )
        budget = tr.get("hotel_budget_per_night")
        if budget is None and prefs_dict:
            budget = prefs_dict.get("budget")
        try:
            max_price = float(budget) if budget is not None else None
        except (TypeError, ValueError):
            max_price = None
        rooms_raw = tr.get("hotel_rooms")
        try:
            rooms_n = int(rooms_raw) if rooms_raw is not None else None
        except (TypeError, ValueError):
            rooms_n = None
        attach_purchase_url(z, adults=adults, rooms=rooms_n, max_price=max_price)
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
        prompt_themes=prompt_theme_dicts,  # type: ignore[arg-type]
    )
