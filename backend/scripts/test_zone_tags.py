#!/usr/bin/env python3
"""HOT-ZONE-TAG: fit_tag / bookable / seaside alts."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.stay_zone.segment import StaySegment  # noqa: E402
from app.services.stay_zone.zone_tags import (  # noqa: E402
    apply_tags_to_zones,
    assign_zone_tags,
    cities_same,
    detect_preference_themes,
    preference_blob,
)


def test_cities_same():
    assert cities_same("胡志明市", "胡志明")
    assert cities_same("Saigon", "胡志明市")
    assert not cities_same("芽庄", "胡志明市")
    print("cities_same OK")


def test_seaside_themes():
    blob = preference_blob(
        {"free_text": "想去海边", "preference_tags": ["休闲"], "notes": ""}
    )
    assert "seaside" in detect_preference_themes(blob)
    print("seaside_themes OK")


def test_assign_and_alts():
    tr = {
        "destination": "胡志明市",
        "free_text": "想住海边",
        "preference_tags": ["海边"],
        "date_start": "2026-10-02",
        "date_end": "2026-10-06",
    }
    zones = [
        {
            "sequence": 1,
            "city": "胡志明市",
            "label": "第一郡市中心",
            "check_in": "2026-10-02",
            "check_out": "2026-10-06",
            "rationale": "枢纽",
            "status": "proposed",
            "fit_tag": "current_anchor",
        }
    ]
    seg = StaySegment(
        city="胡志明市",
        check_in="2026-10-02",
        check_out="2026-10-06",
        day_indices=[0, 1, 2],
    )
    out = apply_tags_to_zones(zones, trip_request=tr, segments=[seg])
    tags = {z["fit_tag"] for z in out}
    assert "current_anchor" in tags
    assert "needs_city_change" in tags
    assert any(z["bookable"] is False for z in out if z["fit_tag"] == "needs_city_change")
    assert out[0]["fit_tag"] == "current_anchor"
    print("assign_and_alts OK", [(z["city"], z["fit_tag"], z["bookable"]) for z in out])


def test_same_city_override():
    z = assign_zone_tags(
        {"city": "芽庄", "label": "海边", "fit_tag": "current_anchor"},
        destination="胡志明市",
        themes={"seaside"},
    )
    assert z["fit_tag"] == "needs_city_change"
    assert z["bookable"] is False
    print("same_city_override OK")


def test_country_dest_uses_flight_anchor():
    """destination=越南 + SGN 航班 → 胡志明城内可锁；头顿仍需换城。"""
    from app.services.stay_zone.zone_tags import resolve_bookable_anchor

    tr = {
        "destination": "越南",
        "free_text": "海岛休闲与城市观光",
        "preference_tags": ["海岛", "城市观光", "低成本"],
        "date_start": "2026-10-02",
        "date_end": "2026-10-06",
    }
    flights = [
        {
            "role": "outbound",
            "sequence": 1,
            "origin_iata": "TFU",
            "dest_iata": "SGN",
        }
    ]
    anchor = resolve_bookable_anchor(tr, flights)
    assert "胡志明" in anchor or "Ho Chi Minh" in anchor or "Saigon" in anchor.lower()
    zones = [
        {
            "sequence": 1,
            "city": "胡志明市",
            "label": "第一郡滨城枢纽",
            "check_in": "2026-10-02",
            "check_out": "2026-10-06",
            "rationale": "城市观光",
            "status": "proposed",
            "fit_tag": "needs_city_change",
            "tag_note": "与目的地越南不同城",
        },
        {
            "sequence": 2,
            "city": "头顿",
            "label": "后滩海滩区",
            "check_in": "2026-10-02",
            "check_out": "2026-10-06",
            "rationale": "海边",
            "status": "proposed",
            "fit_tag": "needs_city_change",
        },
    ]
    seg = StaySegment(
        city="胡志明市",
        check_in="2026-10-02",
        check_out="2026-10-06",
        day_indices=[0, 1, 2],
    )
    out = apply_tags_to_zones(zones, trip_request=tr, segments=[seg], flights=flights)
    hcmc = next(z for z in out if "胡志明" in str(z.get("city")))
    vung = next(z for z in out if "头顿" in str(z.get("city")))
    assert hcmc["bookable"] is True
    assert hcmc["fit_tag"] in ("current_anchor", "compromise", "preference_fit")
    assert vung["bookable"] is False
    assert vung["fit_tag"] == "needs_city_change"
    print(
        "country_dest_flight_anchor OK",
        anchor,
        [(z["city"], z["fit_tag"], z["bookable"]) for z in out],
    )


if __name__ == "__main__":
    test_cities_same()
    test_seaside_themes()
    test_assign_and_alts()
    test_same_city_override()
    test_country_dest_uses_flight_anchor()
    print("all zone_tags tests passed")
