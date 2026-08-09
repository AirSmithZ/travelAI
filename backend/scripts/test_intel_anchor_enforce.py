#!/usr/bin/env python3
"""Unit tests for confirmed-hotel day-loop enforcement (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.intel_anchor_enforce import (
    ARRIVE_BUFFER_MIN,
    DEPART_BUFFER_MIN,
    enforce_travel_intel_anchors,
    _parse_hhmm,
)


def _base_itinerary() -> dict:
    return {
        "id": "t1",
        "destination": "新加坡",
        "title": "新加坡 3 日游",
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
                        "name": "滨海湾金沙酒店",
                        "category": "hotel",
                        "lat": 1.28,
                        "lng": 103.86,
                        "is_optional": False,
                    },
                ],
                "edges": [],
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
            {
                "day_index": 3,
                "date": "2026-09-01",
                "weekday": "周二",
                "label": "返程",
                "region": "樟宜",
                "nodes": [
                    {
                        "id": "d3-n1",
                        "name": "早餐店",
                        "category": "restaurant",
                        "lat": 1.3,
                        "lng": 103.84,
                        "is_optional": False,
                    },
                    {
                        "id": "d3-n2",
                        "name": "樟宜机场",
                        "category": "airport",
                        "lat": 1.36,
                        "lng": 103.99,
                        "is_optional": False,
                    },
                ],
                "edges": [],
            },
        ],
        "meta": {"warnings": []},
    }


def test_replaces_invented_hotel_name_and_day_loop():
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
    d1, d2, d3 = out["days"]

    # Arrival: airport … hotel
    assert d1["nodes"][0]["category"] == "airport"
    assert d1["nodes"][-1]["name"] == "Hotel Supreme"
    assert d1["nodes"][-1]["category"] == "hotel"
    assert not any(
        n["category"] == "hotel" and n is not d1["nodes"][-1] for n in d1["nodes"]
    )

    # Normal: hotel … hotel
    assert d2["nodes"][0]["name"] == "Hotel Supreme"
    assert d2["nodes"][-1]["name"] == "Hotel Supreme"
    assert d2["nodes"][0]["id"] != d2["nodes"][-1]["id"]
    assert all(n["name"] != "某某精品旅馆" for n in d2["nodes"])

    # Departure: hotel … airport
    assert d3["nodes"][0]["name"] == "Hotel Supreme"
    assert d3["nodes"][-1]["category"] == "airport"

    assert out["meta"].get("hotel_bindings")
    assert any(b.get("hotel_name") == "Hotel Supreme" for b in out["meta"]["hotel_bindings"])
    assert out.get("cross_day_edges")


def test_noop_without_hotels():
    base = _base_itinerary()
    out = enforce_travel_intel_anchors(base, {"hotels": [], "flights": []})
    assert out["days"][0]["nodes"][1]["name"] == "滨海湾金沙酒店"


def test_return_day_no_evening_hotel_despite_zone_covers():
    """P92: confirmed return day must not get 入住/过夜 hotel (zone covers used to include it)."""
    itinerary = {
        "id": "t2",
        "destination": "新加坡",
        "title": "新加坡 4 日",
        "days": [
            {
                "day_index": 1,
                "date": "2026-08-30",
                "label": "D1",
                "nodes": [
                    {"id": "a1", "name": "樟宜机场", "category": "airport", "lat": 1.36, "lng": 103.99, "is_optional": False},
                    {"id": "h1", "name": "旧店", "category": "hotel", "lat": 0, "lng": 0, "is_optional": False},
                ],
                "edges": [],
            },
            {
                "day_index": 2,
                "date": "2026-08-31",
                "label": "D2",
                "nodes": [
                    {"id": "p2", "name": "景点", "category": "attraction", "lat": 1.3, "lng": 103.8, "is_optional": False},
                ],
                "edges": [],
            },
            {
                "day_index": 3,
                "date": "2026-09-01",
                "label": "D3",
                "nodes": [
                    {"id": "p3", "name": "景点", "category": "attraction", "lat": 1.3, "lng": 103.8, "is_optional": False},
                ],
                "edges": [],
            },
            {
                "day_index": 4,
                "date": "2026-09-02",
                "label": "返程",
                "nodes": [
                    {"id": "h4", "name": "旧店", "category": "hotel", "lat": 0, "lng": 0, "is_optional": False},
                    {"id": "a4", "name": "樟宜机场", "category": "airport", "lat": 1.36, "lng": 103.99, "is_optional": False},
                ],
                "edges": [],
            },
        ],
        "meta": {"warnings": []},
    }
    intel = {
        "flights": [
            {
                "role": "outbound",
                "depart_at": "2026-08-30T00:35:00",
                "arrive_at": "2026-08-30T05:55:00",
            },
            {
                "role": "return",
                "depart_at": "2026-09-02T00:55:00",
                "arrive_at": "2026-09-02T06:20:00",
            },
        ],
        "hotels": [
            {
                "id": "h1",
                "sequence": 1,
                "name": "lyf Funan Singapore",
                "zone_id": "z1",
                "check_in": "2026-08-30",
                "check_out": "2026-09-02",
                "lat": 1.29,
                "lng": 103.85,
            }
        ],
        "recommended_stay_zones": [
            {"id": "z1", "status": "confirmed", "covers_day_indices": [0, 1, 2, 3]},
        ],
    }
    out = enforce_travel_intel_anchors(itinerary, intel)
    d1, d2, d3, d4 = out["days"]

    assert d1["nodes"][0]["category"] == "airport"
    assert d1["nodes"][-1]["name"] == "lyf Funan Singapore"
    assert d1["nodes"][-1]["category"] == "hotel"

    assert d2["nodes"][0]["category"] == "hotel"
    assert d2["nodes"][-1]["category"] == "hotel"

    assert d4["nodes"][0]["name"] == "lyf Funan Singapore"
    assert d4["nodes"][0]["category"] == "hotel"
    assert d4["nodes"][-1]["category"] == "airport"
    hotel_nodes_d4 = [n for n in d4["nodes"] if n["category"] == "hotel"]
    assert len(hotel_nodes_d4) == 1, "return day must not have evening check-in hotel"
    tips = " ".join(hotel_nodes_d4[0].get("tips") or [])
    assert "过夜" not in tips
    assert "出发" in tips or "退房" in tips

    # P94: airport clocks follow confirmed flights; body nodes not before arrive buffer
    ap1 = d1["nodes"][0]
    assert ap1["start_time"] == "05:55"
    arrive_end = _parse_hhmm(ap1["end_time"])
    assert arrive_end == _parse_hhmm("05:55") + ARRIVE_BUFFER_MIN
    for n in d1["nodes"][1:]:
        if n.get("category") == "hotel" and "过夜" in " ".join(n.get("tips") or []):
            continue
        st = _parse_hhmm(n.get("start_time"))
        if st is not None and st < 18 * 60:
            assert st >= arrive_end, f"{n.get('name')} starts before airport end"

    ap4 = d4["nodes"][-1]
    assert ap4["end_time"] == "00:55"
    dep_start = _parse_hhmm(ap4["start_time"])
    assert dep_start == (_parse_hhmm("00:55") - DEPART_BUFFER_MIN) % (24 * 60)
    hotel_st = _parse_hhmm(hotel_nodes_d4[0].get("start_time"))
    assert hotel_st is not None
    # Early return: morning hotel must not be the default 08:00 after takeoff
    assert hotel_nodes_d4[0].get("start_time") != "08:00"


def test_flight_pin_and_cascade_without_prior_airport_times():
    """LLM invents wrong airport/POI clocks → enforce rewrites from flights."""
    itinerary = {
        "id": "t3",
        "destination": "新加坡",
        "title": "2 日",
        "days": [
            {
                "day_index": 1,
                "date": "2026-08-30",
                "label": "抵达",
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
                        "name": "滨海湾",
                        "category": "attraction",
                        "lat": 1.28,
                        "lng": 103.86,
                        "start_time": "06:00",
                        "end_time": "08:00",
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
            },
            {
                "day_index": 2,
                "date": "2026-08-31",
                "label": "返程",
                "nodes": [
                    {
                        "id": "h2",
                        "name": "旧店",
                        "category": "hotel",
                        "lat": 0,
                        "lng": 0,
                        "is_optional": False,
                    },
                    {
                        "id": "p2",
                        "name": "早餐",
                        "category": "restaurant",
                        "lat": 1.3,
                        "lng": 103.8,
                        "start_time": "07:00",
                        "end_time": "08:00",
                        "is_optional": False,
                    },
                ],
                "edges": [],
            },
        ],
        "meta": {"warnings": []},
    }
    intel = {
        "flights": [
            {
                "id": "f-out",
                "role": "outbound",
                "depart_at": "2026-08-30T00:35:00",
                "arrive_at": "2026-08-30T05:55:00",
                "dest_iata": "SIN",
            },
            {
                "id": "f-ret",
                "role": "return",
                "depart_at": "2026-08-31T18:30:00",
                "arrive_at": "2026-08-31T23:00:00",
                "origin_iata": "SIN",
            },
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
        "recommended_stay_zones": [],
    }
    out = enforce_travel_intel_anchors(itinerary, intel)
    d1, d2 = out["days"]

    assert d1["nodes"][0]["start_time"] == "05:55"
    assert d1["nodes"][0]["end_time"] == "07:10"
    poi = next(n for n in d1["nodes"] if n["category"] == "attraction")
    assert _parse_hhmm(poi["start_time"]) >= _parse_hhmm("07:10")

    assert d2["nodes"][-1]["category"] == "airport"
    assert d2["nodes"][-1]["end_time"] == "18:30"
    assert d2["nodes"][-1]["start_time"] == "16:30"
    assert out["meta"].get("flight_bindings")
    assert any(b.get("role") == "outbound" for b in out["meta"]["flight_bindings"])


def test_injects_airport_when_missing():
    itinerary = {
        "id": "t4",
        "destination": "新加坡",
        "title": "1 日",
        "days": [
            {
                "day_index": 1,
                "date": "2026-08-30",
                "nodes": [
                    {
                        "id": "p1",
                        "name": "景点",
                        "category": "attraction",
                        "lat": 1.3,
                        "lng": 103.8,
                        "start_time": "09:00",
                        "end_time": "11:00",
                        "is_optional": False,
                    },
                ],
                "edges": [],
            }
        ],
        "meta": {},
    }
    intel = {
        "flights": [
            {
                "role": "outbound",
                "arrive_at": "2026-08-30T08:00:00",
                "depart_at": "2026-08-30T01:00:00",
                "dest_iata": "SIN",
            }
        ],
        "hotels": [],
    }
    out = enforce_travel_intel_anchors(itinerary, intel)
    nodes = out["days"][0]["nodes"]
    assert nodes[0]["category"] == "airport"
    assert nodes[0]["start_time"] == "08:00"
    assert nodes[0]["end_time"] == "09:15"


if __name__ == "__main__":
    test_replaces_invented_hotel_name_and_day_loop()
    test_noop_without_hotels()
    test_return_day_no_evening_hotel_despite_zone_covers()
    test_flight_pin_and_cascade_without_prior_airport_times()
    test_injects_airport_when_missing()
    print("OK: intel_anchor_enforce tests passed")
