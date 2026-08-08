"""Unit checks: POI extract + EvidencePack TTL cache (no network)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.ugc.evidence_pack import (  # noqa: E402
    clear_evidence_cache,
    fetch_evidence_pack_sync,
)
from app.services.ugc.poi_extract import (  # noqa: E402
    enrich_evidence_pois,
    extract_poi_candidates,
)
from app.services.ugc.tikhub import EvidenceItem  # noqa: E402


def test_extract_poi_from_titles():
    evidence = [
        {
            "title": "新加坡必去·滨海湾花园与鱼尾狮公园",
            "snippet": "傍晚去滨海湾花园看灯光秀",
            "url": "https://example.com/1",
        },
        {
            "title": "圣淘沙攻略",
            "snippet": "推荐环球影城和圣淘沙海滩",
            "url": "https://example.com/2",
        },
    ]
    pois = extract_poi_candidates(evidence, "新加坡")
    names = {p["name"] for p in pois}
    assert "滨海湾花园" in names or "鱼尾狮公园" in names
    assert "圣淘沙海滩" in names or "环球影城" in names
    print("ok extract", [p["name"] for p in pois[:6]])


def test_enrich_marks_verified_with_mock_geocode():
    evidence = [
        {
            "title": "滨海湾花园夜景",
            "snippet": "很值得",
            "url": "https://example.com/a",
            "source": "tikhub_xhs",
        },
        {
            "title": "随便聊聊天气",
            "snippet": "很热",
            "url": "https://example.com/b",
            "source": "tikhub_xhs",
        },
    ]
    cfg = MagicMock()
    cfg.evidence_poi_validate = True
    cfg.evidence_poi_validate_max = 5

    def fake_geocode(name: str, destination: str = "", **_kw):
        if "滨海湾" in name:
            return {"lat": 1.28, "lng": 103.86, "name": name, "coord_confidence": "medium"}
        return None

    with patch("app.services.geocoding.geocode_place", side_effect=fake_geocode):
        out, pois = enrich_evidence_pois(evidence, "新加坡", settings=cfg)

    assert any(p.get("verified") for p in pois)
    assert out[0].get("verified") is True
    assert out[1].get("verified") is False
    print("ok enrich verified")


def test_evidence_cache_hit():
    clear_evidence_cache()
    cfg = MagicMock()
    cfg.tikhub_configured = True
    cfg.tavily_configured = False
    cfg.evidence_cache_ttl_sec = 3600

    item = EvidenceItem(
        title="鱼尾狮公园",
        url="https://www.xiaohongshu.com/explore/1",
        snippet="打卡",
        likes=10,
        source="tikhub_xhs",
        query="新加坡",
        note_id="1",
    )

    with patch(
        "app.services.ugc.evidence_pack.build_evidence_pack",
        return_value=[item],
    ) as mock_build:
        with patch(
            "app.services.ugc.evidence_pack.filter_evidence_items",
            side_effect=lambda items, **_k: list(items),
        ):
            a = fetch_evidence_pack_sync("新加坡", 4, settings=cfg)
            b = fetch_evidence_pack_sync("新加坡", 4, settings=cfg)
            assert len(a) == 1 and len(b) == 1
            assert mock_build.call_count == 1
    clear_evidence_cache()
    print("ok cache hit calls=1")


if __name__ == "__main__":
    test_extract_poi_from_titles()
    test_enrich_marks_verified_with_mock_geocode()
    test_evidence_cache_hit()
    print("all passed")
