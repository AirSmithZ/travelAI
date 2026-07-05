#!/usr/bin/env python3
"""Unit tests for Ignav normalize (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.flight.ignav_provider import normalize_ignav_itinerary

SAMPLE_ONE_WAY = {
    "ignav_id": "abc123def456",
    "price": {"amount": 126.0, "currency": "USD", "status": "verified"},
    "outbound": {
        "carrier": "Spring",
        "duration_minutes": 340,
        "segments": [
            {
                "marketing_carrier_code": "9C",
                "flight_number": "8549",
                "departure_airport": "PVG",
                "arrival_airport": "SIN",
                "departure_time_local": "2026-10-16T09:30:00",
                "arrival_time_local": "2026-10-16T15:10:00",
                "duration_minutes": 340,
            }
        ],
    },
}

SAMPLE_ROUND_TRIP = {
    "ignav_id": "rt789xyz",
    "price": {"amount": 498.0, "currency": "USD"},
    "outbound": {
        "carrier": "Cathay",
        "duration_minutes": 240,
        "segments": [
            {
                "marketing_carrier_code": "CX",
                "flight_number": "715",
                "departure_airport": "HKG",
                "arrival_airport": "NRT",
                "departure_time_local": "2026-11-01T08:00:00",
                "arrival_time_local": "2026-11-01T13:00:00",
                "duration_minutes": 240,
            }
        ],
    },
    "inbound": {
        "carrier": "Cathay",
        "duration_minutes": 250,
        "segments": [
            {
                "marketing_carrier_code": "CX",
                "flight_number": "716",
                "departure_airport": "NRT",
                "arrival_airport": "HKG",
                "departure_time_local": "2026-11-08T14:00:00",
                "arrival_time_local": "2026-11-08T18:10:00",
                "duration_minutes": 250,
            }
        ],
    },
}


def test_normalize_one_way():
    q = normalize_ignav_itinerary(
        SAMPLE_ONE_WAY,
        origin_iata="PVG",
        dest_iata="SIN",
        purchase_url="https://www.trip.com/flights/showfarefirst",
    )
    assert q is not None
    assert q.id == "ignav-abc123def456"
    assert q.airline == "Spring"
    assert q.trip_type == "one_way"
    assert q.return_leg is None
    assert q.stops == 0
    assert q.flight_numbers == ["9C8549"]
    assert q.route_label == "PVG→SIN"


def test_normalize_round_trip():
    q = normalize_ignav_itinerary(
        SAMPLE_ROUND_TRIP,
        origin_iata="HKG",
        dest_iata="NRT",
        is_round_trip=True,
    )
    assert q is not None
    assert q.trip_type == "round_trip"
    assert q.return_leg is not None
    assert q.return_leg.origin_iata == "NRT"
    assert q.return_leg.dest_iata == "HKG"
    assert q.return_leg.flight_numbers == ["CX716"]
    assert q.price_amount == 498.0


if __name__ == "__main__":
    test_normalize_one_way()
    test_normalize_round_trip()
    print("OK: flight ignav tests passed")
