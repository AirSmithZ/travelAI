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


def test_multi_segments_from_trip_request():
    itinerary = {
        "days": [
            {"day_index": 1, "date": "2026-10-01", "nodes": []},
            {"day_index": 2, "date": "2026-10-02", "nodes": []},
            {"day_index": 3, "date": "2026-10-03", "nodes": []},
            {"day_index": 4, "date": "2026-10-04", "nodes": []},
            {"day_index": 5, "date": "2026-10-05", "nodes": []},
        ]
    }
    tr = {
        "destination": "胡志明市",
        "date_start": "2026-10-01",
        "date_end": "2026-10-06",
        "segments": [
            {
                "id": "seg_1",
                "city": "胡志明市",
                "date_start": "2026-10-01",
                "date_end": "2026-10-04",
            },
            {
                "id": "seg_2",
                "city": "芽庄",
                "date_start": "2026-10-04",
                "date_end": "2026-10-06",
            },
        ],
    }
    segs = segment_stays(tr, itinerary)
    assert len(segs) == 2
    assert segs[0].segment_id == "seg_1"
    assert segs[0].city == "胡志明市"
    assert segs[0].day_indices == [0, 1, 2]
    assert segs[1].segment_id == "seg_2"
    assert segs[1].city == "芽庄"
    assert segs[1].day_indices == [3, 4]
    print("multi segments from trip_request OK")


def test_multi_segments_without_itinerary_day_count():
    tr = {
        "destination": "曼谷",
        "day_count": 6,
        "segments": [
            {"id": "seg_1", "city": "曼谷", "date_start": "2026-11-01", "date_end": "2026-11-04"},
            {"id": "seg_2", "city": "清迈", "date_start": "2026-11-04", "date_end": "2026-11-07"},
        ],
    }
    segs = segment_stays(tr, None)
    assert len(segs) == 2
    assert segs[0].city == "曼谷"
    assert segs[1].city == "清迈"
    assert segs[0].day_indices
    assert segs[1].day_indices
    print("multi segments without itinerary OK")


if __name__ == "__main__":
    test_segment_from_itinerary()
    test_segment_without_itinerary()
    test_multi_segments_from_trip_request()
    test_multi_segments_without_itinerary_day_count()
    print("all passed")
