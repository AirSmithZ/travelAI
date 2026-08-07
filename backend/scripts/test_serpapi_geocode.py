#!/usr/bin/env python3
"""GEO-03: SerpApi Google Maps provider parse + chain skip (mocked)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402
from app.services.geocode_providers import (  # noqa: E402
    GeocodeBias,
    SerpApiMapsProvider,
    _build_providers,
    _parse_serpapi_maps,
    run_autocomplete,
)


SAMPLE = {
    "place_results": {
        "title": "Marina Bay Sands",
        "address": "10 Bayfront Ave, Singapore",
        "place_id": "ChIJxxx",
        "gps_coordinates": {"latitude": 1.2838, "longitude": 103.8591},
    },
    "local_results": [
        {
            "title": "Marina Bay Sands",
            "address": "10 Bayfront Ave",
            "place_id": "ChIJxxx",
            "gps_coordinates": {"latitude": 1.2838, "longitude": 103.8591},
        },
        {
            "title": "Gardens by the Bay",
            "address": "18 Marina Gardens Dr",
            "place_id": "ChIJyyy",
            "gps_coordinates": {"latitude": 1.2816, "longitude": 103.8636},
        },
    ],
}


def test_parse_dedupes_place_and_local():
    hits = _parse_serpapi_maps(SAMPLE, limit=5, bias=GeocodeBias(country_code="sg"))
    assert len(hits) == 2
    assert hits[0].name == "Marina Bay Sands"
    assert abs(hits[0].lat - 1.2838) < 1e-4
    assert hits[0].coord_source == "serpapi"
    print("parse_dedupe OK")


def test_skip_serpapi_without_key():
    settings = Settings(
        GEOCODE_PROVIDERS="serpapi,photon",
        SERPAPI_API_KEY="",
    )
    providers = _build_providers(settings)
    assert all(p.name != "serpapi" for p in providers)
    print("skip_without_key OK")


def test_serpapi_first_in_chain():
    settings = Settings(
        GEOCODE_PROVIDERS="serpapi,photon",
        SERPAPI_API_KEY="test-key",
        SERPAPI_TIMEOUT_SEC=5,
    )
    bias = GeocodeBias(lat=1.352, lng=103.820, country_code="sg")
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = SAMPLE

    with patch("app.services.geocode_providers.httpx.Client") as client_cls:
        client = MagicMock()
        client.__enter__.return_value = client
        client.__exit__.return_value = None
        client.get.return_value = mock_resp
        client_cls.return_value = client

        outcome = run_autocomplete(
            ["Marina Bay Sands"],
            limit=3,
            settings=settings,
            bias=bias,
            fence_km=150,
            bare_query="Marina Bay Sands",
        )

    assert outcome.provider == "serpapi"
    assert outcome.results
    assert "Marina" in outcome.results[0].name
    # ll bias passed
    args, kwargs = client.get.call_args
    params = kwargs.get("params") or {}
    assert params.get("engine") == "google_maps"
    assert "ll" in params
    print("serpapi_chain OK")


def test_provider_enriches_country_hint():
    settings = Settings(SERPAPI_API_KEY="k", SERPAPI_TIMEOUT_SEC=5)
    provider = SerpApiMapsProvider(settings)
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"local_results": []}

    with patch("app.services.geocode_providers.httpx.Client") as client_cls:
        client = MagicMock()
        client.__enter__.return_value = client
        client.__exit__.return_value = None
        client.get.return_value = mock_resp
        client_cls.return_value = client
        provider.autocomplete(
            "滨海湾金沙",
            limit=3,
            bias=GeocodeBias(country_code="sg"),
        )
        params = client.get.call_args.kwargs["params"]
        assert "Singapore" in params["q"]
    print("country_hint OK")


if __name__ == "__main__":
    test_parse_dedupes_place_and_local()
    test_skip_serpapi_without_key()
    test_serpapi_first_in_chain()
    test_provider_enriches_country_hint()
    print("ALL PASS")
