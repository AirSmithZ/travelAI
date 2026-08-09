"""Deterministically enforce confirmed travel_intel hotels (and related anchors) on itineraries.

LLM prompts alone are soft; this post-pass makes user-confirmed lodging authoritative.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def _norm_name(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _has_coords(lat: Any, lng: Any) -> bool:
    try:
        la = float(lat)
        ln = float(lng)
    except (TypeError, ValueError):
        return False
    return abs(la) > 1e-6 or abs(ln) > 1e-6


def _day_indices_for_hotel(
    hotel: dict[str, Any],
    days: list[dict[str, Any]],
    zones: list[dict[str, Any]],
) -> list[int]:
    """Return 0-based day list indices this hotel should overnight on."""
    n = len(days)
    if n == 0:
        return []

    zone_id = hotel.get("zone_id")
    if zone_id:
        for z in zones:
            if z.get("id") != zone_id:
                continue
            covers = z.get("covers_day_indices") or []
            out = [int(i) for i in covers if isinstance(i, (int, float)) and 0 <= int(i) < n]
            if out:
                return sorted(set(out))

    cin = (hotel.get("check_in") or "").strip()
    cout = (hotel.get("check_out") or "").strip()
    if cin and cout:
        out: list[int] = []
        for i, day in enumerate(days):
            d = (day.get("date") or "").strip()
            if d and cin <= d < cout:
                out.append(i)
        if out:
            return out

    # Fallback: every night of the trip (include last day as base lodging)
    return list(range(n))


def _apply_hotel_fields(node: dict[str, Any], hotel: dict[str, Any]) -> None:
    name = (hotel.get("name") or "").strip()
    if name:
        node["name"] = name
    node["category"] = "hotel"
    if hotel.get("address"):
        node["address"] = hotel["address"]
    if not node.get("cost_label"):
        node["cost_label"] = "住宿"
    if not node.get("start_time"):
        node["start_time"] = "21:00"
    if not node.get("end_time"):
        node["end_time"] = "08:00"
    lat, lng = hotel.get("lat"), hotel.get("lng")
    if _has_coords(lat, lng):
        node["lat"] = float(lat)
        node["lng"] = float(lng)
        node["coord_confidence"] = "high"
        node["coord_source"] = "travel_intel"
    region = hotel.get("city")
    if region and not node.get("region"):
        node["region"] = region


def _reconnect_primary_chain(day: dict[str, Any]) -> None:
    nodes = day.get("nodes") or []
    if len(nodes) < 2:
        day["edges"] = [
            e
            for e in (day.get("edges") or [])
            if e.get("type") == "alternative"
            and e.get("from") in {n["id"] for n in nodes}
            and e.get("to") in {n["id"] for n in nodes}
        ]
        return

    ids = [n["id"] for n in nodes]
    id_set = set(ids)
    alt = [
        e
        for e in (day.get("edges") or [])
        if e.get("type") == "alternative" and e.get("from") in id_set and e.get("to") in id_set
    ]
    day_num = day.get("day_index") or 1
    primary = []
    for j in range(1, len(ids)):
        primary.append(
            {
                "id": f"d{day_num}-e{j}",
                "from": ids[j - 1],
                "to": ids[j],
                "type": "primary",
                "transport_mode": "walk",
                "duration_minutes": 20,
            }
        )
    day["edges"] = primary + alt


def _upsert_hotel_node(
    day: dict[str, Any],
    hotel: dict[str, Any],
    *,
    day_num: int,
    sequence: int,
) -> str:
    name = (hotel.get("name") or "").strip() or "酒店"
    nodes: list[dict[str, Any]] = day.setdefault("nodes", [])
    target = _norm_name(name)

    for node in nodes:
        if node.get("category") == "hotel" and _norm_name(node.get("name")) == target:
            _apply_hotel_fields(node, hotel)
            return str(node["id"])

    for node in nodes:
        if node.get("category") == "hotel":
            _apply_hotel_fields(node, hotel)
            return str(node["id"])

    nid = f"d{day_num}-hotel-{sequence}"
    existing = {n.get("id") for n in nodes}
    suffix = 1
    while nid in existing:
        suffix += 1
        nid = f"d{day_num}-hotel-{sequence}-{suffix}"

    node: dict[str, Any] = {
        "id": nid,
        "name": name,
        "category": "hotel",
        "lat": 0,
        "lng": 0,
        "start_time": "21:00",
        "end_time": "08:00",
        "region": hotel.get("city") or day.get("region"),
        "is_optional": False,
        "coord_confidence": "none",
        "cost_label": "住宿",
    }
    _apply_hotel_fields(node, hotel)
    nodes.append(node)
    _reconnect_primary_chain(day)
    return nid


def _strip_foreign_hotels(
    day: dict[str, Any],
    confirmed_names: set[str],
) -> None:
    if not confirmed_names:
        return
    nodes = day.get("nodes") or []
    kept: list[dict[str, Any]] = []
    removed = False
    for node in nodes:
        if node.get("category") == "hotel" and _norm_name(node.get("name")) not in confirmed_names:
            removed = True
            continue
        kept.append(node)
    if not removed:
        return
    day["nodes"] = kept
    _reconnect_primary_chain(day)


def enforce_confirmed_hotels(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None,
) -> dict[str, Any]:
    """Force overnight hotel nodes to match ``travel_intel.hotels`` exact names/coords."""
    if not travel_intel:
        return itinerary

    hotels = [h for h in (travel_intel.get("hotels") or []) if isinstance(h, dict)]
    hotels = [h for h in hotels if (h.get("name") or "").strip()]
    if not hotels:
        return itinerary

    out = deepcopy(itinerary)
    days: list[dict[str, Any]] = out.get("days") or []
    if not days:
        return out

    zones = [
        z
        for z in (travel_intel.get("recommended_stay_zones") or [])
        if isinstance(z, dict)
    ]
    confirmed_names = {_norm_name(h.get("name")) for h in hotels}
    bindings: list[dict[str, Any]] = []
    covered_day_indices: set[int] = set()

    for h in hotels:
        seq = int(h.get("sequence") or 1)
        indices = _day_indices_for_hotel(h, days, zones)
        hotel_id = h.get("id")
        for i in indices:
            day = days[i]
            day_num = int(day.get("day_index") or (i + 1))
            node_id = _upsert_hotel_node(day, h, day_num=day_num, sequence=seq)
            covered_day_indices.add(i)
            bindings.append(
                {
                    "hotel_id": hotel_id,
                    "hotel_name": (h.get("name") or "").strip(),
                    "node_id": node_id,
                    "day_index": day_num,
                }
            )

    for i in covered_day_indices:
        _strip_foreign_hotels(days[i], confirmed_names)

    meta = out.setdefault("meta", {})
    warnings = list(meta.get("warnings") or [])
    names = "、".join((h.get("name") or "").strip() for h in hotels[:3])
    note = f"已按用户确认酒店锚定晚宿：{names}"
    if note not in warnings:
        warnings.append(note)
    meta["warnings"] = warnings
    meta["hotel_bindings"] = bindings
    return out


def enforce_travel_intel_anchors(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None,
) -> dict[str, Any]:
    """Public entry: apply all deterministic intel anchors after LLM/mock generate."""
    return enforce_confirmed_hotels(itinerary, travel_intel)
