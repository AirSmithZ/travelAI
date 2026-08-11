#!/usr/bin/env python3
"""HOT-RG-02: RollingGo lodging priority + trip_first fallback."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api.v1.stay_zones import post_stay_zone_lodging  # noqa: E402
from app.schemas.stay_zone import StayZoneLodgingRequest  # noqa: E402
from app.services.stay_zone.lodging_search import LodgingSearchResult  # noqa: E402
from app.services.stay_zone.rollinggo_lodging import (  # noqa: E402
    resolve_place_type,
    stay_nights_between,
)


def _settings(**kwargs):
    s = MagicMock()
    s.rollinggo_mcp_api_key = kwargs.get("rollinggo_mcp_api_key", "")
    s.rollinggo_mcp_url = "https://mcp.rollinggo.cn/mcp"
    s.rollinggo_mcp_timeout_sec = 45.0
    s.lodging_enable_serp = kwargs.get("lodging_enable_serp", False)
    s.serpapi_api_key = kwargs.get("serpapi_api_key", "")
    return s


def _body(**kwargs):
    return StayZoneLodgingRequest(
        zone_id="z1",
        city=kwargs.get("city", "新加坡"),
        label=kwargs.get("label", "滨海湾"),
        lat=1.28,
        lng=103.85,
        check_in="2026-09-01",
        check_out="2026-09-04",
        adults=2,
        radius_m=1500,
        limit=5,
    )


def test_place_type_and_nights():
    assert resolve_place_type(city="新加坡", label="滨海湾")[1] == "景点"
    assert resolve_place_type(city="胡志明市", label="第1郡")[1] == "区/县"
    assert resolve_place_type(city="新加坡", label="") == ("新加坡", "城市")
    assert stay_nights_between("2026-09-01", "2026-09-04") == 3

    from app.services.stay_zone.rollinggo_lodging import (
        build_place_attempts,
        sanitize_zone_place,
    )

    assert sanitize_zone_place("胡志明市", "胡志明市第一郡（市中心）") == "第1郡"
    attempts = build_place_attempts(city="胡志明市", label="胡志明市第一郡（市中心）")
    assert attempts[0] == ("第1郡", "区/县")
    assert ("District 1", "区/县") in attempts
    assert ("胡志明市", "城市") in attempts
    print("place_type_nights OK")


def test_rollinggo_ok_mode():
    rg = LodgingSearchResult(
        status="ok",
        query="rollinggo:景点:滨海湾",
        candidates=[
            {
                "name": "Test Hotel",
                "lat": 1.281,
                "lng": 103.86,
                "distance_m": 400,
                "coord_source": "rollinggo",
                "ref_price": 500.0,
                "currency": "CNY",
                "place_id": "rg:1",
            }
        ],
    )
    with patch(
        "app.api.v1.stay_zones.search_lodging_via_rollinggo",
        return_value=rg,
    ):
        res = post_stay_zone_lodging(
            _body(),
            _settings(rollinggo_mcp_api_key="mcp_test"),
        )
    assert res.mode == "rollinggo"
    assert res.status == "ok"
    assert len(res.candidates) == 1
    assert res.candidates[0].ref_price == 500.0
    assert "trip.com" in res.trip_url.lower()
    print("rollinggo_ok OK")


def test_no_key_trip_first_no_serp():
    res = post_stay_zone_lodging(
        _body(),
        _settings(rollinggo_mcp_api_key="", lodging_enable_serp=False),
    )
    assert res.mode == "trip_first"
    assert res.status == "trip_first"
    assert res.candidates == []
    assert res.trip_url
    print("no_key_trip_first OK")


def test_map_hotel_payload():
    from app.services.stay_zone.rollinggo_lodging import _map_hotel

    row = _map_hotel(
        {
            "hotelId": 9,
            "name": "Foo",
            "latitude": 1.3,
            "longitude": 103.8,
            "address": "A",
            "starRating": 4,
            "bookingUrl": "https://rollinggo.example/h/9",
            "price": {"hasPrice": True, "lowestPrice": 321, "currency": "CNY"},
        },
        hub_lat=1.28,
        hub_lng=103.85,
    )
    assert row is not None
    assert row["coord_source"] == "rollinggo"
    assert row["place_id"] == "rg:9"
    assert row["ref_price"] == 321.0
    assert row["booking_url"]
    print("map_hotel OK")


if __name__ == "__main__":
    test_place_type_and_nights()
    test_rollinggo_ok_mode()
    test_no_key_trip_first_no_serp()
    test_map_hotel_payload()
    print("all rollinggo lodging tests passed")
