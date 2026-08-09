#!/usr/bin/env python3
"""Unit tests for confirmed-hotel anchor enforcement (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.intel_anchor_enforce import enforce_travel_intel_anchors


def _base_itinerary() -> dict:
    return {
        "id": "t1",
        "destination": "新加坡",
        "title": "新加坡 2 日游",
        "days": [
            {
                "day_index": 1,
                "date": "2026-08-30",
                "weekday": "周日",
                "label": "抵达",
                "region": "滨海湾",
                "nodes": [
                    {
                        "id": "d1-n1",
                        "name": "樟宜机场",
                        "category": "airport",
                        "lat": 1.36,
                        "lng": 103.99,
                        "is_optional": False,
                    },
                    {
                        "id": "d1-n2",
                        "name": "滨海湾金沙酒店",  # invented by LLM
                        "category": "hotel",
                        "lat": 1.28,
                        "lng": 103.86,
                        "is_optional": False,
                    },
                ],
                "edges": [
                    {
                        "id": "d1-e1",
                        "from": "d1-n1",
                        "to": "d1-n2",
                        "type": "primary",
                        "transport_mode": "taxi",
                        "duration_minutes": 30,
                    }
                ],
            },
            {
                "day_index": 2,
                "date": "2026-08-31",
                "weekday": "周一",
                "label": "市区",
                "region": "乌节",
                "nodes": [
                    {
                        "id": "d2-n1",
                        "name": "乌节路逛街",
                        "category": "attraction",
                        "lat": 1.3,
                        "lng": 103.83,
                        "is_optional": False,
                    },
                    {
                        "id": "d2-n2",
                        "name": "某某精品旅馆",
                        "category": "hotel",
                        "lat": 0,
                        "lng": 0,
                        "is_optional": False,
                    },
                ],
                "edges": [],
            },
        ],
        "meta": {"warnings": []},
    }


def test_replaces_invented_hotel_name():
    intel = {
        "hotels": [
            {
                "id": "h1",
                "sequence": 1,
                "name": "Hotel Supreme",
                "city": "新加坡",
                "check_in": "2026-08-30",
                "check_out": "2026-09-01",
                "lat": 1.301,
                "lng": 103.841,
                "address": "Orchard",
            }
        ],
        "recommended_stay_zones": [],
    }
    out = enforce_travel_intel_anchors(_base_itinerary(), intel)
    hotels = [
        n
        for d in out["days"]
        for n in d["nodes"]
        if n.get("category") == "hotel"
    ]
    assert hotels, "expected hotel nodes"
    assert all(n["name"] == "Hotel Supreme" for n in hotels), hotels
    assert not any("金沙" in n["name"] or "精品" in n["name"] for n in hotels)
    assert hotels[0]["lat"] == 1.301
    assert out["meta"].get("hotel_bindings")
    assert any(b.get("hotel_name") == "Hotel Supreme" for b in out["meta"]["hotel_bindings"])


def test_noop_without_hotels():
    base = _base_itinerary()
    out = enforce_travel_intel_anchors(base, {"hotels": [], "flights": []})
    assert out["days"][0]["nodes"][1]["name"] == "滨海湾金沙酒店"


if __name__ == "__main__":
    test_replaces_invented_hotel_name()
    test_noop_without_hotels()
    print("OK: intel_anchor_enforce tests passed")
