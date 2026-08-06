#!/usr/bin/env python3
"""Unit tests for flight offer ranking."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.schemas.flight import FlightQuote  # noqa: E402
from app.services.flight.rank import _arrival_time_fit, rank_offers  # noqa: E402


def _offer(**kwargs) -> FlightQuote:
    base = dict(
        id="x",
        origin_iata="SHA",
        dest_iata="SIN",
        airline="Test Air",
        route_label="SHA-SIN",
        depart_time="08:00",
        arrive_time="13:00",
        duration_minutes=300,
        stops=0,
        price_amount=500.0,
        price_currency="CNY",
        source="letsfg",
        confidence="medium",
        bookability="reference_only",
    )
    base.update(kwargs)
    return FlightQuote(**base)


def test_rank_cheap_prefers_lower_price():
    offers = [
        _offer(id="a", price_amount=800, duration_minutes=360),
        _offer(id="b", price_amount=400, duration_minutes=420, airline="Budget"),
    ]
    ranked = rank_offers(offers, "cheap", top_n=2)
    assert ranked[0].price_amount == 400
    assert ranked[0].rank == 1


def test_rank_fast_prefers_shorter_duration():
    offers = [
        _offer(id="a", price_amount=300, duration_minutes=480),
        _offer(id="b", price_amount=600, duration_minutes=300, airline="Fast"),
    ]
    ranked = rank_offers(offers, "fast", top_n=2)
    assert ranked[0].duration_minutes == 300


def test_arrival_time_fit_bands():
    assert _arrival_time_fit("14:30") == 0.0
    assert _arrival_time_fit("2026-08-01T14:30:00") == 0.0
    assert _arrival_time_fit("08:00") == 0.5
    assert _arrival_time_fit("22:15") == 0.5
    assert _arrival_time_fit("03:00") == 1.0
    assert _arrival_time_fit("") == 0.5


def test_rank_balanced_prefers_daytime_arrival_when_similar():
    """With equal price/duration/stops, daytime arrival ranks higher."""
    offers = [
        _offer(id="night", price_amount=500, duration_minutes=300, arrive_time="02:00"),
        _offer(id="day", price_amount=500, duration_minutes=300, arrive_time="15:00"),
    ]
    ranked = rank_offers(offers, "balanced", top_n=2)
    assert ranked[0].id == "day"
    assert ranked[0].rank_reason and "抵达时段适宜" in (ranked[0].rank_reason or "")
    assert ranked[1].rank_reason and "抵达偏深夜/凌晨" in (ranked[1].rank_reason or "")


def test_rank_balanced_price_still_matters():
    """Price weight 0.5 should still prefer a clearly cheaper offer."""
    offers = [
        _offer(id="cheap", price_amount=300, duration_minutes=360, arrive_time="15:00"),
        _offer(id="pricey", price_amount=900, duration_minutes=300, arrive_time="15:00"),
    ]
    ranked = rank_offers(offers, "balanced", top_n=2)
    assert ranked[0].id == "cheap"


if __name__ == "__main__":
    test_rank_cheap_prefers_lower_price()
    test_rank_fast_prefers_shorter_duration()
    test_arrival_time_fit_bands()
    test_rank_balanced_prefers_daytime_arrival_when_similar()
    test_rank_balanced_price_still_matters()
    print("OK: flight rank tests passed")
