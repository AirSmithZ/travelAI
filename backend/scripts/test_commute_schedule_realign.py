#!/usr/bin/env python3
"""TRN-02b: after longer commute edges, POI clocks shift via realign."""

from __future__ import annotations

from app.services.intel_anchor_enforce import (
    align_day_schedules,
    realign_schedules_after_commute,
    _parse_hhmm,
)


def _day_itin(edge_minutes: int) -> dict:
    return {
        "title": "t",
        "days": [
            {
                "day_index": 1,
                "date": "2026-10-16",
                "weekday": "五",
                "label": "D1",
                "nodes": [
                    {
                        "id": "n1",
                        "name": "景点A",
                        "category": "attraction",
                        "lat": 1.28,
                        "lng": 103.85,
                        "start_time": "09:00",
                        "end_time": "10:30",
                        "duration_minutes": 90,
                        "is_optional": False,
                    },
                    {
                        "id": "n2",
                        "name": "景点B",
                        "category": "attraction",
                        "lat": 1.30,
                        "lng": 103.83,
                        "start_time": "10:50",
                        "end_time": "12:20",
                        "duration_minutes": 90,
                        "is_optional": False,
                    },
                    {
                        "id": "n3",
                        "name": "酒店过夜",
                        "category": "hotel",
                        "lat": 1.29,
                        "lng": 103.84,
                        "start_time": "21:00",
                        "end_time": "08:00",
                        "tips": ["过夜"],
                        "is_optional": False,
                    },
                ],
                "edges": [
                    {
                        "id": "e1",
                        "from": "n1",
                        "to": "n2",
                        "type": "primary",
                        "transport_mode": "subway",
                        "duration_minutes": edge_minutes,
                        "route_source": "directions",
                    },
                    {
                        "id": "e2",
                        "from": "n2",
                        "to": "n3",
                        "type": "primary",
                        "transport_mode": "taxi",
                        "duration_minutes": 20,
                    },
                ],
            }
        ],
        "cross_day_edges": [],
        "meta": {"warnings": [], "flight_bindings": []},
    }


def test_longer_edge_pushes_next_node():
    short = realign_schedules_after_commute(_day_itin(20), note=True)
    long = realign_schedules_after_commute(_day_itin(60), note=True)
    b_short = _parse_hhmm(short["days"][0]["nodes"][1]["start_time"])
    b_long = _parse_hhmm(long["days"][0]["nodes"][1]["start_time"])
    assert b_short is not None and b_long is not None
    assert b_long >= b_short + 40, (b_short, b_long)
    # evening hotel stays
    assert long["days"][0]["nodes"][2]["start_time"] == "21:00"
    assert "已按通勤边时长重排当日节点时刻" in (long.get("meta") or {}).get("warnings", [])
    print("longer edge pushes next OK")


def test_align_uses_edge_gap():
    itin = _day_itin(45)
    out = align_day_schedules(itin, pinned_ids=set())
    # A ends 10:30 → +45 → B starts 11:15
    assert out["days"][0]["nodes"][1]["start_time"] == "11:15"
    print("edge gap align OK")


if __name__ == "__main__":
    test_longer_edge_pushes_next_node()
    test_align_uses_edge_gap()
    print("all schedule realign tests passed")
