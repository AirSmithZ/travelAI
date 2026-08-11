#!/usr/bin/env python3
"""GEO-CACHE-01 / GEO-13 / SERP-BUDGET / WX-CACHE unit tests (no network)."""

from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402
from app.data.city_aliases import country_code_for_destination, normalize_city  # noqa: E402
from app.services.geocoding import (  # noqa: E402
    clear_geocode_caches,
    geocode_place,
    resolve_destination_center,
)
from app.services.qweather_forecast import clear_weather_cache, fetch_trip_forecast  # noqa: E402
from app.services.serp_circuit import (  # noqa: E402
    clear_serp_circuit,
    record_serp_rate_limit,
    serp_circuit_open,
)
from app.services.stay_zone.geocode_bias import resolve_itinerary_geocode_context  # noqa: E402


def test_vn_aliases():
    assert country_code_for_destination("越南") == "vn"
    assert country_code_for_destination("胡志明市") == "vn"
    assert "Ho Chi Minh" in normalize_city("胡志明市")
    print("aliases OK")


def test_itinerary_context_hotel_fence():
    ctx = resolve_itinerary_geocode_context(
        "越南",
        flights=[{"role": "outbound", "dest_iata": "SGN", "sequence": 1}],
        hotels=[{"name": "Fusion", "lat": 10.77, "lng": 106.7, "city": "胡志明市"}],
    )
    assert ctx.fence_lat is not None and abs(ctx.fence_lat - 10.77) < 0.01
    assert ctx.fence_lng is not None and abs(ctx.fence_lng - 106.7) < 0.01
    assert ctx.country_code == "vn"
    print("itinerary context hotel OK")


def test_geocode_cache_ttl_and_miss():
    clear_geocode_caches()
    settings = Settings(
        geocode_cache_ttl_sec=3600,
        geocode_cache_miss_ttl_sec=3600,
        dest_center_cache_ttl_sec=3600,
        dest_center_cache_miss_ttl_sec=3600,
    )
    calls = {"n": 0}

    def fake_auto(*_a, **_k):
        calls["n"] += 1
        from app.services.geocode_providers import AutocompleteResult

        return AutocompleteResult(results=[], warnings=[])

    with (
        patch("app.services.geocoding.geocode_autocomplete", side_effect=fake_auto),
        patch("app.services.geocoding._wikidata_fallback", return_value=None),
        patch("app.services.geocoding.get_settings", return_value=settings),
    ):
        assert geocode_place("NoSuchPlaceXYZ", "新加坡") is None
        assert geocode_place("NoSuchPlaceXYZ", "新加坡") is None
        assert calls["n"] == 1  # second hit cache miss entry
    print("geocode miss cache OK")


def test_dest_center_rejects_country_mismatch():
    clear_geocode_caches()
    settings = Settings(
        dest_center_cache_ttl_sec=3600,
        dest_center_cache_miss_ttl_sec=60,
        qweather_api_key="",
    )

    class FakeHit:
        lat = 23.15
        lng = 120.17
        country_code = "tw"

    class FakeResult:
        results = [FakeHit()]

    with (
        patch("app.services.geocoding.lookup_city_center", return_value=None),
        patch("app.services.geocoding.run_autocomplete", return_value=FakeResult()),
        patch("app.services.geocoding.get_settings", return_value=settings),
    ):
        center = resolve_destination_center("越南", settings=settings)
        assert center is None  # tw rejected for vn
    print("dest center poison reject OK")


def test_serp_circuit():
    clear_serp_circuit()
    assert not serp_circuit_open()
    record_serp_rate_limit(0.05)
    assert serp_circuit_open()
    time.sleep(0.06)
    assert not serp_circuit_open()
    print("serp circuit OK")


def test_weather_cache():
    clear_weather_cache()
    settings = Settings(weather_cache_ttl_sec=3600, qweather_api_key="k")
    calls = {"n": 0}

    def fake_city(*_a, **_k):
        return {"location_id": "loc1", "lat": 1.0, "lng": 2.0}

    def fake_get(*_a, **_k):
        calls["n"] += 1
        return (
            {
                "code": "200",
                "daily": [
                    {
                        "fxDate": date.today().isoformat(),
                        "tempMin": "20",
                        "tempMax": "28",
                        "iconDay": "100",
                        "textDay": "晴",
                    }
                ],
            },
            10,
            None,
        )

    with (
        patch("app.services.qweather_forecast.qweather_api_key", return_value="k"),
        patch("app.services.qweather_forecast.lookup_city_center", side_effect=fake_city),
        patch("app.services.qweather_forecast.qweather_get_json", side_effect=fake_get),
        patch("app.services.qweather_forecast.record_usage"),
    ):
        a = fetch_trip_forecast("新加坡", date.today(), 1, settings)
        b = fetch_trip_forecast("新加坡", date.today(), 1, settings)
        assert a and b
        assert calls["n"] == 1
    print("weather cache OK")


if __name__ == "__main__":
    test_vn_aliases()
    test_itinerary_context_hotel_fence()
    test_geocode_cache_ttl_and_miss()
    test_dest_center_rejects_country_mismatch()
    test_serp_circuit()
    test_weather_cache()
    print("all cache/geo28 tests passed")
