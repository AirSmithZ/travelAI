#!/usr/bin/env python3
"""WX-01 / commute soft — credibility helpers (no live API)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.schemas.chat import TripRequestIn  # noqa: E402
from app.services.itinerary_credibility import (  # noqa: E402
    apply_forecast_to_itinerary,
    audit_commute_load,
    audit_rain_outdoor_days,
    enrich_itinerary_credibility,
    format_poi_fact_block,
    format_weather_constraints_block,
)
from app.services.itinerary_llm import _build_generate_user  # noqa: E402
from app.services.qweather_forecast import map_qweather_icon  # noqa: E402


def test_map_qweather_icon():
    assert map_qweather_icon(100, "晴") == "sunny"
    assert map_qweather_icon(101, "多云") == "cloudy"
    assert map_qweather_icon(305, "大雨") == "rain"
    assert map_qweather_icon(302, "雷阵雨") == "storm"
    assert map_qweather_icon(400, "小雪") == "snow"
    assert map_qweather_icon(None, "阴") == "overcast"
    print("map_qweather_icon OK")


def test_apply_forecast_overlay():
    itin = {
        "days": [
            {
                "day_index": 1,
                "date": "2026-10-16",
                "weather": {
                    "temp_min": 20,
                    "temp_max": 28,
                    "icon": "sunny",
                    "description": "晴",
                    "source": "llm",
                },
                "nodes": [],
                "edges": [],
            }
        ],
        "meta": {"warnings": []},
    }
    forecast = [
        {
            "date": "2026-10-16",
            "temp_min": 24,
            "temp_max": 31,
            "icon": "rain",
            "description": "中雨",
            "source": "api",
        }
    ]
    out = apply_forecast_to_itinerary(itin, forecast)
    w = out["days"][0]["weather"]
    assert w["source"] == "api"
    assert w["icon"] == "rain"
    assert w["temp_min"] == 24
    assert any("API 天气预报" in x for x in out["meta"]["warnings"])
    print("apply_forecast OK")


def test_rain_outdoor_warning():
    itin = {
        "days": [
            {
                "day_index": 1,
                "date": "2026-10-16",
                "weather": {"icon": "rain", "source": "api"},
                "nodes": [
                    {"name": "A公园", "category": "attraction", "is_optional": False},
                    {"name": "B海滩", "category": "attraction", "is_optional": False},
                    {"name": "C广场", "category": "landmark", "is_optional": False},
                ],
            }
        ],
        "meta": {"warnings": []},
    }
    notes = audit_rain_outdoor_days(itin)
    assert notes and "雨" in notes[0]
    print("rain_outdoor OK")


def test_commute_warning():
    # Far-apart nodes (~15km+) in Singapore-ish coords
    itin = {
        "days": [
            {
                "day_index": 2,
                "date": "2026-10-17",
                "weather": {"icon": "sunny"},
                "nodes": [
                    {"name": "西", "category": "attraction", "lat": 1.30, "lng": 103.70},
                    {"name": "东", "category": "attraction", "lat": 1.35, "lng": 103.99},
                    {"name": "南", "category": "attraction", "lat": 1.25, "lng": 103.85},
                ],
                "edges": [
                    {"type": "primary", "duration_minutes": 40},
                    {"type": "primary", "duration_minutes": 40},
                ],
            }
        ],
        "meta": {"warnings": []},
    }
    notes = audit_commute_load(itin)
    assert notes, notes
    print("commute_audit OK")


def test_prompt_blocks():
    weather = format_weather_constraints_block(
        [{"date": "2026-10-16", "icon": "rain", "temp_min": 24, "temp_max": 30, "description": "雨"}]
    )
    assert "BEGIN WEATHER" in weather
    assert "2026-10-16" in weather

    facts = format_poi_fact_block(
        [
            {
                "name": "滨海湾花园",
                "verified": True,
                "place_types": ["tourist_attraction"],
                "rating": 4.6,
                "hours_text": "9:00–21:00",
            }
        ]
    )
    assert "BEGIN POI_FACTS" in facts
    assert "滨海湾花园" in facts

    tr = TripRequestIn(destination="新加坡", date_start="2026-10-16", day_count=1)
    user = _build_generate_user(
        tr,
        None,
        [{"title": "笔记", "url": "https://example.com", "snippet": "去滨海湾"}],
        poi_candidates=[
            {
                "name": "滨海湾花园",
                "verified": True,
                "mentions": 3,
                "place_types": ["park"],
                "rating": 4.5,
                "hours_text": "全天",
            }
        ],
        forecast=[
            {
                "date": "2026-10-16",
                "icon": "rain",
                "temp_min": 24,
                "temp_max": 30,
                "description": "雨",
            }
        ],
    )
    assert "BEGIN WEATHER" in user
    assert "BEGIN POI_FACTS" in user
    print("prompt_blocks OK")


def test_enrich_pipeline():
    itin = {
        "days": [
            {
                "day_index": 1,
                "date": "2026-10-16",
                "weather": {"icon": "sunny", "source": "llm", "temp_min": 20, "temp_max": 28, "description": "x"},
                "nodes": [
                    {"name": "A", "category": "attraction", "is_optional": False, "lat": 1.3, "lng": 103.7},
                    {"name": "B", "category": "attraction", "is_optional": False, "lat": 1.35, "lng": 103.99},
                    {"name": "C", "category": "attraction", "is_optional": False, "lat": 1.25, "lng": 103.85},
                ],
                "edges": [{"type": "primary", "duration_minutes": 90}, {"type": "primary", "duration_minutes": 90}],
            }
        ],
        "meta": {"warnings": []},
    }
    out = enrich_itinerary_credibility(
        itin,
        [{"date": "2026-10-16", "icon": "rain", "temp_min": 22, "temp_max": 26, "description": "雨", "source": "api"}],
    )
    assert out["days"][0]["weather"]["source"] == "api"
    assert out["meta"]["warnings"]
    print("enrich_pipeline OK")


if __name__ == "__main__":
    test_map_qweather_icon()
    test_apply_forecast_overlay()
    test_rain_outdoor_warning()
    test_commute_warning()
    test_prompt_blocks()
    test_enrich_pipeline()
    print("all credibility tests OK")
