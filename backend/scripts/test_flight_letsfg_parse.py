#!/usr/bin/env python3
"""Unit tests for LetsFG stdout parser (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.flight.letsfg_provider import parse_letsfg_stdout  # noqa: E402

SAMPLE = """
│ 1 │ CNY │ 新航 │ SIN-SHA │ 08:05 │ 13:20 │ 5h 15m │ 0 │
│   │ CNY │ 312.0 │
│ 2 │ CNY │ 东航 │ SIN-SHA │ 14:30 │ 20:10 │ 5h 40m │ 0 │
│   │ CNY │ 298.5 │
"""


def test_parse_letsfg_stdout():
    offers = parse_letsfg_stdout(
        SAMPLE,
        origin_iata="SHA",
        dest_iata="SIN",
        currency="CNY",
        fetched_at="2026-01-01T00:00:00+00:00",
    )
    assert len(offers) == 2
    assert offers[0].airline == "新航"
    assert offers[0].price_amount == 312.0
    assert offers[1].price_amount == 298.5
    assert offers[0].bookability == "reference_only"


if __name__ == "__main__":
    test_parse_letsfg_stdout()
    print("OK: letsfg parse tests passed")
