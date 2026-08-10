"""将 LLM/heuristic zone 与 geocode 几何绑定。"""

from __future__ import annotations

from typing import Any

from app.services.geocoding import geocode_place
from app.services.stay_zone.geocode_bias import resolve_zone_geocode_context
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
    # Middle layer: zone.city / arrival airport over vague trip destination;
    # pin fence to airport lat/lon when available (P117).
    ctx = resolve_zone_geocode_context(zone, destination, flights=flights)
    geocode_dest = ctx.geocode_destination or ctx.city_label or destination
    hints = zone.get("anchor_hints") or []
    label = zone.get("label") or ctx.city_label or destination
    fallback_queries = [label, f"{ctx.city_label} downtown", ctx.city_label]
    if destination and destination not in {ctx.city_label, geocode_dest}:
        # Keep trip destination as last-resort query only (not as fence)
        fallback_queries.append(destination)

    def _geocode(name: str, dest: str = "") -> dict[str, Any] | None:
        return geocode_place(
            name,
            dest or geocode_dest,
            center_lat=ctx.fence_lat,
            center_lng=ctx.fence_lng,
            country_code=ctx.country_code,
        )

    best = None
    if segment and hints:
        best = rank_anchor_hints(
            hints,
            geocode_dest,
            segment,
            itinerary,
            flights,
            prefs,
            _geocode,
        )

    if not best:
        for q in list(hints) + fallback_queries:
            if not q:
                continue
            hit = _geocode(str(q), geocode_dest)
            if hit:
                best = ScoredHub(
                    lat=float(hit["lat"]),
                    lng=float(hit["lng"]),
                    query=str(q),
                    score=0.0,
                    address=hit.get("address"),
                )
                break

    # Last resort: pin to arrival airport so geometry never lands in the wrong country.
    if not best and ctx.fence_lat is not None and ctx.fence_lng is not None:
        best = ScoredHub(
            lat=float(ctx.fence_lat),
            lng=float(ctx.fence_lng),
            query=ctx.iata or ctx.city_label or geocode_dest,
            score=0.0,
            address=f"抵达机场锚点：{ctx.iata or ctx.city_label}",
        )

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
    max_price: float | None = None,
) -> dict[str, Any]:
    zone["purchase_url"] = build_tripcom_hotel_url(
        zone.get("city") or "",
        zone.get("check_in") or "",
        zone.get("check_out") or zone.get("check_in") or "",
        area_keyword=zone.get("label") or "",
        adults=adults,
        max_price=max_price,
    )
    return zone
