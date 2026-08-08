#!/usr/bin/env python3
"""OPS-01 ledger smoke (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.api_usage import ApiUsageLedger, record_usage, get_usage_ledger  # noqa: E402
from app.services.ops_provider_accounts import _deepseek_root  # noqa: E402


def test_deepseek_root():
    assert _deepseek_root("https://api.deepseek.com/v1") == "https://api.deepseek.com"
    assert _deepseek_root("https://api.deepseek.com/") == "https://api.deepseek.com"
    print("deepseek_root OK")


def test_ledger():
    led = ApiUsageLedger()
    led.record("llm", "generate", ok=True, latency_ms=1200, prompt_tokens=1000, completion_tokens=500)
    led.record("tikhub", "search_notes", ok=False, latency_ms=800, error="timeout")
    led.record("tikhub", "search_notes", ok=True, latency_ms=400)
    snap = led.snapshot()
    assert snap["estimated_cost_usd_total"] >= 0
    by = {p["provider"]: p for p in snap["providers"]}
    assert by["llm"]["calls"] == 1
    assert by["tikhub"]["fail"] == 1
    assert by["tikhub"]["ok"] == 1
    assert len(snap["recent"]) >= 2
    led.reset()
    assert led.snapshot()["providers"] == []
    print("ledger OK")


def test_global_record():
    get_usage_ledger().reset()
    record_usage("qweather", "forecast", ok=True, latency_ms=50)
    snap = get_usage_ledger().snapshot()
    assert any(p["provider"] == "qweather" for p in snap["providers"])
    get_usage_ledger().reset()
    print("global_record OK")


if __name__ == "__main__":
    test_deepseek_root()
    test_ledger()
    test_global_record()
    print("all api_usage tests OK")
