#!/usr/bin/env python3
"""TRN-02: suspicious edge detection + auto enrich + directions cache."""

from __future__ import annotations

from unittest.mock import patch

from app.schemas.commute import CommuteCandidate, CommuteLookupResponse
from app.services.commute.cache import cache_get, cache_key, cache_set, clear_commute_cache
from app.services.commute.directions import DirectionLeg
from app.services.commute.enrich import (
    enrich_itinerary_commute,
    is_suspicious_edge,
    list_suspicious_edges,
)


def _itin() -> dict:
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
                        "name": "仙本那码头",
                        "category": "attraction",
                        "lat": 4.415,
                        "lng": 118.611,
                        "is_optional": False,
                    },
                    {
                        "id": "n2",
                        "name": "马布岛",
                        "category": "attraction",
                        "lat": 4.245,
                        "lng": 118.625,
                        "is_optional": False,
                    },
                    {
                        "id": "n3",
                        "name": "近处咖啡馆",
                        "category": "food",
                        "lat": 4.416,
                        "lng": 118.612,
                        "is_optional": False,
                    },
                ],
                "edges": [
                    {
                        "id": "e1",
                        "from": "n1",
                        "to": "n2",
                        "type": "primary",
                        "transport_mode": "walk",
                        "duration_minutes": 20,
                    },
                    {
                        "id": "e2",
                        "from": "n1",
                        "to": "n3",
                        "type": "primary",
                        "transport_mode": "walk",
                        "duration_minutes": 5,
                    },
                ],
            }
        ],
        "cross_day_edges": [],
        "meta": {"warnings": []},
    }


def test_suspicious_long_walk():
    itin = _itin()
    day = itin["days"][0]
    a, b = day["nodes"][0], day["nodes"][1]
    # ~19km straight — walk/20 is suspicious
    assert is_suspicious_edge(day["edges"][0], a, b, 19000.0)
    # ~150m — fine
    assert not is_suspicious_edge(day["edges"][1], a, day["nodes"][2], 150.0)
    print("suspicious detect OK")


def test_list_caps_and_skips_verified():
    itin = _itin()
    itin["days"][0]["edges"][0]["route_source"] = "directions"
    ranked = list_suspicious_edges(itin, max_edges=8)
    assert all(t[2].get("id") != "e1" for t in ranked)
    print("skip verified OK")


def test_enrich_applies_user_hint_without_directions():
    itin = _itin()
    fake = CommuteLookupResponse(
        candidates=[
            CommuteCandidate(
                transport_mode="ferry",
                duration_minutes=40,
                label="海路/轮渡 约40分钟",
                summary="来自提示词",
                source="user_hint",
                recommended=True,
            )
        ],
        warnings=[],
        straight_line_meters=19000,
    )
    with patch(
        "app.services.commute.enrich.lookup_commute",
        return_value=fake,
    ):
        out = enrich_itinerary_commute(
            itin,
            free_text="仙本那码头到马布岛坐快艇约40分钟",
            use_directions=False,
        )
    edge = out["days"][0]["edges"][0]
    assert edge["transport_mode"] == "ferry"
    assert edge["duration_minutes"] == 40
    assert edge["route_source"] == "user_hint"
    assert out["meta"].get("commute_auto_enriched") == 1
    print("auto enrich hint OK")


def test_directions_cache_roundtrip():
    clear_commute_cache()
    legs = [
        DirectionLeg(
            transport_mode="subway",
            duration_minutes=18,
            distance_meters=4200,
            label="EW",
            summary="subway · EW",
        )
    ]
    key = cache_key(
        start_lat=1.28,
        start_lng=103.85,
        end_lat=1.30,
        end_lng=103.83,
        travel_mode=3,
    )
    cache_set(key, legs, ttl_sec=60)
    got = cache_get(key)
    assert got is not None
    assert got[0].transport_mode == "subway"
    assert got[0].duration_minutes == 18
    clear_commute_cache()
    print("cache OK")


if __name__ == "__main__":
    test_suspicious_long_walk()
    test_list_caps_and_skips_verified()
    test_enrich_applies_user_hint_without_directions()
    test_directions_cache_roundtrip()
    print("all enrich tests passed")
