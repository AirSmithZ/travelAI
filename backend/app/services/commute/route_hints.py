"""Extract non-routable / user-stated commute legs from free_text + notes."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

TransportMode = Literal["walk", "subway", "bus", "taxi", "flight", "ferry"]

_MODE_PATTERNS: list[tuple[re.Pattern[str], TransportMode | str, str]] = [
    (re.compile(r"(轮渡|渡轮|快艇|游船|海路|坐船|乘船|ferry|boat)", re.I), "ferry", "海路/轮渡"),
    (re.compile(r"(缆车|索道|观光缆车|cable\s*car|gondola)", re.I), "walk", "缆车/索道"),
    (re.compile(r"(山路|徒步|登山|步道|登山道|徒步道|hiking|trek|trail)", re.I), "walk", "山路/徒步"),
    (re.compile(r"(地铁|MRT|subway|metro)", re.I), "subway", "地铁"),
    (re.compile(r"(公交|巴士|巴士|bus)", re.I), "bus", "公交"),
    (re.compile(r"(打车|出租车|的士|taxi|Grab|Uber)", re.I), "taxi", "打车"),
    (re.compile(r"(步行|走路|walk)", re.I), "walk", "步行"),
]

_DURATION_RE = re.compile(
    r"(?:约|大概|大约)?\s*(\d{1,3})\s*(?:分钟|min|mins|minutes)",
    re.I,
)

# A … B … 交通 … N分钟  (loose)
_PAIR_RE = re.compile(
    r"(?P<a>[\u4e00-\u9fffA-Za-z0-9·\-]{2,24})"
    r"(?:到|至|→|->|—|-|前往|去)"
    r"(?P<b>[\u4e00-\u9fffA-Za-z0-9·\-]{2,24})"
    r"[^。；;\n]{0,40}?"
    r"(?P<body>(?:轮渡|渡轮|快艇|游船|海路|坐船|乘船|ferry|缆车|索道|"
    r"山路|徒步|登山|步道|地铁|MRT|公交|巴士|打车|出租车|步行|走路|"
    r"subway|metro|bus|taxi|walk|boat|hiking|trail)[^。；;\n]{0,30})",
    re.I,
)


@dataclass(frozen=True)
class RouteHint:
    transport_mode: TransportMode
    duration_minutes: int | None
    label: str
    summary: str
    non_routable: bool
    from_name: str = ""
    to_name: str = ""
    score: float = 0.0


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", (s or "").strip().lower())


def _name_overlap(a: str, b: str) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    if na in nb or nb in na:
        return 1.0
    # shared substring ≥ 2 chars
    best = 0
    for i in range(len(na)):
        for j in range(i + 2, len(na) + 1):
            if na[i:j] in nb:
                best = max(best, j - i)
    return min(1.0, best / max(len(na), 2))


def _mode_from_body(body: str) -> tuple[TransportMode, str, bool]:
    for pat, mode, label in _MODE_PATTERNS:
        if pat.search(body):
            non = mode == "ferry" or label.startswith(("海路", "山路", "缆车"))
            if mode == "walk" and label.startswith("缆车"):
                return "walk", label, True
            if mode == "walk" and label.startswith("山路"):
                return "walk", label, True
            return mode if mode != "cable" else "walk", label, non  # type: ignore[return-value]
    return "walk", "提示路线", False


def extract_route_hints(
    text: str,
    *,
    from_name: str = "",
    to_name: str = "",
) -> list[RouteHint]:
    """Parse user prompt for explicit A→B commute statements and non-routable modes."""
    raw = (text or "").strip()
    if not raw:
        return []

    hints: list[RouteHint] = []
    seen: set[tuple[str, str, str]] = set()

    for m in _PAIR_RE.finditer(raw):
        a, b, body = m.group("a"), m.group("b"), m.group("body")
        mode, mode_label, non_routable = _mode_from_body(body)
        dur_m = _DURATION_RE.search(body) or _DURATION_RE.search(
            raw[m.end() : m.end() + 24]
        )
        duration = int(dur_m.group(1)) if dur_m else None
        score = 0.35
        if from_name and to_name:
            score = (
                _name_overlap(a, from_name) * 0.5
                + _name_overlap(b, to_name) * 0.5
            )
            # allow reversed mention
            score = max(
                score,
                _name_overlap(a, to_name) * 0.45
                + _name_overlap(b, from_name) * 0.45,
            )
        key = (mode, a, b)
        if key in seen:
            continue
        seen.add(key)
        label = f"{mode_label}" + (f" 约{duration}分钟" if duration else "")
        hints.append(
            RouteHint(
                transport_mode=mode,  # type: ignore[arg-type]
                duration_minutes=duration,
                label=label,
                summary=f"来自提示词：{a}→{b}，{body.strip()[:80]}",
                non_routable=non_routable,
                from_name=a,
                to_name=b,
                score=score,
            )
        )

    # Global non-routable keywords without clear pair — only if names appear nearby
    if from_name and to_name and not hints:
        window = raw
        fn, tn = _norm(from_name), _norm(to_name)
        # prefer a window that mentions both ends
        for pat, mode, mode_label in _MODE_PATTERNS[:3]:
            for km in pat.finditer(window):
                start = max(0, km.start() - 40)
                end = min(len(window), km.end() + 40)
                ctx = window[start:end]
                ctx_n = _norm(ctx)
                if fn and tn and (fn[:2] in ctx_n or _norm(from_name)[:2] in ctx_n):
                    if tn[:2] in ctx_n or _norm(to_name)[:2] in ctx_n:
                        dur_m = _DURATION_RE.search(ctx)
                        duration = int(dur_m.group(1)) if dur_m else None
                        non = True
                        tm: TransportMode = "ferry" if mode == "ferry" else "walk"
                        hints.append(
                            RouteHint(
                                transport_mode=tm,
                                duration_minutes=duration,
                                label=mode_label
                                + (f" 约{duration}分钟" if duration else ""),
                                summary=f"来自提示词：{ctx.strip()[:100]}",
                                non_routable=non,
                                from_name=from_name,
                                to_name=to_name,
                                score=0.55,
                            )
                        )
                        break

    hints.sort(key=lambda h: (-h.score, h.non_routable is False))
    return hints


def relevant_hints(
    hints: list[RouteHint],
    *,
    min_score: float = 0.4,
) -> list[RouteHint]:
    """Keep hints that look related to the selected edge (or strong non-routable)."""
    out: list[RouteHint] = []
    for h in hints:
        if h.score >= min_score or (h.non_routable and h.score >= 0.3):
            out.append(h)
    return out
