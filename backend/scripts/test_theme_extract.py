#!/usr/bin/env python3
"""HOT-THEME-TAG: ThemeExtract + ZoneAlign (doc 33 Q1–Q4)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.stay_zone.theme_extract import (  # noqa: E402
    align_zone_themes,
    extract_themes,
    themes_summary_labels,
    uncovered_themes_for_zone,
)


def test_extract_seaside_culture():
    tr = {
        "free_text": "想去海边，也想看看人文博物馆",
        "preference_tags": [],
        "notes": "",
    }
    r = extract_themes(tr)
    ids = {t.id for t in r.positive()}
    assert "seaside" in ids
    assert "culture" in ids
    print("extract_seaside_culture OK", themes_summary_labels(r.themes))


def test_negation():
    tr = {"free_text": "不要夜生活，想安静一点", "preference_tags": [], "notes": ""}
    r = extract_themes(tr)
    neg = {t.id for t in r.themes if t.polarity == "negative"}
    pos = {t.id for t in r.positive()}
    assert "nightlife" in neg
    assert "quiet" in pos
    assert "nightlife" not in pos
    print("negation OK")


def test_custom_from_preference_tags():
    tr = {
        "free_text": "",
        "preference_tags": ["潜水证"],
        "notes": "",
    }
    r = extract_themes(tr)
    assert any(t.id.startswith("custom:") and t.label == "潜水证" for t in r.themes)
    print("custom_tag OK", [t.as_dict() for t in r.themes])


def test_align_and_uncovered():
    tr = {
        "free_text": "想住海边吃美食",
        "preference_tags": ["海边"],
        "notes": "",
    }
    themes = extract_themes(tr).themes
    zone = {
        "label": "第一郡市中心",
        "city": "胡志明市",
        "rationale": "地铁枢纽与美食夜市方便",
        "matched_themes": [],
    }
    matched = align_zone_themes(zone, themes)
    ids = {m["id"] for m in matched}
    assert "food" in ids
    assert "seaside" not in ids
    uncovered = uncovered_themes_for_zone(matched, themes)
    assert any(u["id"] == "seaside" for u in uncovered)
    print("align_uncovered OK", matched, uncovered)


def test_llm_matched_filtered():
    themes = extract_themes(
        {"free_text": "亲子海边", "preference_tags": [], "notes": ""}
    ).themes
    zone = {
        "label": "芽庄海边",
        "city": "芽庄",
        "rationale": "亲海度假",
        "matched_themes": [
            {"id": "seaside", "label": "海边"},
            {"id": "nightlife", "label": "夜生活"},  # 用户未提 → 丢弃
        ],
    }
    matched = align_zone_themes(zone, themes)
    ids = {m["id"] for m in matched}
    assert "seaside" in ids
    assert "nightlife" not in ids
    print("llm_matched_filtered OK", matched)


if __name__ == "__main__":
    test_extract_seaside_culture()
    test_negation()
    test_custom_from_preference_tags()
    test_align_and_uncovered()
    test_llm_matched_filtered()
    print("all theme_extract tests passed")
