"""WS-08a: rule-based POI extract + light geocode fence validation."""

from __future__ import annotations

import logging
import re
from collections import Counter
from typing import Any

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_BOOK_RE = re.compile(r"[《「『【\[]([^》」』】\]]{2,20})[》」』】\]]")
_SEG_SPLIT = re.compile(r"[·・•\|/／、，,；;与和及\s]+")

# Longest-first so 博物馆 beats 馆, 主题乐园 beats 乐园, etc.
_POI_SUFFIXES = (
    "主题乐园",
    "购物中心",
    "步行街",
    "美食街",
    "博物馆",
    "美术馆",
    "动物园",
    "水族馆",
    "观景台",
    "摩天轮",
    "神社",
    "夜市",
    "海滩",
    "沙滩",
    "瀑布",
    "机场",
    "公园",
    "乐园",
    "商场",
    "老街",
    "广场",
    "市场",
    "码头",
    "温泉",
    "教堂",
    "城堡",
    "宫殿",
    "大桥",
    "花园",
    "寺",
    "塔",
    "城",
    "宫",
    "殿",
    "园",
    "街",
    "巷",
    "山",
    "湖",
    "岛",
    "村",
    "站",
    "桥",
    "馆",
)

_SUFFIX_ALT = "|".join(re.escape(s) for s in _POI_SUFFIXES)
_POI_IN_SEG_RE = re.compile(rf"([\u4e00-\u9fffA-Za-z0-9]{{2,12}}(?:{_SUFFIX_ALT}))")

_STOP_SUBSTRINGS = (
    "攻略",
    "行程",
    "必去",
    "推荐",
    "避坑",
    "自由行",
    "一日游",
    "几天",
    "玩法",
    "打卡",
    "种草",
    "测评",
    "好物",
    "分享",
    "笔记",
    "小红书",
    "旅游",
    "旅行",
    "签证",
    "机票",
    "酒店",
    "住宿",
    "美食推荐",
    "灯光秀",
    "夜景",
)

_MAX_CANDIDATES = 24


def _ends_with_poi_suffix(name: str) -> bool:
    return any(name.endswith(s) for s in _POI_SUFFIXES)


def _normalize_name(raw: str, destination: str) -> str | None:
    name = (raw or "").strip()
    name = re.sub(r"\s+", "", name)
    # Strip leading time/verb/promo fluff so「傍晚去滨海湾花园」「推荐环球影城」可收成地名
    name = re.sub(
        r"^(?:傍晚|早上|上午|下午|晚上|中午|清晨)?"
        r"(?:推荐|必去|必打卡|打卡|去|到|逛|看|游)+",
        "",
        name,
    )
    if len(name) < 2 or len(name) > 20:
        return None
    dest = (destination or "").strip()
    if dest and name == dest:
        return None
    if dest and name.startswith(dest) and len(name) > len(dest):
        name = name[len(dest) :].lstrip("的·-— ")
    if len(name) < 2:
        return None
    for stop in _STOP_SUBSTRINGS:
        if stop in name:
            return None
    if not re.search(r"[\u4e00-\u9fffA-Za-z]", name):
        return None
    if not _ends_with_poi_suffix(name):
        return None
    return name


def _names_from_text(text: str, destination: str) -> set[str]:
    found: set[str] = set()
    for m in _BOOK_RE.finditer(text or ""):
        n = _normalize_name(m.group(1), destination)
        if n:
            found.add(n)
    for seg in _SEG_SPLIT.split(text or ""):
        seg = seg.strip()
        if not seg:
            continue
        whole = _normalize_name(seg, destination)
        if whole:
            found.add(whole)
            continue
        for m in _POI_IN_SEG_RE.finditer(seg):
            n = _normalize_name(m.group(1), destination)
            if n:
                found.add(n)
    return found


def extract_poi_candidates(
    evidence: list[dict[str, Any]],
    destination: str,
    *,
    max_candidates: int = _MAX_CANDIDATES,
) -> list[dict[str, Any]]:
    """Extract place-like strings from evidence titles/snippets; tally mentions."""
    counts: Counter[str] = Counter()
    for item in evidence:
        if not isinstance(item, dict):
            continue
        text = f"{item.get('title') or ''} {item.get('snippet') or ''}"
        for n in _names_from_text(text, destination):
            counts[n] += 1

    ranked = counts.most_common(max_candidates)
    return [
        {"name": name, "mentions": mentions, "verified": False}
        for name, mentions in ranked
    ]


def _mark_evidence_verified(
    evidence: list[dict[str, Any]],
    verified_names: list[str],
) -> list[dict[str, Any]]:
    if not verified_names:
        for item in evidence:
            if isinstance(item, dict):
                item.setdefault("verified", False)
        return evidence
    for item in evidence:
        if not isinstance(item, dict):
            continue
        blob = f"{item.get('title') or ''} {item.get('snippet') or ''}"
        hits = [n for n in verified_names if n and n in blob]
        item["verified"] = bool(hits)
        if hits:
            item["poi_hits"] = hits[:5]
        else:
            item.pop("poi_hits", None)
    return evidence


def enrich_evidence_pois(
    evidence: list[dict[str, Any]],
    destination: str,
    *,
    settings: Settings | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Extract POIs, optionally geocode top-N inside destination fence.
    Returns (evidence_with_verified_flags, poi_candidates).
    Soft-fails: never raises into generate.
    """
    if not evidence:
        return [], []

    cfg = settings or get_settings()
    dest = (destination or "").strip()
    candidates = extract_poi_candidates(evidence, dest)

    if not cfg.evidence_poi_validate or not dest or not candidates:
        evidence = _mark_evidence_verified(evidence, [])
        return evidence, candidates

    max_n = max(0, int(cfg.evidence_poi_validate_max))
    verified_names: list[str] = []
    try:
        from app.services.geocoding import geocode_place
    except Exception as e:  # pragma: no cover
        logger.warning("poi validate import failed: %s", e)
        return _mark_evidence_verified(evidence, []), candidates

    for cand in candidates[:max_n]:
        name = cand["name"]
        try:
            hit = geocode_place(name, dest)
        except Exception as e:
            logger.debug("poi geocode skip %s: %s", name, e)
            hit = None
        if not hit:
            continue
        lat = hit.get("lat")
        lng = hit.get("lng")
        if lat is None or lng is None:
            continue
        cand["verified"] = True
        cand["lat"] = lat
        cand["lng"] = lng
        label = hit.get("name") or hit.get("address")
        if label:
            cand["display_name"] = label
        verified_names.append(name)

    evidence = _mark_evidence_verified(evidence, verified_names)
    candidates.sort(key=lambda c: (not c.get("verified"), -int(c.get("mentions") or 0)))

    # WS-08b: optional SerpAPI types/rating (soft-fail)
    try:
        from app.services.ugc.places_enrich import enrich_poi_places

        candidates = enrich_poi_places(candidates, dest, settings=cfg)
    except Exception as e:
        logger.warning("places enrich failed: %s", e)
    return evidence, candidates
