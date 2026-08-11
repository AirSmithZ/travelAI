"""HOT-THEME-TAG: extract prompt themes from Chinese trip_request (runtime only).

Does NOT write back preference_tags (doc 33 Q3).
Allows custom:<用户原词> (Q1). Chinese lexicon first (Q4).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

Polarity = Literal["positive", "negative"]

# id → display label
THEME_LABELS: dict[str, str] = {
    "seaside": "海边",
    "culture": "人文",
    "food": "美食",
    "shopping": "购物",
    "nature": "自然",
    "photo": "摄影",
    "nightlife": "夜生活",
    "religion": "宗教",
    "art": "艺术",
    "theme_park": "乐园",
    "family": "亲子",
    "elder": "适老",
    "couple": "情侣",
    "solo": "独行",
    "slow": "慢游",
    "packed": "紧凑",
    "budget": "经济",
    "luxury": "奢华",
    "quiet": "安静",
    "workation": "旅居办公",
    "transit": "交通便利",
    "walkable": "步行友好",
}

# Longer phrases first within each pattern group
_THEME_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("seaside", re.compile(r"海边|海滩|沙滩|海岛|海滨|亲海|看海|靠海")),
    ("culture", re.compile(r"人文|文化|博物馆|历史|古迹|遗产|文物|历史街区")),
    ("food", re.compile(r"美食|小吃|夜市|米其林|餐厅|觅食|吃货|餐饮")),
    ("shopping", re.compile(r"购物|逛街|奥特莱斯|免税店|买买买|商圈")),
    ("nature", re.compile(r"自然|徒步|登山|徒步|公园|森林|户外|爬山|绿道")),
    ("photo", re.compile(r"摄影|拍照|打卡|网红|日出|夕阳|天际线")),
    ("nightlife", re.compile(r"夜生活|酒吧|夜店|夜游|夜景酒吧")),
    ("religion", re.compile(r"寺庙|清真寺|教堂|朝圣|佛寺")),
    ("art", re.compile(r"艺术|画廊|美术馆|文创|设计区")),
    ("theme_park", re.compile(r"乐园|迪士尼|环球|主题公园|游乐场")),
    ("family", re.compile(r"亲子|带娃|带小孩|儿童|宝宝|小朋友")),
    ("elder", re.compile(r"老人|父母|长辈|行动不便|适老")),
    ("couple", re.compile(r"蜜月|情侣|纪念日|浪漫")),
    ("solo", re.compile(r"独行|一个人|单人旅行|背包客")),
    ("slow", re.compile(r"慢游|发呆|不赶|悠闲|躺平旅行")),
    ("packed", re.compile(r"特种兵|排满|高效|紧凑行程|一天打卡")),
    ("budget", re.compile(r"穷游|青旅|便宜|省钱|经济型")),
    ("luxury", re.compile(r"奢华|五星|豪华|度假村|高端")),
    ("quiet", re.compile(r"安静|睡得好|远离喧嚣|清静")),
    ("workation", re.compile(r"办公|wifi|长住|旅居|远程办公")),
    ("transit", re.compile(r"地铁旁|少换乘|交通方便|近地铁|公交便利")),
    ("walkable", re.compile(r"步行友好|少坐车|走得到|宜步行")),
]

_NEG_WINDOW = re.compile(
    r"(?:不要|别|别去|不想|无需|不需要|拒绝|避开)([^，。；;\n]{0,12})"
)

# Zone text cues for aligning a theme to a zone (CN)
_ZONE_ALIGN_CUES: dict[str, re.Pattern[str]] = {
    "seaside": re.compile(r"海边|海滩|沙滩|海岛|海滨|湾|beach|美溪|芽庄|岘港|富国|头顿|美奈"),
    "culture": re.compile(r"人文|文化|博物|历史|古城|古镇|文庙|遗迹"),
    "food": re.compile(r"美食|小吃|夜市|餐饮|食街|米其林"),
    "shopping": re.compile(r"购物|商圈|奥特莱斯|免税|商场|购物中心"),
    "nature": re.compile(r"自然|徒步|登山|公园|森林|绿|户外|山"),
    "photo": re.compile(r"摄影|打卡|观景|天际|网红|日出"),
    "nightlife": re.compile(r"夜生活|酒吧|夜店|夜游"),
    "religion": re.compile(r"寺|清真寺|教堂|庙"),
    "art": re.compile(r"艺术|画廊|美术|文创"),
    "theme_park": re.compile(r"乐园|迪士尼|环球"),
    "family": re.compile(r"亲子|家庭|儿童"),
    "elder": re.compile(r"适老|平坦|少爬"),
    "couple": re.compile(r"浪漫|情侣|蜜月"),
    "solo": re.compile(r"背包|青旅|独行"),
    "slow": re.compile(r"慢|悠闲|度假"),
    "packed": re.compile(r"枢纽|中心|高效|核心"),
    "budget": re.compile(r"经济|青年|便宜|外围"),
    "luxury": re.compile(r"奢|五星|豪华|品牌"),
    "quiet": re.compile(r"安静|住宅|清静"),
    "workation": re.compile(r"公寓|商务|办公"),
    "transit": re.compile(r"地铁|MRT|BTS|枢纽|换乘|公交"),
    "walkable": re.compile(r"步行|walk"),
}


@dataclass
class ThemeHit:
    id: str
    label: str
    polarity: Polarity = "positive"
    confidence: float = 0.85
    evidence: str = ""
    entity: str | None = None

    def as_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "polarity": self.polarity,
            "confidence": self.confidence,
            "evidence": self.evidence,
        }
        if self.entity:
            d["entity"] = self.entity
        return d


@dataclass
class ThemeExtractResult:
    themes: list[ThemeHit] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"themes": [t.as_dict() for t in self.themes]}

    def positive(self) -> list[ThemeHit]:
        return [t for t in self.themes if t.polarity == "positive"]


def preference_blob(trip_request: dict[str, Any] | None) -> str:
    if not trip_request:
        return ""
    parts = [
        str(trip_request.get("free_text") or ""),
        str(trip_request.get("notes") or ""),
        " ".join(str(t) for t in (trip_request.get("preference_tags") or [])),
    ]
    return " ".join(parts).strip()


def _custom_id(raw: str) -> str:
    s = re.sub(r"\s+", "", (raw or "").strip())
    s = s[:24]
    return f"custom:{s}"


def _add_unique(out: list[ThemeHit], hit: ThemeHit) -> None:
    for existing in out:
        if existing.id == hit.id and existing.polarity == hit.polarity:
            if hit.confidence > existing.confidence:
                existing.confidence = hit.confidence
                existing.evidence = hit.evidence or existing.evidence
            return
    out.append(hit)


def extract_themes(trip_request: dict[str, Any] | None) -> ThemeExtractResult:
    """Rule-based Chinese theme extract. Runtime only — do not persist to preference_tags."""
    tr = trip_request or {}
    blob = preference_blob(tr)
    tags = [str(t).strip() for t in (tr.get("preference_tags") or []) if str(t).strip()]
    out: list[ThemeHit] = []

    # 1) preference_tags: map or custom
    label_to_id = {v: k for k, v in THEME_LABELS.items()}
    for tag in tags:
        if tag in label_to_id:
            tid = label_to_id[tag]
            _add_unique(
                out,
                ThemeHit(
                    id=tid,
                    label=THEME_LABELS[tid],
                    evidence=tag,
                    confidence=0.95,
                ),
            )
            continue
        # direct id
        if tag in THEME_LABELS:
            _add_unique(
                out,
                ThemeHit(id=tag, label=THEME_LABELS[tag], evidence=tag, confidence=0.95),
            )
            continue
        # synonym quick map
        mapped = None
        for tid, pat in _THEME_PATTERNS:
            if pat.search(tag):
                mapped = tid
                break
        if mapped:
            _add_unique(
                out,
                ThemeHit(
                    id=mapped,
                    label=THEME_LABELS[mapped],
                    evidence=tag,
                    confidence=0.9,
                ),
            )
        else:
            # Q1 custom
            cid = _custom_id(tag)
            _add_unique(
                out,
                ThemeHit(id=cid, label=tag, evidence=tag, confidence=0.8),
            )

    # 2) free_text / notes patterns
    if blob:
        # negatives first — mark spans
        neg_spans: list[tuple[int, int]] = []
        for m in _NEG_WINDOW.finditer(blob):
            neg_spans.append((m.start(), m.end()))
            chunk = m.group(0)
            for tid, pat in _THEME_PATTERNS:
                if pat.search(m.group(1) or "") or pat.search(chunk):
                    _add_unique(
                        out,
                        ThemeHit(
                            id=tid,
                            label=THEME_LABELS[tid],
                            polarity="negative",
                            evidence=chunk[:40],
                            confidence=0.75,
                        ),
                    )

        def in_neg(pos: int) -> bool:
            return any(a <= pos < b for a, b in neg_spans)

        for tid, pat in _THEME_PATTERNS:
            for m in pat.finditer(blob):
                if in_neg(m.start()):
                    continue
                _add_unique(
                    out,
                    ThemeHit(
                        id=tid,
                        label=THEME_LABELS[tid],
                        evidence=m.group(0),
                        confidence=0.85,
                    ),
                )

    return ThemeExtractResult(themes=out)


def zone_text(zone: dict[str, Any]) -> str:
    return " ".join(
        str(zone.get(k) or "")
        for k in ("label", "city", "rationale", "transit_note", "tag_note")
    )


def align_zone_themes(
    zone: dict[str, Any],
    themes: list[ThemeHit],
) -> list[dict[str, str]]:
    """Return matched theme {id,label} for this zone (positive themes only)."""
    text = zone_text(zone)
    # LLM may already provide matched_themes
    raw_matched = zone.get("matched_themes") or zone.get("theme_tags") or []
    allowed = {t.id: t for t in themes if t.polarity == "positive"}
    matched: list[dict[str, str]] = []
    seen: set[str] = set()

    if isinstance(raw_matched, list):
        for item in raw_matched:
            if isinstance(item, str):
                tid = item.strip()
                label = THEME_LABELS.get(tid, tid.removeprefix("custom:"))
            elif isinstance(item, dict):
                tid = str(item.get("id") or "").strip()
                label = str(item.get("label") or THEME_LABELS.get(tid) or tid).strip()
            else:
                continue
            if not tid or tid not in allowed:
                # allow custom if in allowed
                if tid.startswith("custom:") and tid in allowed:
                    pass
                elif tid not in allowed:
                    continue
            if tid in seen:
                continue
            seen.add(tid)
            matched.append({"id": tid, "label": label or allowed[tid].label})

    # Rule align for missing
    for t in themes:
        if t.polarity != "positive" or t.id in seen:
            continue
        cue = _ZONE_ALIGN_CUES.get(t.id)
        if t.id.startswith("custom:"):
            # custom: match if label/原词 appears in zone text
            token = t.label or t.id.split(":", 1)[-1]
            if token and token in text:
                seen.add(t.id)
                matched.append({"id": t.id, "label": t.label})
            continue
        if cue and cue.search(text):
            seen.add(t.id)
            matched.append({"id": t.id, "label": t.label})

    return matched[:6]


def uncovered_themes_for_zone(
    matched: list[dict[str, str]],
    themes: list[ThemeHit],
) -> list[dict[str, str]]:
    """Themes user asked for but this zone does not cover (Q2)."""
    got = {m["id"] for m in matched}
    out: list[dict[str, str]] = []
    for t in themes:
        if t.polarity != "positive":
            continue
        if t.id in got:
            continue
        out.append({"id": t.id, "label": t.label})
    return out[:8]


def themes_summary_labels(themes: list[ThemeHit]) -> list[str]:
    return [t.label for t in themes if t.polarity == "positive"][:12]
