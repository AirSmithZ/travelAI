"""Orchestrate commute candidates: user hints + Directions + estimate."""

from __future__ import annotations

from app.config import Settings, get_settings
from app.schemas.commute import (
    CommuteCandidate,
    CommuteLookupRequest,
    CommuteLookupResponse,
)
from app.services.commute.directions import fetch_direction_legs
from app.services.commute.route_hints import extract_route_hints, relevant_hints
from app.services.geocode_providers import haversine_km

_WALK_KMH = 4.5
_TAXI_KMH = 28.0


def _estimate_candidates(straight_m: float) -> list[CommuteCandidate]:
    km = straight_m / 1000.0
    walk_min = max(1, int(round(km / _WALK_KMH * 60)))
    taxi_min = max(1, int(round(km / _TAXI_KMH * 60)))
    out: list[CommuteCandidate] = []
    if straight_m < 2500:
        out.append(
            CommuteCandidate(
                transport_mode="walk",
                duration_minutes=walk_min,
                distance_meters=int(straight_m),
                label=f"直线步行估 {walk_min} 分钟",
                summary="直线距离估算（非路网）",
                source="estimate",
            )
        )
    out.append(
        CommuteCandidate(
            transport_mode="taxi",
            duration_minutes=taxi_min,
            distance_meters=int(straight_m),
            label=f"直线打车估 {taxi_min} 分钟",
            summary="直线距离估算（非路网）",
            source="estimate",
        )
    )
    return out


def _default_hint_minutes(mode: str, straight_m: float) -> int:
    if mode == "ferry":
        return 45
    return max(20, int(round(straight_m / 1000 / 3.0 * 60)))


def lookup_commute(
    body: CommuteLookupRequest,
    *,
    settings: Settings | None = None,
) -> CommuteLookupResponse:
    cfg = settings or get_settings()
    warnings: list[str] = []
    from_p, to_p = body.from_point, body.to_point
    straight_km = haversine_km(from_p.lat, from_p.lng, to_p.lat, to_p.lng)
    straight_m = int(round(straight_km * 1000))

    prompt = "\n".join(
        x for x in [(body.free_text or "").strip(), (body.notes or "").strip()] if x
    )
    hints = relevant_hints(
        extract_route_hints(
            prompt,
            from_name=from_p.name or "",
            to_name=to_p.name or "",
        )
    )

    candidates: list[CommuteCandidate] = []
    non_routable_hit = False

    for h in hints:
        if h.non_routable:
            non_routable_hit = True
        minutes = h.duration_minutes or _default_hint_minutes(
            h.transport_mode, float(straight_m)
        )
        candidates.append(
            CommuteCandidate(
                transport_mode=h.transport_mode,
                duration_minutes=minutes,
                distance_meters=straight_m if straight_m > 0 else None,
                label=h.label,
                summary=h.summary,
                source="user_hint",
                recommended=bool(h.non_routable or h.score >= 0.7),
            )
        )

    if non_routable_hit:
        warnings.append(
            "提示词含海路/山路/缆车等特殊路线；Directions 可能搜不到，已保留用户描述候选"
        )

    provider: str | None = None
    if body.use_directions:
        legs, dir_warnings = fetch_direction_legs(
            start_lat=from_p.lat,
            start_lng=from_p.lng,
            end_lat=to_p.lat,
            end_lng=to_p.lng,
            straight_line_m=float(straight_m),
            settings=cfg,
        )
        warnings.extend(dir_warnings)
        if legs:
            provider = "serpapi_directions"
            for leg in legs:
                candidates.append(
                    CommuteCandidate(
                        transport_mode=leg.transport_mode,
                        duration_minutes=leg.duration_minutes,
                        distance_meters=leg.distance_meters,
                        label=leg.label,
                        summary=leg.summary,
                        source="directions",
                        fare_estimate=leg.fare_estimate,
                        currency=leg.currency,
                    )
                )

    has_directions = any(c.source == "directions" for c in candidates)
    has_hint = any(c.source == "user_hint" for c in candidates)
    if not candidates:
        candidates.extend(_estimate_candidates(float(straight_m)))
        warnings.append("无 Directions/提示词命中，已提供直线估算")
    elif not has_directions and not has_hint:
        candidates.extend(_estimate_candidates(float(straight_m)))

    if candidates and not any(c.recommended for c in candidates):
        pick_i = 0
        for i, c in enumerate(candidates):
            if c.source == "directions" and c.transport_mode in {
                "subway",
                "bus",
                "walk",
            }:
                pick_i = i
                break
            if c.source == "directions":
                pick_i = i
                break
            if c.source == "user_hint":
                pick_i = i
                break
        candidates[pick_i] = candidates[pick_i].model_copy(update={"recommended": True})

    deduped: list[CommuteCandidate] = []
    seen: set[tuple[str, str, int]] = set()
    for c in candidates:
        key = (c.transport_mode, c.source, c.duration_minutes)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)

    return CommuteLookupResponse(
        candidates=deduped,
        warnings=warnings,
        provider=provider,
        straight_line_meters=straight_m,
    )
