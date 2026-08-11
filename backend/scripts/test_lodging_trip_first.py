#!/usr/bin/env python3
"""HOT-TRIP-01 + HOT-RG-02: lodging trip_first / optional serp."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api.v1.stay_zones import post_stay_zone_lodging  # noqa: E402
from app.schemas.stay_zone import StayZoneLodgingRequest  # noqa: E402
from app.services.stay_zone.lodging_search import LodgingSearchResult  # noqa: E402


def _settings(**kwargs):
    s = MagicMock()
    s.serpapi_api_key = kwargs.get("serpapi_api_key", "")
    s.rollinggo_mcp_api_key = kwargs.get("rollinggo_mcp_api_key", "")
    s.rollinggo_mcp_url = "https://mcp.rollinggo.cn/mcp"
    s.rollinggo_mcp_timeout_sec = 45.0
    s.lodging_enable_serp = kwargs.get("lodging_enable_serp", False)
    return s


def test_unconfigured_returns_trip_first():
    body = StayZoneLodgingRequest(
        zone_id="z1",
        city="新加坡",
        label="滨海湾",
        lat=1.28,
        lng=103.85,
        check_in="2026-09-01",
        check_out="2026-09-05",
        adults=2,
    )
    res = post_stay_zone_lodging(body, _settings())
    assert res.status == "trip_first"
    assert res.mode == "trip_first"
    assert "trip.com" in res.trip_url.lower()
    assert res.candidates == []
    print("unconfigured_trip_first OK")


def test_rate_limited_maps_to_trip_first():
    body = StayZoneLodgingRequest(
        zone_id="z1",
        city="新加坡",
        label="滨海湾",
        lat=1.28,
        lng=103.85,
        check_in="2026-09-01",
        check_out="2026-09-05",
    )
    with patch(
        "app.api.v1.stay_zones.search_lodging_near",
        return_value=LodgingSearchResult(
            status="rate_limited",
            warnings=["SerpApi 限流（429）"],
            candidates=[],
            query="hotels",
        ),
    ):
        res = post_stay_zone_lodging(
            body,
            _settings(serpapi_api_key="sk-test", lodging_enable_serp=True),
        )
    assert res.status == "trip_first"
    assert res.mode == "trip_first"
    assert res.trip_url
    print("rate_limited_trip_first OK")


if __name__ == "__main__":
    test_unconfigured_returns_trip_first()
    test_rate_limited_maps_to_trip_first()
    print("all lodging trip_first tests passed")
