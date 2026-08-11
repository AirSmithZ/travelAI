#!/usr/bin/env python3
"""doc 34 L3/L11 — must/nice + evidence_refs (no live API)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.evidence_borrow import (  # noqa: E402
    attach_evidence_refs,
    audit_must_pois,
    enrich_itinerary_evidence_borrow,
    normalize_adopt_levels,
)
from app.services.itinerary_llm import _normalize_user_evidence_items  # noqa: E402


def test_normalize_levels():
    levels = normalize_adopt_levels(
        ["滨海湾花园", "鱼尾狮"],
        {"滨海湾花园": "must", "其他": "nice"},
    )
    assert levels["滨海湾花园"] == "must"
    assert levels["鱼尾狮"] == "nice"
    print("normalize_levels OK")


def test_attach_refs_only_adopted():
    evidence = [
        {
            "title": "攻略A",
            "url": "https://example.com/a",
            "note_id": "n1",
            "adopted_pois": ["滨海湾花园"],
            "role": "user_selected",
        },
        {
            "title": "自动帖",
            "url": "https://example.com/auto",
            "snippet": "提到鱼尾狮",
            "role": "auto",
            # no adopted_pois → must not link
        },
    ]
    itin = {
        "days": [
            {
                "nodes": [
                    {"name": "滨海湾花园", "category": "attraction"},
                    {"name": "鱼尾狮公园", "category": "landmark"},
                    {"name": "某酒店", "category": "hotel"},
                ]
            }
        ],
        "meta": {},
    }
    out = attach_evidence_refs(itin, evidence)
    nodes = out["days"][0]["nodes"]
    assert nodes[0].get("evidence_refs")
    assert nodes[0]["evidence_refs"][0]["url"] == "https://example.com/a"
    assert nodes[0]["evidence_refs"][0]["role"] == "adopted"
    assert not nodes[1].get("evidence_refs")  # auto-only mention, not adopted
    assert not nodes[2].get("evidence_refs")
    print("attach_refs OK")


def test_must_audit_and_flags():
    evidence = [
        {
            "title": "攻略",
            "url": "https://example.com/b",
            "adopted_pois": ["滨海湾花园", "虚构必去999"],
            "adopt_levels": {"滨海湾花园": "must", "虚构必去999": "must"},
        }
    ]
    itin = {
        "days": [
            {
                "nodes": [
                    {
                        "name": "滨海湾花园",
                        "category": "attraction",
                        "is_optional": True,
                        "out_of_pool": True,
                    }
                ]
            }
        ],
        "meta": {"warnings": []},
    }
    out = enrich_itinerary_evidence_borrow(itin, evidence)
    node = out["days"][0]["nodes"][0]
    assert node["is_optional"] is False
    assert node.get("evidence_refs")
    warns = out["meta"]["warnings"]
    assert any("必去地点未排入" in w and "虚构必去999" in w for w in warns)
    assert audit_must_pois(itin, evidence)  # still missing fictional
    print("must_audit OK")


def test_normalize_user_evidence_levels():
    rows = _normalize_user_evidence_items(
        [
            {
                "title": "笔记",
                "url": "https://x.com/1",
                "snippet": "长文" * 40,
                "adopted_pois": ["A馆", "B园"],
                "adopt_levels": {"A馆": "must"},
                "adopt_rhythm": False,
            }
        ]
    )
    assert rows[0]["adopt_levels"]["A馆"] == "must"
    assert rows[0]["adopt_levels"]["B园"] == "nice"
    assert "必去" in rows[0]["snippet"]
    assert "想去" in rows[0]["snippet"]
    print("normalize_user_evidence OK")


if __name__ == "__main__":
    test_normalize_levels()
    test_attach_refs_only_adopted()
    test_must_audit_and_flags()
    test_normalize_user_evidence_levels()
    print("all evidence_borrow tests OK")
