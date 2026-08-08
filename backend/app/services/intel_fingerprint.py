"""B-P4-04: travel_intel fingerprint for FLOW-02 dirty detection."""

from __future__ import annotations

import hashlib
import json
from typing import Any

# 与 StayZoneStatus / schemas.stay_zone 对齐：仅「已确认」片区进入指纹。
# proposed/rejected 不参与脏检测；勿用 selected/locked 等酒店 booking 语义。
FINGERPRINT_ZONE_STATUSES = frozenset({"confirmed"})


def _flight_key(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "sequence": f.get("sequence"),
        "role": f.get("role"),
        "origin_iata": f.get("origin_iata"),
        "dest_iata": f.get("dest_iata"),
        "depart_at": f.get("depart_at"),
        "arrive_at": f.get("arrive_at"),
        "quote_id": f.get("quote_id") or f.get("confirmed_quote_id"),
        "flight_numbers": f.get("flight_numbers"),
    }


def _hotel_key(h: dict[str, Any]) -> dict[str, Any]:
    return {
        "sequence": h.get("sequence"),
        "name": h.get("name"),
        "zone_id": h.get("zone_id"),
        "check_in": h.get("check_in"),
        "check_out": h.get("check_out"),
    }


def intel_fingerprint(travel_intel: dict[str, Any] | None) -> str:
    if not travel_intel:
        return ""
    flights = [
        _flight_key(f)
        for f in (travel_intel.get("flights") or [])
        if isinstance(f, dict)
    ]
    hotels = [
        _hotel_key(h)
        for h in (travel_intel.get("hotels") or [])
        if isinstance(h, dict)
    ]
    zones = [
        {"id": z.get("id"), "status": z.get("status"), "label": z.get("label")}
        for z in (travel_intel.get("recommended_stay_zones") or [])
        if isinstance(z, dict) and z.get("status") in FINGERPRINT_ZONE_STATUSES
    ]
    payload = {"flights": flights, "hotels": hotels, "zones": zones}
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def flight_quote_ids(travel_intel: dict[str, Any] | None) -> list[str]:
    if not travel_intel:
        return []
    ids: list[str] = []
    search = travel_intel.get("last_flight_search") or {}
    if isinstance(search, dict) and search.get("confirmed_quote_id"):
        ids.append(str(search["confirmed_quote_id"]))
    for f in travel_intel.get("flights") or []:
        if not isinstance(f, dict):
            continue
        qid = f.get("quote_id") or f.get("source_quote_id")
        if qid and str(qid) not in ids:
            ids.append(str(qid))
    return ids


def intel_snapshot_payload(travel_intel: dict[str, Any] | None) -> dict[str, Any]:
    if not travel_intel:
        return {"flights": [], "hotels": [], "zones": []}
    flights = [
        _flight_key(f)
        for f in (travel_intel.get("flights") or [])
        if isinstance(f, dict)
    ]
    hotels = [
        _hotel_key(h)
        for h in (travel_intel.get("hotels") or [])
        if isinstance(h, dict)
    ]
    zones = [
        {"id": z.get("id"), "status": z.get("status"), "label": z.get("label")}
        for z in (travel_intel.get("recommended_stay_zones") or [])
        if isinstance(z, dict) and z.get("status") in FINGERPRINT_ZONE_STATUSES
    ]
    return {"flights": flights, "hotels": hotels, "zones": zones}


def attach_intel_snapshot(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None,
) -> dict[str, Any]:
    meta = itinerary.setdefault("meta", {})
    snap = intel_snapshot_payload(travel_intel)
    meta["intel_snapshot"] = snap
    meta["intel_fingerprint"] = intel_fingerprint(travel_intel)
    qids = flight_quote_ids(travel_intel)
    if qids:
        meta["flight_quote_ids"] = qids
    return itinerary
