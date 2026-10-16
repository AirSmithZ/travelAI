#!/usr/bin/env python3
"""FLOW-MC-4: city_for_day_date + HARD multi-segment smoke."""

from app.services.stay_zone.segment import city_for_day_date, stamp_day_segment_ids
from app.services.itinerary_llm import _format_travel_intel_block


def test_city_for_day_prefers_hotel():
    tr = {
        "destination": "胡志明市",
        "segments": [
            {"id": "seg_1", "city": "胡志明市", "date_start": "2026-10-01", "date_end": "2026-10-04"},
            {"id": "seg_2", "city": "芽庄", "date_start": "2026-10-04", "date_end": "2026-10-07"},
        ],
    }
    hotels = [
        {
            "sequence": 1,
            "city": "胡志明市",
            "check_in": "2026-10-01",
            "check_out": "2026-10-04",
            "segment_id": "seg_1",
            "lat": 10.7,
            "lng": 106.7,
            "name": "A",
        },
        {
            "sequence": 2,
            "city": "芽庄",
            "check_in": "2026-10-04",
            "check_out": "2026-10-07",
            "segment_id": "seg_2",
            "lat": 12.2,
            "lng": 109.2,
            "name": "B",
        },
    ]
    d1 = city_for_day_date("2026-10-02", tr, hotels)
    assert d1 and d1.city == "胡志明市" and d1.segment_id == "seg_1"
    d2 = city_for_day_date("2026-10-05", tr, hotels)
    assert d2 and d2.city == "芽庄" and d2.segment_id == "seg_2"
    assert d2.hotel and d2.hotel["name"] == "B"
    print("city_for_day hotel OK")


def test_stamp_day_segment_ids():
    tr = {
        "destination": "胡志明市",
        "segments": [
            {"id": "seg_1", "city": "胡志明市", "date_start": "2026-10-01", "date_end": "2026-10-04"},
            {"id": "seg_2", "city": "芽庄", "date_start": "2026-10-04", "date_end": "2026-10-07"},
        ],
    }
    itinerary = {
        "days": [
            {"day_index": 1, "date": "2026-10-02", "region": "胡志明市", "nodes": []},
            {"day_index": 2, "date": "2026-10-05", "region": "胡志明市", "nodes": []},
        ]
    }
    hotels = [
        {
            "sequence": 2,
            "city": "芽庄",
            "check_in": "2026-10-04",
            "check_out": "2026-10-07",
            "segment_id": "seg_2",
            "name": "B",
        }
    ]
    stamp_day_segment_ids(itinerary, tr, hotels)
    assert itinerary["days"][1]["segment_id"] == "seg_2"
    assert itinerary["days"][1]["region"] == "芽庄"
    print("stamp_day_segment_ids OK")


def test_hard_block_lists_segments():
    tr = {
        "destination": "胡志明市",
        "segments": [
            {"id": "seg_1", "city": "胡志明市", "date_start": "2026-10-01", "date_end": "2026-10-04"},
            {"id": "seg_2", "city": "芽庄", "date_start": "2026-10-04", "date_end": "2026-10-07"},
        ],
    }
    intel = {
        "flights": [
            {
                "sequence": 1,
                "role": "outbound",
                "origin_iata": "PVG",
                "dest_iata": "SGN",
                "segment_id": "seg_1",
            }
        ],
        "hotels": [
            {
                "sequence": 1,
                "name": "A",
                "city": "胡志明市",
                "segment_id": "seg_1",
                "check_in": "2026-10-01",
                "check_out": "2026-10-04",
            },
            {
                "sequence": 2,
                "name": "B",
                "city": "芽庄",
                "segment_id": "seg_2",
                "check_in": "2026-10-04",
                "check_out": "2026-10-07",
            },
        ],
    }
    block = _format_travel_intel_block(intel, tr)
    assert "city_segments" in block
    assert "by_segment" in block
    assert "芽庄" in block
    assert "多城城段" in block
    assert '"segment_id": "seg_2"' in block or "seg_2" in block
    print("HARD multi-segment OK")


if __name__ == "__main__":
    test_city_for_day_prefers_hotel()
    test_stamp_day_segment_ids()
    test_hard_block_lists_segments()
    print("all passed")
