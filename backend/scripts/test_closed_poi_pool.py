#!/usr/bin/env python3
"""ACT-POOL / doc 34 — closed pool merge + out-of-pool enforce (no live API)."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.closed_poi_pool import (  # noqa: E402
    build_closed_poi_pool,
    enforce_closed_poi_pool,
    match_pool_entry,
    merge_poi_candidates,
    normalize_poi_name,
    verified_pool_names,
)
from app.services.itinerary_credibility import format_closed_poi_pool_block  # noqa: E402


def _settings(**kwargs):
    base = dict(
        closed_poi_enforce=True,
        closed_poi_maps_enable=False,  # no live Serp in unit test
        closed_poi_maps_min_seed=4,
        closed_poi_maps_limit=16,
        closed_poi_pool_max=24,
        closed_poi_max_km=35.0,
        closed_poi_match_threshold=0.72,
        closed_poi_adopt_geocode_max=0,  # skip geocode
        serpapi_configured=False,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_merge_dedupe():
    a = [
        {"name": "滨海湾花园", "verified": True, "mentions": 1},
        {"name": "鱼尾狮", "verified": False},
    ]
    b = [
        {"name": "滨海 湾花园", "verified": True, "lat": 1.28, "lng": 103.86, "source": "maps_pool"},
        {"name": "圣淘沙", "verified": True},
    ]
    merged = merge_poi_candidates(a, b, max_items=10)
    names = verified_pool_names(merged)
    assert "滨海湾花园" in names or any("滨海湾" in n for n in names)
    assert any(normalize_poi_name(n) == normalize_poi_name("圣淘沙") for n in names)
    # lat upgraded onto first
    hit = next(p for p in merged if normalize_poi_name(p["name"]) == normalize_poi_name("滨海湾花园"))
    assert hit.get("lat") == 1.28
    print("merge_dedupe OK")


def test_match_fuzzy():
    pool = {
        normalize_poi_name("Gardens by the Bay"): {
            "name": "Gardens by the Bay",
            "verified": True,
            "lat": 1.28,
            "lng": 103.86,
        }
    }
    assert match_pool_entry("Gardens by the Bay", pool) is not None
    assert match_pool_entry("gardens by the bay", pool) is not None
    assert match_pool_entry("完全无关景点XYZ", pool, threshold=0.72) is None
    print("match_fuzzy OK")


def test_enforce_rewrite_and_demote():
    itin = {
        "days": [
            {
                "day_index": 1,
                "nodes": [
                    {"name": "Gardens by the Bay!", "category": "attraction", "is_optional": False},
                    {"name": "虚构水晶宫999", "category": "attraction", "is_optional": False},
                    {"name": "酒店附近咖啡", "category": "restaurant", "is_optional": False},
                ],
            }
        ],
        "meta": {"warnings": []},
    }
    pool = [
        {
            "name": "Gardens by the Bay",
            "verified": True,
            "lat": 1.281,
            "lng": 103.863,
        }
    ]
    out = enforce_closed_poi_pool(itin, pool, settings=_settings())
    nodes = out["days"][0]["nodes"]
    assert nodes[0]["name"] == "Gardens by the Bay"
    assert nodes[0].get("lat") == 1.281
    assert nodes[1].get("is_optional") is True
    assert nodes[1].get("out_of_pool") is True
    assert nodes[2].get("is_optional") is False  # restaurant untouched
    warns = out["meta"]["warnings"]
    assert any("出池" in w for w in warns)
    assert out["meta"].get("closed_poi_enforced") is True
    print("enforce_rewrite_and_demote OK")


def test_enforce_skips_empty_pool():
    itin = {
        "days": [{"nodes": [{"name": "随便", "category": "attraction", "is_optional": False}]}],
        "meta": {"warnings": []},
    }
    out = enforce_closed_poi_pool(itin, [], settings=_settings())
    assert out["days"][0]["nodes"][0].get("out_of_pool") is None
    print("enforce_skips_empty_pool OK")


def test_build_without_maps():
    cands = [{"name": "鱼尾狮公园", "verified": True, "mentions": 2}]
    evidence = [
        {
            "title": "笔记",
            "adopted_pois": ["鱼尾狮公园", "未核验店"],
            "adopt_rhythm": False,
        }
    ]
    intel = {"hotels": [{"name": "H", "lat": 1.29, "lng": 103.85, "city": "新加坡"}]}
    out = build_closed_poi_pool(
        cands,
        evidence=evidence,
        destination="新加坡",
        travel_intel=intel,
        settings=_settings(),
    )
    assert any(p.get("verified") for p in out)
    block = format_closed_poi_pool_block(out)
    assert "CLOSED_POI_POOL" in block
    assert "鱼尾狮公园" in block
    print("build_without_maps OK")


if __name__ == "__main__":
    test_merge_dedupe()
    test_match_fuzzy()
    test_enforce_rewrite_and_demote()
    test_enforce_skips_empty_pool()
    test_build_without_maps()
    print("all closed_poi_pool tests OK")
