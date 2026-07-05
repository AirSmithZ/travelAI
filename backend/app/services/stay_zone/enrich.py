"""将 LLM/heuristic zone 与 geocode 几何绑定。"""

from __future__ import annotations

from typing import Any

from app.services.geocoding import geocode_place
from app.services.stay_zone.score import (
    ScoredHub,
    compute_zone_radius_m,
    rank_anchor_hints,
)
from app.services.stay_zone.segment import StaySegment
from app.services.stay_zone.tripcom_deeplink import build_tripcom_hotel_url


def attach_zone_geometry(
    zone: dict[str, Any],
    destination: str,
    *,
    segment: StaySegment | None = None,
    itinerary: dict[str, Any] | None = None,
    flights: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
    default_radius_m: float = 800.0,
) -> dict[str, Any]:
    hints = zone.get("anchor_hints") or []
    label = zone.get("label") or destination
    fallback_queries = [label, f"{destination} downtown MRT", destination]

    best = None
    if segment and hints:
        best = rank_anchor_hints(
            hints,
            destination,
            segment,
            itinerary,
            flights,
            prefs,
            geocode_place,
        )

    if not best:
        for q in hints + fallback_queries:
            if not q:
                continue
            hit = geocode_place(str(q), destination)
            if hit:
                best = ScoredHub(
                    lat=float(hit["lat"]),
                    lng=float(hit["lng"]),
                    query=str(q),
                    score=0.0,
                    address=hit.get("address"),
                )
                break

    if best:
        radius = default_radius_m
        if segment:
            radius = compute_zone_radius_m(
                best.lat,
                best.lng,
                zone,
                itinerary,
                default_radius_m=default_radius_m,
            )
        zone["geometry"] = {
            "type": "circle",
            "center": {"lat": best.lat, "lng": best.lng},
            "radius_m": radius,
        }
        if not zone.get("transit_note"):
            zone["transit_note"] = best.address or f"枢纽：{best.query}"
    return zone


def attach_purchase_url(
    zone: dict[str, Any],
    *,
    adults: int = 2,
) -> dict[str, Any]:
    zone["purchase_url"] = build_tripcom_hotel_url(
        zone.get("city") or "",
        zone.get("check_in") or "",
        zone.get("check_out") or zone.get("check_in") or "",
        area_keyword=zone.get("label") or "",
        adults=adults,
    )
    return zone
