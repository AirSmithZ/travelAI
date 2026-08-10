#!/usr/bin/env python3
"""P113/P117: stay-zone geocode bias — city label + airport fence anchor."""

from __future__ import annotations

from unittest.mock import patch

from app.data.city_aliases import country_code_for_destination, normalize_city
from app.services.stay_zone.enrich import attach_zone_geometry
from app.services.stay_zone.geocode_bias import (
    airport_anchor_from_flights,
    city_from_flights,
    resolve_zone_geocode_city,
    resolve_zone_geocode_context,
)
from app.services.stay_zone.segment import StaySegment


def test_resolve_prefers_zone_city_over_vague_destination():
    city = resolve_zone_geocode_city(
        {"city": "亚庇 (哥打基纳巴卢)"},
        "马来西亚海岛",
        flights=[{"role": "outbound", "dest_iata": "BKI", "sequence": 1}],
    )
    assert city == "亚庇 (哥打基纳巴卢)"
    print("zone.city over vague dest OK")


def test_resolve_falls_back_to_flight_city_when_zone_equals_dest():
    city = resolve_zone_geocode_city(
        {"city": "马来西亚海岛"},
        "马来西亚海岛",
        flights=[
            {"role": "return", "dest_iata": "HGH", "sequence": 2},
            {"role": "outbound", "dest_iata": "BKI", "sequence": 1},
        ],
    )
    assert city == "亚庇"
    print("flight arrival city fallback OK")


def test_city_from_flights_prefers_outbound():
    city = city_from_flights(
        [
            {"role": "return", "dest_iata": "HGH", "sequence": 2},
            {"role": "outbound", "dest_iata": "BKI", "sequence": 1},
        ]
    )
    assert city == "亚庇"
    print("outbound dest preferred OK")


def test_nz_aliases():
    assert country_code_for_destination("新西兰") == "nz"
    assert country_code_for_destination("奥克兰") == "nz"
    assert "Auckland" in normalize_city("奥克兰")
    print("nz aliases OK")


def test_airport_anchor_akl():
    anchor = airport_anchor_from_flights(
        [{"role": "outbound", "dest_iata": "AKL", "sequence": 1}]
    )
    assert anchor is not None
    assert anchor["iata"] == "AKL"
    assert anchor["country_code"] == "nz"
    assert abs(float(anchor["lat"]) - (-37.008)) < 0.05
    assert abs(float(anchor["lon"]) - 174.792) < 0.05
    print("AKL airport anchor OK")


def test_context_pins_fence_for_country_destination():
    ctx = resolve_zone_geocode_context(
        {"city": "奥克兰"},
        "新西兰",
        flights=[{"role": "outbound", "dest_iata": "AKL", "sequence": 1}],
    )
    assert ctx.city_label == "奥克兰"
    assert ctx.country_code == "nz"
    assert ctx.iata == "AKL"
    assert ctx.fence_lat is not None and ctx.fence_lng is not None
    assert "Auckland" in ctx.geocode_destination
    print("NZ country → AKL fence context OK")


def test_attach_zone_geometry_uses_zone_city_fence():
    """Regression: Jalan Gaya must geocode against 亚庇, not 马来西亚海岛."""
    calls: list[tuple[str, str]] = []

    def fake_geocode(name: str, destination: str = "", **kwargs):
        calls.append((name, destination))
        if "Jalan Gaya" in name and ("亚庇" in destination or "Kinabalu" in destination):
            return {
                "lat": 5.9849438,
                "lng": 116.0777937,
                "address": "Jalan Gaya, Kota Kinabalu",
                "coord_source": "serpapi",
            }
        if destination == "马来西亚海岛":
            return {
                "lat": 1.5660869,
                "lng": 103.8079253,
                "address": "wrong",
                "coord_source": "photon",
            }
        return None

    zone = {
        "city": "亚庇 (哥打基纳巴卢)",
        "label": "亚庇市中心—加雅街区域",
        "anchor_hints": ["Jalan Gaya, Kota Kinabalu"],
        "covers_day_indices": [0, 1, 2, 3, 4],
    }
    seg = StaySegment(
        city="马来西亚海岛",
        check_in="2026-10-05",
        check_out="2026-10-09",
        day_indices=[0, 1, 2, 3, 4],
    )
    with patch("app.services.stay_zone.enrich.geocode_place", side_effect=fake_geocode):
        out = attach_zone_geometry(
            zone,
            "马来西亚海岛",
            segment=seg,
            flights=[{"role": "outbound", "dest_iata": "BKI", "sequence": 1}],
        )

    assert out.get("geometry")
    center = out["geometry"]["center"]
    assert abs(center["lat"] - 5.9849438) < 1e-6
    assert abs(center["lng"] - 116.0777937) < 1e-6
    assert calls, "geocode_place should be called"
    assert not any(dest == "马来西亚海岛" for _, dest in calls), calls
    print("attach_zone_geometry fence city OK")


def test_attach_zone_geometry_nz_uses_airport_fence_kwargs():
    """P117: destination=新西兰 + AKL must pass airport center into geocode_place."""
    seen: list[dict] = []

    def fake_geocode(name: str, destination: str = "", **kwargs):
        seen.append({"name": name, "destination": destination, **kwargs})
        # Simulate old bug: bare 奥克兰 would resolve to WV unless fence pinned.
        if kwargs.get("center_lat") is None:
            return {
                "lat": 39.4414427,
                "lng": -79.5336245,
                "address": "Auckland WV",
                "coord_source": "serpapi",
            }
        if "Britomart" in name or "Queen" in name or "奥克兰" in name:
            return {
                "lat": -36.8441,
                "lng": 174.7665,
                "address": "Britomart, Auckland",
                "coord_source": "serpapi",
            }
        return None

    zone = {
        "city": "奥克兰",
        "label": "奥克兰市中心皇后街区域",
        "anchor_hints": ["Britomart Transport Centre, Auckland"],
        "covers_day_indices": [0, 1, 2, 3, 4],
    }
    seg = StaySegment(
        city="新西兰",
        check_in="2026-10-03",
        check_out="2026-10-08",
        day_indices=[0, 1, 2, 3, 4],
    )
    with patch("app.services.stay_zone.enrich.geocode_place", side_effect=fake_geocode):
        out = attach_zone_geometry(
            zone,
            "新西兰",
            segment=seg,
            flights=[{"role": "outbound", "dest_iata": "AKL", "sequence": 1}],
        )

    assert out.get("geometry")
    center = out["geometry"]["center"]
    assert abs(center["lat"] - (-36.8441)) < 1e-6
    assert abs(center["lng"] - 174.7665) < 1e-6
    assert seen, "geocode_place should be called"
    assert all(c.get("center_lat") is not None for c in seen), seen
    assert all((c.get("country_code") or "").lower() == "nz" for c in seen), seen
    print("attach_zone_geometry NZ airport fence kwargs OK")


def test_attach_falls_back_to_airport_coords_when_geocode_empty():
    zone = {
        "city": "奥克兰",
        "label": "奥克兰市中心",
        "anchor_hints": ["nowhere-unique-poi-xyz"],
        "covers_day_indices": [0],
    }
    with patch("app.services.stay_zone.enrich.geocode_place", return_value=None):
        out = attach_zone_geometry(
            zone,
            "新西兰",
            flights=[{"role": "outbound", "dest_iata": "AKL", "sequence": 1}],
        )
    assert out.get("geometry")
    center = out["geometry"]["center"]
    assert abs(center["lat"] - (-37.008)) < 0.05
    assert abs(center["lng"] - 174.792) < 0.05
    print("airport coord last-resort OK")


if __name__ == "__main__":
    test_resolve_prefers_zone_city_over_vague_destination()
    test_resolve_falls_back_to_flight_city_when_zone_equals_dest()
    test_city_from_flights_prefers_outbound()
    test_nz_aliases()
    test_airport_anchor_akl()
    test_context_pins_fence_for_country_destination()
    test_attach_zone_geometry_uses_zone_city_fence()
    test_attach_zone_geometry_nz_uses_airport_fence_kwargs()
    test_attach_falls_back_to_airport_coords_when_geocode_empty()
    print("all stay_zone geocode bias tests passed")
