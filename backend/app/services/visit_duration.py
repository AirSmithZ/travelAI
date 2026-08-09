"""Category visit-duration defaults (L1 / P95).

Structural priors only — not opening hours, not web search.
Used by schedule cascade and generate prompt (same table).
"""

from __future__ import annotations

from typing import Any

# category -> (min, typical, max) minutes
CATEGORY_VISIT_DURATION: dict[str, tuple[int, int, int]] = {
    "snack": (20, 30, 45),
    "restaurant": (45, 60, 90),
    "attraction": (45, 90, 180),
    "landmark": (30, 60, 120),
    "transit": (15, 20, 40),
    # Airport/hotel are usually pinned by flight/hotel enforce; bounds are fallbacks only
    "airport": (45, 75, 150),
    "hotel": (20, 30, 45),  # morning checkout / brief stop (evening overnight handled elsewhere)
}

_DEFAULT_BOUNDS = (45, 90, 180)


def category_duration_bounds(category: str | None) -> tuple[int, int, int]:
    cat = (category or "").strip().lower()
    return CATEGORY_VISIT_DURATION.get(cat, _DEFAULT_BOUNDS)


def typical_duration_minutes(category: str | None) -> int:
    return category_duration_bounds(category)[1]


def clamp_duration_minutes(category: str | None, minutes: int) -> int:
    lo, _typ, hi = category_duration_bounds(category)
    try:
        m = int(minutes)
    except (TypeError, ValueError):
        return typical_duration_minutes(category)
    return max(lo, min(hi, m))


def format_visit_duration_prompt_block() -> str:
    """Compact table for LLM system/user HARD-adjacent guidance."""
    lines = [
        "停留时长量级（分钟，按 category；服务端会按同表夹逼离谱区间，非营业时间真相源）：",
    ]
    order = (
        "snack",
        "restaurant",
        "attraction",
        "landmark",
        "transit",
        "airport",
        "hotel",
    )
    for cat in order:
        lo, typ, hi = CATEGORY_VISIT_DURATION[cat]
        lines.append(f"- {cat}: 典型 {typ}（合理 {lo}–{hi}）")
    lines.append(
        "请为节点填写合理的 start_time/end_time（或 duration_minutes）；"
        "机场须对齐确认航班；酒店日闭环由后端校准。"
    )
    return "\n".join(lines)


def _parse_hhmm(value: Any) -> int | None:
    s = str(value or "").strip()
    if not s or ":" not in s:
        return None
    parts = s.split(":")
    try:
        h, m = int(parts[0]), int(parts[1][:2])
    except (TypeError, ValueError, IndexError):
        return None
    if 0 <= h <= 23 and 0 <= m <= 59:
        return h * 60 + m
    return None


def _format_hhmm(minutes: int) -> str:
    minutes = int(minutes) % (24 * 60)
    if minutes < 0:
        minutes += 24 * 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _span_minutes(start: int | None, end: int | None) -> int | None:
    if start is None or end is None:
        return None
    if end >= start:
        return end - start
    return (end + 24 * 60) - start


def _is_evening_hotel(node: dict[str, Any]) -> bool:
    if (node.get("category") or "").strip().lower() != "hotel":
        return False
    tips = " ".join(node.get("tips") or [])
    if "过夜" in tips:
        return True
    st = _parse_hhmm(node.get("start_time"))
    return st is not None and st >= 18 * 60


def should_skip_duration_clamp(node: dict[str, Any], *, pinned: bool) -> bool:
    """Flight-pinned airports and overnight hotels keep authoritative clocks."""
    cat = (node.get("category") or "").strip().lower()
    if pinned and cat == "airport":
        return True
    if _is_evening_hotel(node):
        return True
    return False


def apply_category_duration_clamp(
    itinerary: dict[str, Any],
    *,
    pinned_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Clamp flexible node stay lengths to category [min,max]; keep start, adjust end.

    Does not invent new POIs. Writes duration_minutes. Soft note in meta.warnings if any clamp.
    """
    pinned_ids = pinned_ids or set()
    days = itinerary.get("days") or []
    clamped_n = 0

    for day in days:
        for node in day.get("nodes") or []:
            nid = str(node.get("id") or "")
            pinned = nid in pinned_ids
            if should_skip_duration_clamp(node, pinned=pinned):
                continue

            cat = (node.get("category") or "").strip().lower()
            if cat in {"airport", "hotel"} and not pinned:
                # Unpinned airport/hotel: still apply soft bounds (morning hotel ~30m)
                pass

            st = _parse_hhmm(node.get("start_time"))
            en = _parse_hhmm(node.get("end_time"))
            span = _span_minutes(st, en)
            raw: int | None = span
            if raw is None and node.get("duration_minutes") is not None:
                try:
                    raw = int(node["duration_minutes"])
                except (TypeError, ValueError):
                    raw = None
            if raw is None:
                raw = typical_duration_minutes(cat)

            clamped = clamp_duration_minutes(cat, raw)
            if clamped != raw:
                clamped_n += 1

            node["duration_minutes"] = clamped
            if st is not None:
                # Keep start; rewrite end from clamped span (same-day, no overnight for body POIs)
                node["start_time"] = _format_hhmm(st)
                node["end_time"] = _format_hhmm(st + clamped)
            elif en is not None:
                node["end_time"] = _format_hhmm(en)
                node["start_time"] = _format_hhmm(en - clamped)
            # else: cascade will place using duration_minutes / typical

    if clamped_n:
        meta = itinerary.setdefault("meta", {})
        warnings = list(meta.get("warnings") or [])
        note = f"已按品类默认停留夹逼 {clamped_n} 个节点时长（非营业时间校验）"
        if note not in warnings:
            warnings.append(note)
        meta["warnings"] = warnings

    return itinerary
