#!/usr/bin/env python3
"""住宿片区打分单测。"""

from app.services.stay_zone.score import (
    SPLIT_THRESHOLD_KM,
    compute_zone_radius_m,
    day_weighted_centroid,
    detect_split_warnings,
    haversine_km,
    score_hub,
)
from app.services.stay_zone.segment import StaySegment


def test_haversine():
    # Singapore Marina ~ Changi approx 17km
    d = haversine_km(1.283, 103.860, 1.364, 103.991)
    assert 15 < d < 20
    print("haversine OK")


def test_day_centroid():
    itinerary = {
        "days": [
            {
                "nodes": [
                    {"lat": 1.28, "lng": 103.85, "category": "attraction", "start_time": "10:00", "end_time": "12:00"},
                    {"lat": 1.30, "lng": 103.87, "category": "restaurant", "start_time": "18:00", "end_time": "20:00"},
                ]
            }
        ]
    }
    c = day_weighted_centroid(itinerary, 0)
    assert c is not None
    assert 1.28 < c[0] < 1.30
    print("centroid OK")


def test_score_prefers_closer_hub():
    seg = StaySegment(city="新加坡", check_in="2026-10-16", check_out="2026-10-17", day_indices=[0])
    itinerary = {
        "days": [
            {"nodes": [{"lat": 1.29, "lng": 103.86, "category": "attraction", "start_time": "10:00", "end_time": "14:00"}]}
        ]
    }
    near = score_hub(1.29, 103.86, query="Marina MRT", segment=seg, itinerary=itinerary)
    far = score_hub(1.36, 103.99, query="Changi airport", segment=seg, itinerary=itinerary)
    assert near > far
    print("score closer hub OK")


def test_split_warning():
    itinerary = {
        "days": [
            {"nodes": [{"lat": 1.28, "lng": 103.85, "category": "attraction"}]},
            {"nodes": [{"lat": 1.36, "lng": 103.99, "category": "attraction"}]},
        ]
    }
    seg = StaySegment(city="新加坡", check_in="2026-10-16", check_out="2026-10-17", day_indices=[0, 1])
    warnings = detect_split_warnings(seg, itinerary)
    assert len(warnings) >= 1
    assert str(SPLIT_THRESHOLD_KM)[:3] in warnings[0] or "km" in warnings[0]
    print("split warning OK")


def test_radius_cap():
    zone = {"covers_day_indices": [0]}
    itinerary = {
        "days": [
            {
                "nodes": [
                    {"lat": 1.28, "lng": 103.85, "category": "attraction"},
                    {"lat": 1.40, "lng": 104.0, "category": "attraction"},
                ]
            }
        ]
    }
    r = compute_zone_radius_m(1.28, 103.85, zone, itinerary)
    assert 600 <= r <= 1200
    print("radius cap OK")


if __name__ == "__main__":
    test_haversine()
    test_day_centroid()
    test_score_prefers_closer_hub()
    test_split_warning()
    test_radius_cap()
    print("all passed")
