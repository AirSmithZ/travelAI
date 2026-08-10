#!/usr/bin/env python3
"""TRN-01: commute hint extraction + directions parse + lookup orchestration."""

from __future__ import annotations

from unittest.mock import patch

from app.schemas.commute import CommuteLookupRequest, CommutePoint
from app.services.commute.directions import parse_directions_payload, select_travel_modes
from app.services.commute.lookup import lookup_commute
from app.services.commute.route_hints import extract_route_hints, relevant_hints


def test_extract_ferry_pair():
    text = "第二天从仙本那码头坐快艇到马布岛，海路约45分钟，再住水屋。"
    hints = extract_route_hints(text, from_name="仙本那码头", to_name="马布岛")
    assert hints, "expected ferry hint"
    top = relevant_hints(hints)[0]
    assert top.transport_mode == "ferry"
    assert top.non_routable
    assert top.duration_minutes == 45
    print("ferry pair OK")


def test_extract_trail_pair():
    text = "早上从河口村徒步到彩虹瀑布，山路大约90分钟。"
    hints = extract_route_hints(text, from_name="河口村", to_name="彩虹瀑布")
    rel = relevant_hints(hints)
    assert rel
    assert rel[0].transport_mode == "walk"
    assert rel[0].non_routable
    assert rel[0].duration_minutes == 90
    print("trail pair OK")


def test_select_modes_by_distance():
    assert select_travel_modes(500) == [2]
    assert 3 in select_travel_modes(2000)
    assert 0 in select_travel_modes(5000)
    print("mode select OK")


def test_parse_directions_driving():
    payload = {
        "directions": [
            {
                "travel_mode": "Driving",
                "via": "Main St",
                "distance": 3200,
                "duration": 600,
                "formatted_duration": "10 min",
            }
        ]
    }
    legs = parse_directions_payload(payload)
    assert len(legs) == 1
    assert legs[0].transport_mode == "taxi"
    assert legs[0].duration_minutes == 10
    assert legs[0].distance_meters == 3200
    print("parse driving OK")


def test_lookup_prefers_user_hint_when_directions_empty():
    body = CommuteLookupRequest(
        from_point=CommutePoint(lat=4.39, lng=118.61, name="仙本那码头"),
        to_point=CommutePoint(lat=4.25, lng=118.62, name="马布岛"),
        free_text="仙本那码头到马布岛坐快艇约40分钟",
        use_directions=True,
    )

    with patch(
        "app.services.commute.lookup.fetch_direction_legs",
        return_value=([], ["Directions 未返回可用路线（海路/山路等可能搜不到）"]),
    ):
        resp = lookup_commute(body)

    assert resp.candidates
    assert any(c.source == "user_hint" and c.transport_mode == "ferry" for c in resp.candidates)
    assert any(c.recommended for c in resp.candidates if c.source == "user_hint")
    print("lookup hint fallback OK")


def test_lookup_estimate_without_prompt_or_directions():
    body = CommuteLookupRequest(
        from_point=CommutePoint(lat=1.28, lng=103.85, name="A"),
        to_point=CommutePoint(lat=1.29, lng=103.86, name="B"),
        free_text="",
        use_directions=False,
    )
    resp = lookup_commute(body)
    assert resp.candidates
    assert all(c.source == "estimate" for c in resp.candidates)
    print("estimate fallback OK")


if __name__ == "__main__":
    test_extract_ferry_pair()
    test_extract_trail_pair()
    test_select_modes_by_distance()
    test_parse_directions_driving()
    test_lookup_prefers_user_hint_when_directions_empty()
    test_lookup_estimate_without_prompt_or_directions()
    print("all commute tests passed")
