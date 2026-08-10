#!/usr/bin/env python3
"""P118/P119: lodging EN query, 429/SSL transient, no Chinese burn with coords."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from app.config import Settings
from app.services.stay_zone.lodging_search import (
    build_lodging_queries,
    city_en_from_coords,
    resolve_lodging_city_en,
    search_lodging_near,
)


def test_resolve_city_en_auckland():
    en = resolve_lodging_city_en("奥克兰")
    assert en is not None
    assert "Auckland" in en or en == "Auckland"
    print("resolve 奥克兰 →", en)


def test_build_queries_with_coords_no_chinese():
    qs = build_lodging_queries(
        city="罗托鲁瓦",
        label="罗托鲁瓦—市中心温泉带",
        city_en="Rotorua",
        has_coords=True,
    )
    joined = " | ".join(qs)
    assert "罗托鲁瓦" not in joined
    assert "温泉" not in joined
    assert qs[0] == "hotels near Rotorua"
    assert "hotels" in qs
    print("queries OK:", qs)


def test_build_queries_coords_without_en_only_hotels():
    qs = build_lodging_queries(city="罗托鲁瓦", has_coords=True, city_en=None)
    # resolve may still fail; with coords must not append hotel 罗托鲁瓦
    assert "hotel 罗托鲁瓦" not in qs
    assert "hotels" in qs
    print("coords-only queries OK:", qs)


def test_city_en_from_coords_rotorua():
    # Mock Nominatim addressdetails payload (no live network in CI)
    payload = {
        "display_name": "Fenton Street, Rotorua Central, Rotorua, New Zealand",
        "address": {
            "road": "Fenton Street",
            "suburb": "Rotorua Central",
            "city": "Rotorua",
            "country": "New Zealand",
        },
    }

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, *a, **k):
            return FakeResp()

    with patch("app.services.stay_zone.lodging_search.httpx.Client", FakeClient):
        en = city_en_from_coords(-38.135, 176.253)
    assert en == "Rotorua"
    print("reverse city_en OK:", en)


def test_ssl_transient_retries_once_and_stops():
    settings = Settings(SERPAPI_API_KEY="test-key")
    calls: list[str] = []

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None, **k):
            q = (params or {}).get("q", "")
            calls.append(q)
            raise httpx.ReadError(
                "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol"
            )

    with (
        patch("app.services.stay_zone.lodging_search.httpx.Client", FakeClient),
        patch("app.services.stay_zone.lodging_search.time.sleep", lambda *_: None),
        patch(
            "app.services.stay_zone.lodging_search.city_en_from_coords",
            return_value="Rotorua",
        ),
    ):
        result = search_lodging_near(
            lat=-38.135,
            lng=176.253,
            city="罗托鲁瓦",
            label="罗托鲁瓦—市中心温泉带",
            settings=settings,
        )
    assert result.status == "provider_error"
    assert result.candidates == []
    # First query + one retry; no Chinese follow-up burn
    assert len(calls) == 2
    assert all("罗托鲁瓦" not in c for c in calls)
    assert calls[0] == calls[1] == "hotels near Rotorua"
    assert "连接中断" in result.warnings[0] or "SSL" in result.warnings[0]
    print("SSL transient stop OK calls=", calls)


def test_rate_limited_status():
    settings = Settings(SERPAPI_API_KEY="test-key")

    class FakeResp:
        status_code = 429

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "429", request=MagicMock(), response=MagicMock(status_code=429)
            )

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, *a, **k):
            return FakeResp()

    with (
        patch("app.services.stay_zone.lodging_search.httpx.Client", FakeClient),
        patch("app.services.stay_zone.lodging_search.time.sleep", lambda *_: None),
        patch(
            "app.services.stay_zone.lodging_search.resolve_lodging_city_en",
            return_value="Auckland",
        ),
        patch(
            "app.services.stay_zone.lodging_search.city_en_from_coords",
            return_value=None,
        ),
    ):
        result = search_lodging_near(
            lat=-36.85,
            lng=174.76,
            city="奥克兰",
            settings=settings,
        )
    assert result.status == "rate_limited"
    assert result.candidates == []
    print("rate_limited status OK")


def test_ok_with_radius_expand():
    settings = Settings(SERPAPI_API_KEY="test-key")
    payload = {
        "local_results": [
            {
                "title": "Far Hotel",
                "gps_coordinates": {"latitude": -36.86, "longitude": 174.78},
                "place_id": "p1",
                "rating": 4.2,
            }
        ]
    }

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, *a, **k):
            return FakeResp()

    with (
        patch("app.services.stay_zone.lodging_search.httpx.Client", FakeClient),
        patch(
            "app.services.stay_zone.lodging_search.resolve_lodging_city_en",
            return_value="Auckland",
        ),
        patch(
            "app.services.stay_zone.lodging_search.city_en_from_coords",
            return_value=None,
        ),
    ):
        result = search_lodging_near(
            lat=-36.85,
            lng=174.76,
            city="奥克兰",
            settings=settings,
            radius_m=400,
            limit=8,
        )
    assert result.status == "ok"
    assert result.candidates
    assert result.candidates[0]["name"] == "Far Hotel"
    print("radius expand OK n=", len(result.candidates))


if __name__ == "__main__":
    test_resolve_city_en_auckland()
    test_build_queries_with_coords_no_chinese()
    test_build_queries_coords_without_en_only_hotels()
    test_city_en_from_coords_rotorua()
    test_ssl_transient_retries_once_and_stops()
    test_rate_limited_status()
    test_ok_with_radius_expand()
    print("all lodging_search tests passed")
