#!/usr/bin/env python3
"""Unit tests for Trip.com flight deeplink (no network)."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.flight.city_codes import (
    UnknownCityCodeError,
    resolve_ignav_iata,
    resolve_tripcom_city_code,
)
from app.services.flight.tripcom_deeplink import TripcomAffiliateParams, build_tripcom_flight_url


def test_resolve_sha_sin():
    assert resolve_tripcom_city_code("SHA") == "sha"
    assert resolve_tripcom_city_code("上海") == "sha"
    assert resolve_tripcom_city_code("SIN") == "sin"
    assert resolve_tripcom_city_code("新加坡") == "sin"


def test_resolve_ignav_iata_metro_vs_airport():
    """Ignav rejects Trip.com metro codes (BJS/TYO); keep airport aliases."""
    assert resolve_ignav_iata("北京") == "PEK"
    assert resolve_ignav_iata("BJS") == "PEK"
    assert resolve_ignav_iata("PEK") == "PEK"
    assert resolve_ignav_iata("PKX") == "PKX"
    assert resolve_ignav_iata("东京") == "NRT"
    assert resolve_ignav_iata("NRT") == "NRT"
    assert resolve_ignav_iata("HND") == "HND"
    assert resolve_ignav_iata("首尔") == "ICN"
    assert resolve_ignav_iata("大阪") == "KIX"
    assert resolve_ignav_iata("上海") == "PVG"
    assert resolve_ignav_iata("新加坡") == "SIN"
    # Trip.com deeplink still uses metro
    assert resolve_tripcom_city_code("北京") == "bjs"
    assert resolve_tripcom_city_code("东京") == "tyo"


def test_build_oneway_url():
    url = build_tripcom_flight_url(
        dcity="sha",
        acity="sin",
        depart_date=date(2026, 10, 16),
        adults=1,
        currency="CNY",
    )
    assert "showfarefirst" in url
    assert "dcity=sha" in url
    assert "acity=sin" in url
    assert "ddate=2026-10-16" in url
    assert "triptype=ow" in url
    assert "rdate=" not in url
    assert "curr=CNY" in url


def test_build_with_affiliate():
    url = build_tripcom_flight_url(
        dcity="sha",
        acity="sin",
        depart_date=date(2026, 8, 19),
        affiliate=TripcomAffiliateParams(
            alliance_id="9000545",
            sid="322318060",
            sub3="D18383577",
        ),
    )
    assert "Allianceid=9000545" in url
    assert "SID=322318060" in url
    assert "trip_sub3=D18383577" in url


def test_unknown_city():
    try:
        resolve_tripcom_city_code("火星")
        assert False, "expected UnknownCityCodeError"
    except UnknownCityCodeError:
        pass


if __name__ == "__main__":
    test_resolve_sha_sin()
    test_resolve_ignav_iata_metro_vs_airport()
    test_build_oneway_url()
    test_build_with_affiliate()
    test_unknown_city()
    print("OK: flight tripcom tests passed")
