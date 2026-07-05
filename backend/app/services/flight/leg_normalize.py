"""Normalize Ignav leg segments into FlightLegSnapshot / FlightQuote fields."""

from __future__ import annotations

from typing import Any

from app.schemas.flight import FlightLegSnapshot


def segment_stops(segments: list[dict[str, Any]]) -> int:
    return max(0, len(segments) - 1)


def leg_label(segments: list[dict[str, Any]]) -> str:
    if not segments:
        return ""
    parts = [segments[0].get("departure_airport", "")]
    for seg in segments:
        parts.append(seg.get("arrival_airport", ""))
    return "→".join(p for p in parts if p)


def leg_times(segments: list[dict[str, Any]]) -> tuple[str, str]:
    if not segments:
        return "", ""
    depart = segments[0].get("departure_time_local") or segments[0].get("departure_time_utc") or ""
    arrive = segments[-1].get("arrival_time_local") or segments[-1].get("arrival_time_utc") or ""
    return str(depart), str(arrive)


def segment_flight_numbers(segments: list[dict[str, Any]]) -> list[str]:
    numbers: list[str] = []
    for seg in segments:
        code = (seg.get("marketing_carrier_code") or "").strip()
        num = (seg.get("flight_number") or "").strip()
        if code and num:
            numbers.append(f"{code}{num}")
        elif num:
            numbers.append(num)
    return numbers


def leg_carrier(leg: dict[str, Any], segments: list[dict[str, Any]]) -> str:
    carrier = leg.get("carrier") or ""
    if not carrier and segments:
        carrier = segments[0].get("operating_carrier_name") or segments[0].get("marketing_carrier_code") or ""
    return str(carrier)


def leg_duration_minutes(leg: dict[str, Any], segments: list[dict[str, Any]]) -> int:
    duration = int(leg.get("duration_minutes") or 0)
    if not duration and segments:
        duration = sum(int(s.get("duration_minutes") or 0) for s in segments)
    return duration


def snapshot_from_ignav_leg(
    leg: dict[str, Any],
    *,
    origin_iata: str,
    dest_iata: str,
) -> FlightLegSnapshot:
    segments = leg.get("segments") or []
    depart_time, arrive_time = leg_times(segments)
    return FlightLegSnapshot(
        origin_iata=origin_iata.upper(),
        dest_iata=dest_iata.upper(),
        airline=leg_carrier(leg, segments),
        route_label=leg_label(segments) or f"{origin_iata.upper()}→{dest_iata.upper()}",
        depart_time=depart_time,
        arrive_time=arrive_time,
        duration_minutes=leg_duration_minutes(leg, segments),
        stops=segment_stops(segments),
        flight_numbers=segment_flight_numbers(segments),
    )
