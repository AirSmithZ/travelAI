"""HOT-ZONE-TAG: deterministic fit_tag / bookable for stay-zone cards."""

from __future__ import annotations

import re
from typing import Any, Literal

FitTag = Literal["current_anchor", "preference_fit", "compromise", "needs_city_change"]

FIT_TAG_LABELS: dict[FitTag, str] = {
    "current_anchor": "当前锚点",
    "preference_fit": "贴合偏好",
    "compromise": "折中",
    "needs_city_change": "需换城",
}

from app.services.stay_zone.theme_extract import extract_themes

# Light tables: preference keyword → example alt cities (CN labels)
_SEASIDE_RE = re.compile(r"海边|海滩|沙滩|海岛|海滨|亲海|beach|美溪|芽庄|岘港|富国|头顿|美奈")

_SEASIDE_ALTS_BY_DEST: dict[str, list[tuple[str, str]]] = {
    "越南": [
        ("芽庄", "芽庄海边酒店带"),
        ("岘港", "岘港美溪/海边带"),
        ("富国岛", "富国岛海边度假带"),
        ("头顿", "头顿近海一日可达"),
    ],
    "胡志明": [
        ("芽庄", "芽庄海边酒店带"),
        ("岘港", "岘港美溪/海边带"),
        ("富国岛", "富国岛海边度假带"),
        ("头顿", "头顿近海（自驾/巴士）"),
    ],
    "胡志明市": [
        ("芽庄", "芽庄海边酒店带"),
        ("岘港", "岘港美溪/海边带"),
        ("富国岛", "富国岛海边度假带"),
        ("头顿", "头顿近海（自驾/巴士）"),
    ],
    "西贡": [
        ("芽庄", "芽庄海边酒店带"),
        ("岘港", "岘港美溪/海边带"),
        ("富国岛", "富国岛海边度假带"),
    ],
}


def preference_blob(trip_request: dict[str, Any] | None) -> str:
    from app.services.stay_zone.theme_extract import preference_blob as _blob

    return _blob(trip_request)


def detect_preference_themes(blob: str) -> set[str]:
    """Backward-compatible set of theme ids from free blob (legacy callers)."""
    fake_tr = {"free_text": blob, "notes": "", "preference_tags": []}
    return {t.id for t in extract_themes(fake_tr).positive() if not t.id.startswith("custom:")}


def _norm_city(s: str) -> str:
    t = (s or "").strip().lower()
    t = re.sub(r"\s+", "", t)
    for suf in ("市", "省", "特别市"):
        if t.endswith(suf):
            t = t[: -len(suf)]
    # aliases
    aliases = {
        "saigon": "胡志明",
        "hochiminh": "胡志明",
        "hochiminhcity": "胡志明",
        "西贡": "胡志明",
        "胡志明市": "胡志明",
        "hanoi": "河内",
        "danang": "岘港",
        "nhatrang": "芽庄",
        "phuquoc": "富国",
        "vungtau": "头顿",
        "vũngtàu": "头顿",
        "头顿市": "头顿",
    }
    return aliases.get(t, t)


def cities_same(a: str, b: str) -> bool:
    na, nb = _norm_city(a), _norm_city(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return na in nb or nb in na


def destination_city(trip_request: dict[str, Any] | None) -> str:
    return ((trip_request or {}).get("destination") or "").strip()


def resolve_bookable_anchor(
    trip_request: dict[str, Any] | None,
    flights: list[dict[str, Any]] | None = None,
) -> str:
    """City used for bookable / same-city gates.

    Prefer confirmed outbound arrival city (SGN→胡志明) over a country-level
    destination like「越南」, which must not mark HCMC hubs as needs_city_change.
    """
    from app.services.stay_zone.geocode_bias import airport_anchor_from_flights

    ap = airport_anchor_from_flights(flights)
    if ap:
        label = str(ap.get("city_zh") or ap.get("city_en") or "").strip()
        if label:
            return label
    return destination_city(trip_request)


def preference_dest_key(
    trip_request: dict[str, Any] | None,
    flights: list[dict[str, Any]] | None = None,
) -> str:
    """Key for seaside alt tables: trip destination, else arrival country/city."""
    dest = destination_city(trip_request)
    if dest:
        return dest
    from app.services.stay_zone.geocode_bias import airport_anchor_from_flights

    ap = airport_anchor_from_flights(flights)
    if not ap:
        return ""
    return str(ap.get("country_zh") or ap.get("city_zh") or ap.get("city_en") or "").strip()


def parse_fit_tag(raw: Any) -> FitTag | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    mapping = {
        "current_anchor": "current_anchor",
        "当前锚点": "current_anchor",
        "preference_fit": "preference_fit",
        "贴合偏好": "preference_fit",
        "compromise": "compromise",
        "折中": "compromise",
        "needs_city_change": "needs_city_change",
        "需换城": "needs_city_change",
        "换城": "needs_city_change",
    }
    return mapping.get(s)  # type: ignore[return-value]


def zone_matches_seaside(zone: dict[str, Any]) -> bool:
    text = f"{zone.get('label') or ''} {zone.get('city') or ''} {zone.get('rationale') or ''}"
    if _SEASIDE_RE.search(text):
        return True
    city = _norm_city(str(zone.get("city") or ""))
    seaside_cities = ("芽庄", "岘港", "富国", "头顿", "美奈", "会安", "nhatrang", "danang", "phuquoc")
    return any(c in city for c in seaside_cities)


def assign_zone_tags(
    zone: dict[str, Any],
    *,
    destination: str,
    themes: set[str],
) -> dict[str, Any]:
    """Mutate/return zone with fit_tag, bookable, tag_note (rules win over LLM).

    ``destination`` here is the **bookable anchor city** (flight arrival preferred).
    """
    city = str(zone.get("city") or "").strip()
    same = cities_same(city, destination) if city and destination else True
    llm_tag = parse_fit_tag(zone.get("fit_tag"))

    tag: FitTag
    note = str(zone.get("tag_note") or "").strip()

    if not same:
        tag = "needs_city_change"
        # Always refresh note against bookable anchor (LLM may have compared to「越南」)
        note = f"更贴合偏好，但与当前机酒锚点「{destination}」不同城，需改目的地/航班后再订"
    elif "seaside" in themes and not zone_matches_seaside(zone):
        tag = "compromise" if llm_tag != "current_anchor" else "current_anchor"
        # Prefer marking destination-city hub as current_anchor
        if llm_tag == "current_anchor" or not llm_tag:
            tag = "current_anchor"
        if not note or "不同城" in note or "需换城" in note:
            note = "当前机酒锚点城内 · 非典型海边，仅作城内住宿折中"
    elif "seaside" in themes and zone_matches_seaside(zone) and same:
        tag = "preference_fit"
        if not note:
            note = "同城且贴合海边/海滩偏好"
    elif llm_tag in ("preference_fit", "compromise", "current_anchor"):
        tag = llm_tag
    else:
        tag = "current_anchor" if same else "needs_city_change"

    # Ensure at least one current_anchor semantics for same-city default hubs
    if same and tag == "needs_city_change":
        tag = "compromise"

    bookable = tag != "needs_city_change"
    zone["fit_tag"] = tag
    zone["bookable"] = bookable
    zone["tag_note"] = note or FIT_TAG_LABELS[tag]
    return zone


def ensure_preference_alt_zones(
    zones: list[dict[str, Any]],
    *,
    trip_request: dict[str, Any],
    segments: list[Any],
    flights: list[dict[str, Any]] | None = None,
    bookable_anchor: str = "",
) -> list[dict[str, Any]]:
    """If seaside themes and no needs_city_change alt, append light table candidates."""
    extracted = extract_themes(trip_request)
    if not any(t.id == "seaside" for t in extracted.positive()):
        return zones
    if any(z.get("fit_tag") == "needs_city_change" for z in zones):
        return zones

    dest = preference_dest_key(trip_request, flights)
    anchor = (bookable_anchor or resolve_bookable_anchor(trip_request, flights)).strip()
    alts: list[tuple[str, str]] = []
    for key, rows in _SEASIDE_ALTS_BY_DEST.items():
        if key in dest or _norm_city(key) == _norm_city(dest):
            alts = rows
            break
    if not alts and ("越南" in dest or "vietnam" in dest.lower()):
        alts = _SEASIDE_ALTS_BY_DEST["越南"]
    if not alts and anchor and ("胡志明" in _norm_city(anchor) or "西贡" in anchor):
        alts = _SEASIDE_ALTS_BY_DEST["胡志明市"]
    if not alts:
        return zones

    seg = segments[0] if segments else None
    check_in = getattr(seg, "check_in", None) or trip_request.get("date_start") or ""
    check_out = getattr(seg, "check_out", None) or trip_request.get("date_end") or check_in
    day_indices = list(getattr(seg, "day_indices", []) or [])

    out = list(zones)
    existing_cities = {_norm_city(str(z.get("city") or "")) for z in out}
    seq0 = max((int(z.get("sequence") or 0) for z in out), default=0)
    added = 0
    compare_city = anchor or dest
    for city, label in alts:
        if _norm_city(city) in existing_cities:
            continue
        if compare_city and cities_same(city, compare_city):
            continue
        added += 1
        out.append(
            {
                "id": "",  # filled by caller
                "sequence": seq0 + added,
                "city": city,
                "label": label,
                "check_in": check_in,
                "check_out": check_out,
                "rationale": (
                    f"提示词含海边相关偏好，而机酒锚点「{compare_city or dest}」并非典型海边。"
                    f"若要以海为主，可考虑改目的地至{city}。"
                ),
                "transit_note": "备选 · 需换城后才可按此区锁店",
                "strategy": "compromise",
                "anchor_hints": [f"{city} beach", f"{city} hotel"],
                "covers_day_indices": day_indices,
                "status": "proposed",
                "fit_tag": "needs_city_change",
                "bookable": False,
                "tag_note": f"贴合海边，但与当前机酒锚点「{compare_city or dest}」冲突",
            }
        )
        if added >= 2:
            break
    return out


def sort_zones_by_tag(zones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = {
        "current_anchor": 0,
        "preference_fit": 1,
        "compromise": 2,
        "needs_city_change": 3,
    }

    def key(z: dict[str, Any]) -> tuple[int, int]:
        tag = parse_fit_tag(z.get("fit_tag")) or "compromise"
        return (order.get(tag, 9), int(z.get("sequence") or 0))

    ranked = sorted(zones, key=key)
    for i, z in enumerate(ranked):
        z["sequence"] = i + 1
    return ranked


def apply_tags_to_zones(
    zones: list[dict[str, Any]],
    *,
    trip_request: dict[str, Any],
    segments: list[Any],
    flights: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    anchor = resolve_bookable_anchor(trip_request, flights)
    extracted = extract_themes(trip_request)
    theme_ids = {t.id for t in extracted.positive()}
    # map to legacy set used by assign_zone_tags
    legacy = {x for x in theme_ids if x in ("seaside", "food", "nature")}
    tagged = [
        assign_zone_tags(dict(z), destination=anchor, themes=legacy) for z in zones
    ]
    if anchor and not any(z.get("fit_tag") == "current_anchor" for z in tagged):
        for z in tagged:
            if z.get("bookable") and cities_same(str(z.get("city") or ""), anchor):
                z["fit_tag"] = "current_anchor"
                z["tag_note"] = z.get("tag_note") or "当前机酒锚点城内推荐"
                break
    tagged = ensure_preference_alt_zones(
        tagged,
        trip_request=trip_request,
        segments=segments,
        flights=flights,
        bookable_anchor=anchor,
    )
    tagged = [assign_zone_tags(z, destination=anchor, themes=legacy) for z in tagged]
    return sort_zones_by_tag(tagged)
