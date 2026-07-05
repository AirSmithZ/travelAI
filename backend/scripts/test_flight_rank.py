#!/usr/bin/env python3
"""Unit tests for flight offer ranking."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.schemas.flight import FlightQuote  # noqa: E402
from app.services.flight.rank import rank_offers  # noqa: E402


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


if __name__ == "__main__":
    test_rank_cheap_prefers_lower_price()
    test_rank_fast_prefers_shorter_duration()
    print("OK: flight rank tests passed")
