"""DATA-01: days[].date must follow TripRequest.date_start (not today)."""

from __future__ import annotations

from datetime import date, timedelta

from app.schemas.chat import TripRequestIn
from app.services.itinerary_llm import (
    _llm_to_itinerary,
    _parse_trip_start_date,
    _timezone_for_destination,
)


def test_parse_date_start():
    tr = TripRequestIn(destination="新加坡", date_start="2026-10-16", day_count=3)
    assert _parse_trip_start_date(tr) == date(2026, 10, 16)


def test_llm_to_itinerary_dates():
    tr = TripRequestIn(destination="新加坡", date_start="2026-10-16", day_count=2)
    raw = {
        "title": "测试",
        "days": [
            {"day_index": 1, "label": "D1", "nodes": [{"name": "A", "category": "attraction"}]},
            {"day_index": 2, "label": "D2", "nodes": [{"name": "B", "category": "attraction"}]},
        ],
    }
    out = _llm_to_itinerary(raw, tr, geocoded=False)
    assert out["days"][0]["date"] == "2026-10-16"
    assert out["days"][1]["date"] == "2026-10-17"
    assert out["timezone"] == "Asia/Singapore"
    # Must not be "today" when date_start is set
    assert out["days"][0]["date"] != date.today().isoformat() or date.today() == date(2026, 10, 16)


def test_timezone_japan():
    assert _timezone_for_destination("东京") == "Asia/Tokyo"


def test_fallback_without_date_start_uses_today():
    tr = TripRequestIn(destination="新加坡", day_count=1)
    assert _parse_trip_start_date(tr) == date.today()
    # sanity: offset still works relative to today
    raw = {
        "title": "t",
        "days": [{"day_index": 1, "label": "D1", "nodes": [{"name": "A"}]}],
    }
    out = _llm_to_itinerary(raw, tr, geocoded=False)
    assert out["days"][0]["date"] == date.today().isoformat()
    assert out["days"][0]["date"] == (date.today() + timedelta(days=0)).isoformat()


if __name__ == "__main__":
    test_parse_date_start()
    test_llm_to_itinerary_dates()
    test_timezone_japan()
    test_fallback_without_date_start_uses_today()
    print("OK: itinerary date tests passed")
