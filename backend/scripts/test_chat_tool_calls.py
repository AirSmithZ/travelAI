"""Unit checks for B-FLT-01/02 search_flights sanitize (no LLM)."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.schemas.chat import TripRequestIn  # noqa: E402
from app.services.chat_parse import _sanitize_tool_calls  # noqa: E402


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


if __name__ == "__main__":
    test_complete_call()
    test_fills_from_trip_request()
    test_incomplete_dropped()
    test_unknown_tool()
    print("ok")
