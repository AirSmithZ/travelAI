#!/usr/bin/env python3
"""B-FLT-04 manual-validate unit checks."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.schemas.flight import FlightManualValidateRequest  # noqa: E402
from app.services.flight.manual_validate import validate_manual_flight  # noqa: E402


def test_ok_sha_sin():
    r = validate_manual_flight(
        FlightManualValidateRequest(
            origin="上海",
            destination="新加坡",
            depart_at="2026-10-16T09:00:00",
            arrive_at="2026-10-16T15:00:00",
            trip_date_start="2026-10-16",
            trip_date_end="2026-10-20",
        )
    )
    assert r.ok
    assert r.origin_iata
    assert r.dest_iata
    assert (r.duration_minutes or 0) > 0


def test_bad_time():
    r = validate_manual_flight(
        FlightManualValidateRequest(
            origin="PVG",
            destination="SIN",
            depart_at="2026-10-16T15:00:00",
            arrive_at="2026-10-16T09:00:00",
        )
    )
    assert not r.ok
    assert any("晚于" in e for e in r.errors)


if __name__ == "__main__":
    test_ok_sha_sin()
    test_bad_time()
    print("ok")
