"""Auto-enrich suspicious itinerary edges after geocode (TRN-02)."""

from __future__ import annotations

import logging
from typing import Any

from app.config import Settings, get_settings
from app.schemas.commute import CommuteCandidate, CommuteLookupRequest, CommutePoint
from app.services.commute.lookup import lookup_commute
from app.services.geocode_providers import haversine_km

logger = logging.getLogger(__name__)

_DEFAULT_DURATIONS = frozenset({0, 15, 20, 25})
_VERIFIED_SOURCES = frozenset({"directions", "user_hint"})


def _valid_coords(node: dict[str, Any]) -> tuple[float, float] | None:
    try:
        lat, lng = float(node.get("lat") or 0), float(node.get("lng") or 0)
    except (TypeError, ValueError):
        return None
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def _node_map(day: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for n in day.get("nodes") or []:
        if isinstance(n, dict) and n.get("id"):
            out[str(n["id"])] = n
    return out


def suspicion_score(
    edge: dict[str, Any],
    from_node: dict[str, Any],
    to_node: dict[str, Any],
    straight_m: float,
    *,
    walk_m: float,
    long_m: float,
) -> float:
    """Higher = more urgent to verify. 0 = skip."""
    source = str(edge.get("route_source") or "")
    if source in _VERIFIED_SOURCES:
        return 0.0

    mode = str(edge.get("transport_mode") or "walk")
    if mode == "flight":
        return 0.0

    score = 0.0
    if mode == "walk" and straight_m >= walk_m:
        score = max(score, straight_m)
    if straight_m >= long_m:
        score = max(score, straight_m + 500)
    try:
        dur = int(edge.get("duration_minutes") or 0)
    except (TypeError, ValueError):
        dur = 0
    if dur in _DEFAULT_DURATIONS and straight_m >= 1500:
        score = max(score, straight_m)

    cats = {str(from_node.get("category") or ""), str(to_node.get("category") or "")}
    if cats & {"airport", "hotel"} and mode == "walk" and straight_m >= 800:
        score = max(score, straight_m + 200)

    return score


def is_suspicious_edge(
    edge: dict[str, Any],
    from_node: dict[str, Any],
    to_node: dict[str, Any],
    straight_m: float,
    *,
    walk_m: float = 900.0,
    long_m: float = 3000.0,
) -> bool:
    return (
        suspicion_score(
            edge, from_node, to_node, straight_m, walk_m=walk_m, long_m=long_m
        )
        > 0
    )


def _pick_auto_candidate(
    candidates: list[CommuteCandidate],
    *,
    straight_m: float,
    current_mode: str,
) -> CommuteCandidate | None:
    if not candidates:
        return None
    for c in candidates:
        if c.recommended:
            return c
    for c in candidates:
        if c.source == "directions":
            return c
    for c in candidates:
        if c.source == "user_hint":
            return c
    # Weak estimate only when walk is clearly wrong for long legs
    if current_mode == "walk" and straight_m >= 3000:
        for c in candidates:
            if c.source == "estimate" and c.transport_mode == "taxi":
                return c
    return None


def _apply_candidate(edge: dict[str, Any], c: CommuteCandidate) -> None:
    edge["transport_mode"] = c.transport_mode
    edge["duration_minutes"] = int(c.duration_minutes)
    if c.distance_meters is not None:
        edge["distance_meters"] = int(c.distance_meters)
    if c.label:
        edge["label"] = c.label
    edge["route_source"] = c.source


def list_suspicious_edges(
    itinerary: dict[str, Any],
    *,
    walk_m: float = 900.0,
    long_m: float = 3000.0,
    max_edges: int = 8,
) -> list[tuple[float, str, dict[str, Any], dict[str, Any], dict[str, Any], float]]:
    """
    Returns ranked tuples:
    (score, scope_label, edge, from_node, to_node, straight_m)
    """
    ranked: list[tuple[float, str, dict[str, Any], dict[str, Any], dict[str, Any], float]] = []

    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        nodes = _node_map(day)
        day_idx = day.get("day_index") or "?"
        for edge in day.get("edges") or []:
            if not isinstance(edge, dict):
                continue
            if str(edge.get("type") or "primary") == "alternative":
                continue
            a = nodes.get(str(edge.get("from") or ""))
            b = nodes.get(str(edge.get("to") or ""))
            if not a or not b:
                continue
            ca, cb = _valid_coords(a), _valid_coords(b)
            if not ca or not cb:
                continue
            straight_m = haversine_km(ca[0], ca[1], cb[0], cb[1]) * 1000
            score = suspicion_score(
                edge, a, b, straight_m, walk_m=walk_m, long_m=long_m
            )
            if score <= 0:
                continue
            ranked.append((score, f"Day{day_idx}", edge, a, b, straight_m))

    for edge in itinerary.get("cross_day_edges") or []:
        if not isinstance(edge, dict):
            continue
        # resolve nodes across days
        a = b = None
        for day in itinerary.get("days") or []:
            if not isinstance(day, dict):
                continue
            nm = _node_map(day)
            if a is None:
                a = nm.get(str(edge.get("from") or ""))
            if b is None:
                b = nm.get(str(edge.get("to") or ""))
        if not a or not b:
            continue
        ca, cb = _valid_coords(a), _valid_coords(b)
        if not ca or not cb:
            continue
        straight_m = haversine_km(ca[0], ca[1], cb[0], cb[1]) * 1000
        score = suspicion_score(edge, a, b, straight_m, walk_m=walk_m, long_m=long_m)
        if score <= 0:
            continue
        ranked.append((score, "跨日", edge, a, b, straight_m))

    ranked.sort(key=lambda t: t[0], reverse=True)
    if max_edges > 0:
        ranked = ranked[:max_edges]
    return ranked


def enrich_itinerary_commute(
    itinerary: dict[str, Any],
    *,
    free_text: str = "",
    notes: str = "",
    settings: Settings | None = None,
    use_directions: bool | None = None,
) -> dict[str, Any]:
    """
    Mutates suspicious primary edges in-place (also returns itinerary).
    Cost-capped: only top COMMUTE_AUTO_MAX_EDGES edges; Directions cached.
    """
    cfg = settings or get_settings()
    if not getattr(cfg, "commute_auto_enrich", True):
        return itinerary

    walk_m = float(getattr(cfg, "commute_suspicious_walk_m", 900) or 900)
    long_m = float(getattr(cfg, "commute_suspicious_long_m", 3000) or 3000)
    max_edges = int(getattr(cfg, "commute_auto_max_edges", 8) or 8)
    do_dir = (
        bool(use_directions)
        if use_directions is not None
        else bool(getattr(cfg, "commute_auto_use_directions", True))
    )

    targets = list_suspicious_edges(
        itinerary, walk_m=walk_m, long_m=long_m, max_edges=max_edges
    )
    if not targets:
        return itinerary

    updated = 0
    unresolved: list[str] = []

    for _score, scope, edge, a, b, straight_m in targets:
        ca, cb = _valid_coords(a), _valid_coords(b)
        if not ca or not cb:
            continue
        body = CommuteLookupRequest(
            from_point=CommutePoint(lat=ca[0], lng=ca[1], name=str(a.get("name") or "")),
            to_point=CommutePoint(lat=cb[0], lng=cb[1], name=str(b.get("name") or "")),
            free_text=free_text or "",
            notes=notes or "",
            use_directions=do_dir,
        )
        try:
            resp = lookup_commute(body, settings=cfg)
        except Exception as e:
            logger.info("commute auto enrich failed: %s", e)
            unresolved.append(
                f"{scope} {a.get('name')}→{b.get('name')} 通勤查询失败"
            )
            continue

        current_mode = str(edge.get("transport_mode") or "walk")
        pick = _pick_auto_candidate(
            resp.candidates, straight_m=straight_m, current_mode=current_mode
        )
        if not pick:
            unresolved.append(
                f"{scope} {a.get('name')}→{b.get('name')} 未能自动核实通勤"
            )
            continue
        _apply_candidate(edge, pick)
        updated += 1

    meta = itinerary.setdefault("meta", {})
    warnings = list(meta.get("warnings") or [])
    if updated:
        note = f"已自动核实 {updated} 段可疑通勤（Directions/提示词/估算）"
        if note not in warnings:
            warnings.append(note)
    for u in unresolved[:5]:
        if u not in warnings:
            warnings.append(u)
    meta["warnings"] = warnings
    meta["commute_auto_enriched"] = updated
    return itinerary
