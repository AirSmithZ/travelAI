#!/usr/bin/env python3
"""住宿段切分单测。"""

from app.services.stay_zone.segment import segment_stays


def test_segment_from_itinerary():
    itinerary = {
        "days": [
            {"day_index": 1, "date": "2026-10-16", "region": "滨海湾", "nodes": []},
            {"day_index": 2, "date": "2026-10-17", "region": "乌节路", "nodes": []},
        ]
    }
    tr = {"destination": "新加坡", "date_start": "2026-10-16", "date_end": "2026-10-17"}
    segs = segment_stays(tr, itinerary)
    assert len(segs) == 1
    assert segs[0].city == "新加坡"
    assert segs[0].check_in == "2026-10-16"
    assert segs[0].check_out == "2026-10-17"
    assert segs[0].day_indices == [0, 1]
    print("segment from itinerary OK")


def test_segment_without_itinerary():
    tr = {"destination": "曼谷", "date_start": "2026-11-01", "date_end": "2026-11-05", "day_count": 4}
    segs = segment_stays(tr, None)
    assert len(segs) == 1
    assert segs[0].city == "曼谷"
    print("segment without itinerary OK")


if __name__ == "__main__":
    test_segment_from_itinerary()
    test_segment_without_itinerary()
    print("all passed")
