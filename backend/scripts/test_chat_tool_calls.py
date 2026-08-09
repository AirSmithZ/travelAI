"""Unit checks for B-FLT-01/02 search_flights sanitize (no LLM)."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.schemas.chat import FormPatchOut, TripRequestIn  # noqa: E402
from app.services.chat_parse import (  # noqa: E402
    _patches_from_search_flights,
    _sanitize_tool_calls,
)


def test_complete_call():
    calls, warnings = _sanitize_tool_calls(
        [
            {
                "name": "search_flights",
                "args": {
                    "origin": "pvg",
                    "destination": "sin",
                    "date": "2026-10-16",
                    "adults": 2,
                    "preference": "cheap",
                },
            }
        ],
        TripRequestIn(destination="新加坡"),
    )
    assert warnings == []
    assert len(calls) == 1
    assert calls[0].args["origin"] == "PVG"
    assert calls[0].args["destination"] == "SIN"
    assert calls[0].args["preference"] == "cheap"
    assert calls[0].args["adults"] == 2


def test_fills_from_trip_request():
    calls, warnings = _sanitize_tool_calls(
        [{"name": "search_flights", "args": {}}],
        TripRequestIn(
            departure="上海",
            destination="新加坡",
            date_start="2026-11-01",
            travelers=3,
        ),
    )
    assert warnings == []
    assert calls[0].args["origin"] == "上海"
    assert calls[0].args["destination"] == "新加坡"
    assert calls[0].args["date"] == "2026-11-01"
    assert calls[0].args["adults"] == 3


def test_incomplete_dropped():
    calls, warnings = _sanitize_tool_calls(
        [{"name": "search_flights", "args": {"origin": "PVG"}}],
        TripRequestIn(destination=""),
    )
    assert calls == []
    assert any("缺少" in w for w in warnings)


def test_unknown_tool():
    calls, warnings = _sanitize_tool_calls(
        [{"name": "invent_fares", "args": {}}],
        TripRequestIn(),
    )
    assert calls == []
    assert any("未知" in w for w in warnings)


def test_patches_from_search_flights_fills_trip_request():
    """P89: tool_calls alone must synthesize trip_request patches for panel sync."""
    calls, _ = _sanitize_tool_calls(
        [
            {
                "name": "search_flights",
                "args": {
                    "origin": "上海",
                    "destination": "新加坡",
                    "date": "2026-08-30",
                    "return_date": "2026-09-02",
                    "adults": 2,
                },
            }
        ],
        TripRequestIn(destination=""),
    )
    merged = _patches_from_search_flights([], calls, TripRequestIn(destination=""))
    by_field = {p.field_path: p.new_value for p in merged}
    assert by_field["departure"] == "上海"
    assert by_field["destination"] == "新加坡"
    assert by_field["date_start"] == "2026-08-30"
    assert by_field["date_end"] == "2026-09-02"
    assert by_field["travelers"] == 2


def test_patches_from_search_flights_skips_existing():
    calls, _ = _sanitize_tool_calls(
        [
            {
                "name": "search_flights",
                "args": {
                    "origin": "PVG",
                    "destination": "SIN",
                    "date": "2026-10-01",
                    "adults": 1,
                },
            }
        ],
        TripRequestIn(),
    )
    existing = [
        FormPatchOut(
            id="x",
            target="trip_request",
            action="set",
            field_path="destination",
            label="目的地",
            new_value="新加坡",
            summary="目的地：新加坡",
        )
    ]
    merged = _patches_from_search_flights(existing, calls, TripRequestIn())
    dest_patches = [p for p in merged if p.field_path == "destination"]
    assert len(dest_patches) == 1
    assert dest_patches[0].new_value == "新加坡"
    assert any(p.field_path == "departure" for p in merged)


if __name__ == "__main__":
    test_complete_call()
    test_fills_from_trip_request()
    test_incomplete_dropped()
    test_unknown_tool()
    test_patches_from_search_flights_fills_trip_request()
    test_patches_from_search_flights_skips_existing()
    print("ok")
