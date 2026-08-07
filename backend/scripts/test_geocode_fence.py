#!/usr/bin/env python3
"""GEO-01/02 unit tests: destination fence + bare-name reject (mocked providers)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402
from app.data.city_aliases import country_code_for_destination, normalize_city  # noqa: E402
from app.services.geocode_providers import (  # noqa: E402
    GeocodeBias,
    GeocodeHit,
    filter_hits_by_fence,
    haversine_km,
    run_autocomplete,
)
from app.services.geocoding import (  # noqa: E402
    DestinationCenter,
    clear_geocode_caches,
    geocode_itinerary,
    geocode_place,
    resolve_destination_center,
)


def _hit(
    name: str,
    lat: float,
    lng: float,
    source: str = "photon",
    country_code: str | None = None,
) -> GeocodeHit:
    return GeocodeHit(
        name=name,
        address=name,
        lat=lat,
        lng=lng,
        place_id=f"test/{name}",
        coord_source=source,
        country_code=country_code,
    )


def test_haversine_singapore_changi():
    d = haversine_km(1.283, 103.860, 1.364, 103.991)
    assert 15 < d < 20
    print("haversine OK")


def test_filter_fence_keeps_near_rejects_far():
    sg = _hit("Marina Bay", 1.283, 103.860)
    cn = _hit("滨海湾金沙", 31.23, 121.47)  # Shanghai-ish
    kept, rejected = filter_hits_by_fence(
        [sg, cn],
        center_lat=1.352,
        center_lng=103.820,
        fence_km=150,
    )
    assert len(kept) == 1
    assert kept[0].name == "Marina Bay"
    assert rejected == 1
    print("filter_fence OK")


def test_run_autocomplete_rejects_far_top1():
    settings = Settings(
        GEOCODE_PROVIDERS="photon",
        GEOCODE_FENCE_KM=150,
        GEOCODE_TIMEOUT_SEC=6,
        NOMINATIM_TIMEOUT_SEC=6,
    )
    bias = GeocodeBias(lat=1.352, lng=103.820, country_code="sg", bbox=None)
    far = [_hit("中央公园", 40.78, -73.97)]  # NYC

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            return far

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        out = run_autocomplete(
            ["中央公园, Singapore", "中央公园"],
            limit=1,
            settings=settings,
            bias=bias,
            fence_km=150,
            bare_query="中央公园",
            allow_bare_without_fence=False,
        )
    assert out.results == []
    assert out.rejected_out_of_fence >= 1
    print("reject far Top1 OK")


def test_run_autocomplete_accepts_near_hit():
    settings = Settings(GEOCODE_PROVIDERS="photon")
    bias = GeocodeBias(lat=1.352, lng=103.820, country_code="sg")
    near = [_hit("Gardens by the Bay", 1.281, 103.863)]

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            return near

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        out = run_autocomplete(
            ["Gardens by the Bay, Singapore"],
            limit=1,
            settings=settings,
            bias=bias,
            fence_km=150,
            bare_query="Gardens by the Bay",
        )
    assert len(out.results) == 1
    assert out.results[0].lat == 1.281
    print("accept near hit OK")


def test_bare_name_skipped_without_fence_when_dest_known():
    """目的地仅有 country code、无中心时，不接受裸名 Top1。"""
    settings = Settings(GEOCODE_PROVIDERS="photon")
    bias = GeocodeBias(country_code="sg")
    far = [_hit("港", 22.3, 114.2)]

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            return far

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        out = run_autocomplete(
            ["港, Singapore", "港"],
            limit=1,
            settings=settings,
            bias=bias,
            fence_km=None,
            bare_query="港",
            allow_bare_without_fence=False,
        )
    # 限定查询仍可能命中；裸名被跳过。此处 Fake 对所有 query 返回同结果，
    # 限定查询无围栏时会接受 — 验证裸名单独被禁：
    out_bare = run_autocomplete(
        ["港"],
        limit=1,
        settings=settings,
        bias=bias,
        fence_km=None,
        bare_query="港",
        allow_bare_without_fence=False,
    )
    assert out_bare.results == []
    print("bare skip without fence OK", "qualified_ok" if out.results else "qualified_empty")


def test_resolve_destination_center_cached():
    clear_geocode_caches()
    settings = Settings(GEOCODE_PROVIDERS="photon")
    calls = {"n": 0}

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            calls["n"] += 1
            return [_hit("Singapore", 1.352, 103.820)]

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        a = resolve_destination_center("新加坡", settings=settings)
        b = resolve_destination_center("新加坡", settings=settings)
    assert a is not None and b is not None
    assert a.lat == b.lat == 1.352
    assert calls["n"] == 1
    assert country_code_for_destination("新加坡") == "sg"
    assert "Singapore" in normalize_city("新加坡")
    print("destination center cache OK")


def test_geocode_itinerary_meta_warnings():
    clear_geocode_caches()
    settings = Settings(
        GEOCODE_PROVIDERS="photon",
        GEOCODE_FENCE_KM=150,
    )

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            q = query.lower()
            if "singapore" in q and "," not in query and "bay" not in q:
                return [_hit("Singapore", 1.352, 103.820)]
            if "gardens" in q.lower() or "滨海湾" in query:
                # 错误：中国点
                return [_hit("滨海湾", 31.23, 121.47)]
            if "unknown_poi_xyz" in q:
                return []
            return [_hit("somewhere", 31.23, 121.47)]

    itinerary = {
        "meta": {"warnings": ["LLM 生成行程"]},
        "days": [
            {
                "nodes": [
                    {"name": "滨海湾金沙", "lat": 0, "lng": 0, "coord_confidence": "none"},
                    {"name": "unknown_poi_xyz", "lat": 0, "lng": 0, "coord_confidence": "none"},
                ]
            }
        ],
    }

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        # resolve center + place geocode 都走同一 fake provider
        with patch("app.services.geocoding.get_settings", return_value=settings):
            with patch(
                "app.services.geocoding.resolve_destination_center",
                return_value=DestinationCenter(
                    lat=1.352, lng=103.820, country_code="sg", query="Singapore"
                ),
            ):
                out = geocode_itinerary(itinerary, "新加坡", max_workers=1)

    warnings = out["meta"]["warnings"]
    assert "LLM 生成行程" in warnings
    assert any("失败" in w or "过远" in w or "点选" in w for w in warnings)
    # 过远命中应被丢弃 → 节点无有效坐标
    node0 = out["days"][0]["nodes"][0]
    assert not (node0.get("lat") and node0.get("lng")) or node0.get("coord_confidence") == "low"
    print("itinerary warnings OK:", warnings)


def test_geocode_place_accepts_in_fence():
    clear_geocode_caches()
    settings = Settings(GEOCODE_PROVIDERS="photon", GEOCODE_FENCE_KM=150)

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            return [_hit("Gardens by the Bay", 1.281, 103.863)]

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        with patch("app.services.geocoding.get_settings", return_value=settings):
            with patch(
                "app.services.geocoding.resolve_destination_center",
                return_value=DestinationCenter(
                    lat=1.352, lng=103.820, country_code="sg", query="Singapore"
                ),
            ):
                hit = geocode_place("Gardens by the Bay", "新加坡")
    assert hit is not None
    assert abs(hit["lat"] - 1.281) < 1e-6
    assert hit["coord_confidence"] == "medium"
    print("geocode_place in-fence OK")


def test_country_only_filters_wrong_country():
    """中心解析失败、仅有 countrycodes 时过滤异国命中。"""
    settings = Settings(GEOCODE_PROVIDERS="photon")
    bias = GeocodeBias(country_code="sg")
    mixed = [
        _hit("Central Park NYC", 40.78, -73.97, country_code="us"),
        _hit("Jurong Central Park", 1.338, 103.708, country_code="sg"),
    ]

    class FakePhoton:
        name = "photon"

        def autocomplete(self, query, *, limit, bias=None):
            return mixed

    with patch(
        "app.services.geocode_providers._build_providers",
        return_value=[FakePhoton()],
    ):
        out = run_autocomplete(
            ["Central Park, Singapore"],
            limit=2,
            settings=settings,
            bias=bias,
            fence_km=None,
            bare_query="Central Park",
            allow_bare_without_fence=False,
        )
    assert len(out.results) == 1
    assert out.results[0].country_code == "sg"
    print("country-only filter OK")


def test_name_relevance_picks_better_match():
    from app.services.geocoding import _name_relevance

    assert _name_relevance("滨海湾金沙", "滨海湾金沙", "") > _name_relevance(
        "滨海湾金沙", "滨海湾购物中心", ""
    )
    print("name relevance OK")


def test_candidate_score_prefers_nearer_same_name():
    """GEO-08：同名分时更近中心者胜出。"""
    from app.services.geocode_providers import GeocodeHit
    from app.services.geocoding import _candidate_score, _pick_best_hit

    near = GeocodeHit(
        name="中央车站",
        address="near",
        lat=1.30,
        lng=103.85,
        place_id="near",
        coord_source="test",
    )
    far = GeocodeHit(
        name="中央车站",
        address="far",
        lat=2.20,
        lng=103.85,
        place_id="far",
        coord_source="test",
    )
    center_lat, center_lng = 1.28, 103.85
    assert _candidate_score(
        "中央车站", near, center_lat=center_lat, center_lng=center_lng
    ) > _candidate_score(
        "中央车站", far, center_lat=center_lat, center_lng=center_lng
    )
    best, ambiguous = _pick_best_hit(
        "中央车站", [far, near], center_lat=center_lat, center_lng=center_lng
    )
    assert best.place_id == "near"
    assert ambiguous is True  # 同名近分 → low 促复核
    print("candidate score + distance OK")


def main() -> None:
    test_haversine_singapore_changi()
    test_filter_fence_keeps_near_rejects_far()
    test_run_autocomplete_rejects_far_top1()
    test_run_autocomplete_accepts_near_hit()
    test_bare_name_skipped_without_fence_when_dest_known()
    test_resolve_destination_center_cached()
    test_geocode_itinerary_meta_warnings()
    test_geocode_place_accepts_in_fence()
    test_country_only_filters_wrong_country()
    test_name_relevance_picks_better_match()
    test_candidate_score_prefers_nearer_same_name()
    print("all geocode fence tests passed")


if __name__ == "__main__":
    main()
