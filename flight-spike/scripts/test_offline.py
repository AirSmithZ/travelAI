#!/usr/bin/env python3
"""Unit tests for rank + LetsFG parser (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from flight_spike.letsfg import parse_letsfg_stdout
from flight_spike.models import FlightOffer, SearchRequest
from flight_spike.rank import rank_offers

SAMPLE_LETSFG = """
│ 1    │       USD │ D7-AirA… │ PVG→KUL→SIN │  06:00 │   20:45 │ 14h 45m │   1   │
│      │    104.00 │          │             │        │         │         │       │
│ 2    │       USD │ Scoot    │ PVG→SIN     │  02:10 │   07:35 │  5h 25m │   0   │
│      │    189.00 │          │             │        │         │         │       │
│ 3    │       USD │ SQ       │ PVG→SIN     │  08:05 │   13:20 │  5h 15m │   0   │
│      │    312.00 │          │             │        │         │         │       │
"""


def test_parse_letsfg():
    req = SearchRequest(origin="PVG", destination="SIN", date="2026-10-16")
    offers = parse_letsfg_stdout(SAMPLE_LETSFG, req, fetched_at="2026-01-01T00:00:00Z")
    assert len(offers) == 3
    assert offers[0].price_amount == 104.0
    assert offers[0].stops == 1
    assert offers[0].duration_minutes == 14 * 60 + 45
    assert offers[1].stops == 0


def test_rank_cheap():
    offers = [
        FlightOffer(
            id="a", origin_iata="PVG", dest_iata="SIN", airline="A",
            route_label="x", depart_time="06:00", arrive_time="20:45",
            duration_minutes=885, stops=1, price_amount=104, price_currency="USD",
            source="letsfg", confidence="medium",
        ),
        FlightOffer(
            id="b", origin_iata="PVG", dest_iata="SIN", airline="B",
            route_label="x", depart_time="02:10", arrive_time="07:35",
            duration_minutes=325, stops=0, price_amount=189, price_currency="USD",
            source="letsfg", confidence="medium",
        ),
    ]
    ranked = rank_offers(offers, "cheap", top_n=2)
    assert ranked[0].price_amount == 104
    assert ranked[0].rank == 1


def test_rank_fast():
    offers = [
        FlightOffer(
            id="a", origin_iata="PVG", dest_iata="SIN", airline="A",
            route_label="x", depart_time="06:00", arrive_time="20:45",
            duration_minutes=885, stops=1, price_amount=104, price_currency="USD",
            source="letsfg", confidence="medium",
        ),
        FlightOffer(
            id="b", origin_iata="PVG", dest_iata="SIN", airline="B",
            route_label="x", depart_time="02:10", arrive_time="07:35",
            duration_minutes=325, stops=0, price_amount=189, price_currency="USD",
            source="letsfg", confidence="medium",
        ),
    ]
    ranked = rank_offers(offers, "fast", top_n=2)
    assert ranked[0].duration_minutes == 325


if __name__ == "__main__":
    test_parse_letsfg()
    test_rank_cheap()
    test_rank_fast()
    print("OK: all tests passed")
