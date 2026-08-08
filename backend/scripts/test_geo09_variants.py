#!/usr/bin/env python3
"""GEO-09 query variants + qweather helper smoke (no network)."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.geocoding import build_query_variants  # noqa: E402


def test_variants_include_english_city():
    vs = build_query_variants("滨海湾花园", "新加坡")
    assert any("Singapore" in v for v in vs)
    assert vs[0].startswith("滨海湾花园")


if __name__ == "__main__":
    test_variants_include_english_city()
    print("ok")
