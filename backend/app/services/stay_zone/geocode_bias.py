"""Resolve geocode fence context for stay-zone geometry / lodging.

Vague trip destinations (e.g. 「马来西亚海岛」「新西兰」) must not override a
concrete zone.city. When the city name is globally ambiguous (「奥克兰」→ US),
prefer confirmed arrival airport coordinates + country code as the fence anchor.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.data.city_aliases import country_code_for_destination, normalize_city
from app.services.flight.airport_search import get_airport_by_iata, search_airports

_COUNTRY_ALIASES = (
    Path(__file__).resolve().parent.parent / "flight" / "data" / "country_aliases.json"
)
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


@dataclass(frozen=True, slots=True)
class GeocodePlaceContext:
    """Middle-layer place context used before stay-zone / hotel geocode."""

    city_label: str
    """Display / preference city (often Chinese)."""

    geocode_destination: str
    """String passed as ``destination=`` into geocode_place (prefer EN + country)."""

    country_code: str | None = None
    fence_lat: float | None = None
    fence_lng: float | None = None
    iata: str | None = None


@lru_cache
def _iso_by_country_en() -> dict[str, str]:
    """English country name → ISO alpha-2 (from 2-letter keys in country_aliases)."""
    if not _COUNTRY_ALIASES.exists():
        return {}
    raw = json.loads(_COUNTRY_ALIASES.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for alias, en in raw.items():
        a = str(alias).strip().lower()
        en_s = str(en).strip()
        if len(a) == 2 and a.isalpha() and en_s:
            out[en_s.lower()] = a
    return out


def country_code_from_english(country_en: str) -> str | None:
    key = (country_en or "").strip().lower()
    if not key:
        return None
    return _iso_by_country_en().get(key)


def airport_anchor_from_flights(
    flights: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    """Best-effort arrival airport row: outbound dest_iata first, with lat/lon."""
    if not flights:
        return None
    ordered = sorted(
        (f for f in flights if isinstance(f, dict)),
        key=lambda f: (
            0 if (f.get("role") or "") == "outbound" else 1,
            int(f.get("sequence") or 0),
        ),
    )
    for f in ordered:
        iata = str(f.get("dest_iata") or "").strip().upper()
        row = get_airport_by_iata(iata)
        if not row:
            continue
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        hits = search_airports(iata, limit=1)
        hit = hits[0] if hits and hits[0].iata == iata else None
        city_en = (hit.city if hit else None) or (row.get("city") or "")
        city_en = str(city_en).strip()
        country_en = (hit.country if hit else None) or (row.get("country") or "")
        country_en = str(country_en).strip()
        city_zh = ((hit.city_zh if hit else "") or "").strip() or city_en
        country_zh = ((hit.country_zh if hit else "") or "").strip()
        return {
            "iata": iata,
            "lat": lat,
            "lon": lon,
            "city_zh": city_zh,
            "city_en": city_en,
            "country_en": country_en,
            "country_zh": country_zh,
            "country_code": country_code_from_english(country_en)
            or country_code_for_destination(country_zh)
            or country_code_for_destination(city_zh),
        }
    return None


def city_from_flights(flights: list[dict[str, Any]] | None) -> str | None:
    """Best-effort arrival city from selected flights (outbound dest first)."""
    anchor = airport_anchor_from_flights(flights)
    if not anchor:
        return None
    return (anchor.get("city_zh") or anchor.get("city_en") or "").strip() or None


def resolve_zone_geocode_city(
    zone: dict[str, Any],
    destination: str,
    *,
    flights: list[dict[str, Any]] | None = None,
) -> str:
    """Pick city string used as geocode bias label (compat wrapper)."""
    return resolve_zone_geocode_context(zone, destination, flights=flights).city_label


def resolve_zone_geocode_context(
    zone: dict[str, Any],
    destination: str,
    *,
    flights: list[dict[str, Any]] | None = None,
) -> GeocodePlaceContext:
    """Resolve city label + fence anchor for stay-zone / lodging geocode.

    Priority for city label:
    1. ``zone.city`` when it differs from the (possibly region-level) destination
    2. Arrival city from flights when destination is vague / equals zone.city
    3. ``zone.city`` / flight city / destination fallbacks

    Fence lat/lng: confirmed arrival airport coordinates when available (beats
    ambiguous city-name geocode such as 奥克兰 → West Virginia).
    """
    zone_city = str(zone.get("city") or "").strip()
    dest = (destination or "").strip()
    anchor = airport_anchor_from_flights(flights)
    flight_city = ""
    if anchor:
        flight_city = (anchor.get("city_zh") or anchor.get("city_en") or "").strip()

    if zone_city and zone_city != dest:
        city_label = zone_city
    elif flight_city and flight_city != dest and (not zone_city or zone_city == dest):
        city_label = flight_city
    elif zone_city:
        city_label = zone_city
    elif flight_city:
        city_label = flight_city
    else:
        city_label = dest

    country_code = (
        (anchor or {}).get("country_code")
        or country_code_for_destination(city_label)
        or country_code_for_destination(dest)
    )

    # Prefer EN "City, Country" for geocoders when we have an airport row.
    geocode_destination = city_label
    if anchor and anchor.get("city_en"):
        country_en = (anchor.get("country_en") or "").strip()
        geocode_destination = (
            f"{anchor['city_en']}, {country_en}" if country_en else str(anchor["city_en"])
        )
    else:
        normalized = normalize_city(city_label)
        if normalized:
            geocode_destination = normalized

    fence_lat = float(anchor["lat"]) if anchor else None
    fence_lng = float(anchor["lon"]) if anchor else None

    # If zone.city is a different city than the arrival airport, do not pin fence
    # to the airport (intercity stay). Keep country_code / EN suffix only.
    if (
        fence_lat is not None
        and zone_city
        and flight_city
        and zone_city != dest
        and _norm_city_token(zone_city) != _norm_city_token(flight_city)
        and not _city_mentions(zone_city, flight_city)
    ):
        fence_lat = None
        fence_lng = None
        normalized = normalize_city(zone_city)
        if normalized:
            geocode_destination = normalized

    return GeocodePlaceContext(
        city_label=city_label or dest,
        geocode_destination=geocode_destination or city_label or dest,
        country_code=str(country_code).lower() if country_code else None,
        fence_lat=fence_lat,
        fence_lng=fence_lng,
        iata=(anchor or {}).get("iata"),
    )


def _hotel_coords(hotel: dict[str, Any]) -> tuple[float, float] | None:
    try:
        lat = float(hotel.get("lat"))
        lng = float(hotel.get("lng"))
    except (TypeError, ValueError):
        return None
    if abs(lat) < 0.01 and abs(lng) < 0.01:
        return None
    return lat, lng


def resolve_itinerary_geocode_context(
    destination: str,
    *,
    flights: list[dict[str, Any]] | None = None,
    hotels: list[dict[str, Any]] | None = None,
) -> GeocodePlaceContext:
    """GEO-13: fence itinerary POI geocode using confirmed hotel or arrival airport.

    Priority:
    1. First hotel with valid lat/lng (stay anchor)
    2. Outbound arrival airport IATA coords
    3. Destination string + country alias only
    """
    dest = (destination or "").strip()
    anchor = airport_anchor_from_flights(flights)

    hotel_hit: dict[str, Any] | None = None
    for h in hotels or []:
        if not isinstance(h, dict):
            continue
        if _hotel_coords(h) is None:
            continue
        hotel_hit = h
        break

    if hotel_hit is not None:
        lat, lng = _hotel_coords(hotel_hit)  # type: ignore[misc]
        city_label = (
            str(hotel_hit.get("city") or "").strip()
            or (anchor or {}).get("city_zh")
            or (anchor or {}).get("city_en")
            or dest
        )
        country_code = (
            country_code_for_destination(str(city_label))
            or (anchor or {}).get("country_code")
            or country_code_for_destination(dest)
        )
        geocode_destination = str(city_label)
        if anchor and anchor.get("city_en") and not str(hotel_hit.get("city") or "").strip():
            country_en = (anchor.get("country_en") or "").strip()
            geocode_destination = (
                f"{anchor['city_en']}, {country_en}" if country_en else str(anchor["city_en"])
            )
        else:
            normalized = normalize_city(str(city_label))
            if normalized:
                geocode_destination = normalized
        return GeocodePlaceContext(
            city_label=str(city_label),
            geocode_destination=geocode_destination,
            country_code=str(country_code).lower() if country_code else None,
            fence_lat=lat,
            fence_lng=lng,
            iata=(anchor or {}).get("iata"),
        )

    # No hotel pin — reuse zone resolver with empty zone (flight / dest only)
    return resolve_zone_geocode_context({}, dest, flights=flights)


def _norm_city_token(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").strip().lower())


def _city_mentions(zone_city: str, flight_city: str) -> bool:
    z = _norm_city_token(zone_city)
    f = _norm_city_token(flight_city)
    if not z or not f:
        return False
    if z == f or f in z or z in f:
        return True
    # CJK substring overlap (亚庇 vs 亚庇 (哥打基纳巴卢))
    if _CJK_RE.search(z) and _CJK_RE.search(f):
        return f in z or z in f
    return False
