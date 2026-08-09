#!/usr/bin/env python3
"""Unit tests for L1 category visit-duration clamp (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.intel_anchor_enforce import enforce_travel_intel_anchors
from app.services.visit_duration import (
    CATEGORY_VISIT_DURATION,
    apply_category_duration_clamp,
    clamp_duration_minutes,
    format_visit_duration_prompt_block,
    typical_duration_minutes,
)


def test_table_and_clamp_helpers():
    assert typical_duration_minutes("restaurant") == 60
    assert typical_duration_minutes("snack") == 30
    assert typical_duration_minutes("attraction") == 90
    assert clamp_duration_minutes("restaurant", 15) == 45
    assert clamp_duration_minutes("restaurant", 240) == 90
    assert clamp_duration_minutes("attraction", 20) == 45
    assert "restaurant" in format_visit_duration_prompt_block()
    assert set(CATEGORY_VISIT_DURATION) >= {
        "snack",
        "restaurant",
        "attraction",
        "landmark",
        "transit",
    }


def test_clamp_rewrites_absurd_poi_windows():
    itinerary = {
        "days": [
            {
                "day_index": 1,
                "nodes": [
                    {
                        "id": "r1",
                        "name": "路边快餐",
                        "category": "restaurant",
                        "start_time": "12:00",
                        "end_time": "16:00",  # 4h — too long
                        "is_optional": False,
                    },
                    {
                        "id": "a1",
                        "name": "打卡点",
                        "category": "attraction",
                        "start_time": "16:00",
                        "end_time": "16:10",  # 10m — too short
                        "is_optional": False,
                    },
                ],
            }
        ],
        "meta": {},
    }
    out = apply_category_duration_clamp(itinerary, pinned_ids=set())
    r1, a1 = out["days"][0]["nodes"]
    assert r1["start_time"] == "12:00"
    assert r1["end_time"] == "13:30"  # max 90
    assert r1["duration_minutes"] == 90
    assert a1["start_time"] == "16:00"
    assert a1["end_time"] == "16:45"  # min 45
    assert a1["duration_minutes"] == 45
    assert any("品类默认停留" in w for w in out["meta"]["warnings"])


def test_skips_pinned_airport_and_evening_hotel():
    itinerary = {
        "days": [
            {
                "day_index": 1,
                "nodes": [
                    {
                        "id": "ap",
                        "name": "机场",
                        "category": "airport",
                        "start_time": "05:55",
                        "end_time": "07:10",
                        "is_optional": False,
                    },
                    {
                        "id": "h",
                        "name": "Hotel",
                        "category": "hotel",
                        "start_time": "21:00",
                        "end_time": "08:00",
                        "tips": ["返回酒店过夜"],
                        "is_optional": False,
                    },
                ],
            }
        ],
        "meta": {},
    }
    out = apply_category_duration_clamp(itinerary, pinned_ids={"ap"})
    assert out["days"][0]["nodes"][0]["end_time"] == "07:10"
    assert out["days"][0]["nodes"][1]["start_time"] == "21:00"
    assert out["days"][0]["nodes"][1]["end_time"] == "08:00"


def test_enforce_pipeline_clamps_then_cascades():
    itinerary = {
        "id": "t",
        "destination": "新加坡",
        "title": "2日",
        "days": [
            {
                "day_index": 1,
                "date": "2026-08-30",
                "nodes": [
                    {
                        "id": "a1",
                        "name": "樟宜机场",
                        "category": "airport",
                        "lat": 1.36,
                        "lng": 103.99,
                        "start_time": "10:00",
                        "end_time": "11:00",
                        "is_optional": False,
                    },
                    {
                        "id": "p1",
                        "name": "景点",
                        "category": "attraction",
                        "lat": 1.28,
                        "lng": 103.86,
                        "start_time": "11:00",
                        "end_time": "11:05",
                        "is_optional": False,
                    },
                    {
                        "id": "h1",
                        "name": "旧店",
                        "category": "hotel",
                        "lat": 0,
                        "lng": 0,
                        "is_optional": False,
                    },
                ],
                "edges": [],
            }
        ],
        "meta": {"warnings": []},
    }
    intel = {
        "flights": [
            {
                "role": "outbound",
                "arrive_at": "2026-08-30T05:55:00",
                "depart_at": "2026-08-30T00:35:00",
            }
        ],
        "hotels": [
            {
                "id": "h1",
                "sequence": 1,
                "name": "Hotel Supreme",
                "check_in": "2026-08-30",
                "check_out": "2026-08-31",
                "lat": 1.3,
                "lng": 103.84,
            }
        ],
    }
    out = enforce_travel_intel_anchors(itinerary, intel)
    poi = next(n for n in out["days"][0]["nodes"] if n["category"] == "attraction")
    assert poi.get("duration_minutes", 0) >= 45
    # span after cascade should respect min attraction stay unless day packed
    from app.services.intel_anchor_enforce import _parse_hhmm

    st = _parse_hhmm(poi["start_time"])
    en = _parse_hhmm(poi["end_time"])
    assert st is not None and en is not None
    assert en - st >= 45 or any("过满" in w for w in out["meta"].get("warnings") or [])


if __name__ == "__main__":
    test_table_and_clamp_helpers()
    test_clamp_rewrites_absurd_poi_windows()
    test_skips_pinned_airport_and_evening_hotel()
    test_enforce_pipeline_clamps_then_cascades()
    print("OK: visit_duration tests passed")
