#!/usr/bin/env python3
"""P81: reject city-centroid collapse when POI name does not match."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.geocode_providers import GeocodeHit
from app.services.geocoding import _hit_payload, _pick_best_hit


def _hit(name: str, lat: float, lng: float) -> GeocodeHit:
    return GeocodeHit(
        name=name,
        address=f"{name}, Singapore",
        lat=lat,
        lng=lng,
        place_id=f"id/{name}",
        coord_source="photon",
        country_code="sg",
    )


def test_reject_singapore_centroid_for_poi():
    # City center + a real POI farther away
    city = _hit("Singapore", 1.3521, 103.8198)
    poi = _hit("Gardens by the Bay", 1.2816, 103.8636)
    best, _ = _pick_best_hit(
        "滨海湾花园",
        [city, poi],
        center_lat=1.3521,
        center_lng=103.8198,
        destination="新加坡",
        category="attraction",
    )
    # Chinese query won't match English POI name → both may fail; must NOT return city
    assert best is None or best.name != "Singapore"


def test_name_en_alias_picks_english_poi():
    """P82: Chinese display name + English alias matches provider English title."""
    city = _hit("Singapore", 1.3521, 103.8198)
    poi = _hit("Gardens by the Bay", 1.2816, 103.8636)
    best, _ = _pick_best_hit(
        "滨海湾花园",
        [city, poi],
        center_lat=1.3521,
        center_lng=103.8198,
        destination="新加坡",
        category="attraction",
        query_aliases=["滨海湾花园", "Gardens by the Bay"],
    )
    assert best is not None
    assert best.name == "Gardens by the Bay"


def test_accept_matching_poi_near_center():
    hotel = _hit("Hotel Supreme", 1.301, 103.841)
    city = _hit("Singapore", 1.3521, 103.8198)
    best, _ = _pick_best_hit(
        "Hotel Supreme",
        [city, hotel],
        center_lat=1.3521,
        center_lng=103.8198,
        destination="新加坡",
        category="hotel",
    )
    assert best is not None
    assert best.name == "Hotel Supreme"


def test_hit_payload_does_not_include_name():
    hit = _hit("Provider Title", 1.3, 103.8)
    payload = _hit_payload(hit, fence_km=80, destination="新加坡", ambiguous=False)
    assert "name" not in payload
    assert payload.get("geocode_label") == "Provider Title"


if __name__ == "__main__":
    test_reject_singapore_centroid_for_poi()
    test_name_en_alias_picks_english_poi()
    test_accept_matching_poi_near_center()
    test_hit_payload_does_not_include_name()
    print("OK: geocode collapse tests passed")
