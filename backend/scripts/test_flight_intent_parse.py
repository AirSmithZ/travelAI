#!/usr/bin/env python3
"""Unit tests for flight intent parsing helpers (no LLM)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.flight.intent_parse import (  # noqa: E402
    _FlightIntentLLMResult,
    _missing_fields,
    build_intent_parsed,
)


def test_missing_fields_all_present():
    llm = _FlightIntentLLMResult(
        reply="ok",
        origin="上海",
        destination="新加坡",
        date="2026-10-16",
        adults=2,
        preference="cheap",
    )
    parsed = build_intent_parsed(llm)
    assert parsed.missing_fields == []
    assert parsed.preference == "cheap"


def test_missing_fields_partial():
    llm = _FlightIntentLLMResult(
        reply="缺日期",
        origin="上海",
        destination="新加坡",
        date=None,
    )
    assert _missing_fields(llm) == ["出发日期"]
    parsed = build_intent_parsed(llm)
    assert "出发日期" in parsed.missing_fields


if __name__ == "__main__":
    test_missing_fields_all_present()
    test_missing_fields_partial()
    print("OK: flight intent parse tests passed")
