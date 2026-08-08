"""Simplify soft OD warning — avoid brittle Singapore special-case."""

from __future__ import annotations

from datetime import datetime

from app.schemas.flight import FlightManualValidateRequest, FlightManualValidateResponse
from app.services.flight.city_codes import UnknownCityCodeError, resolve_search_iata


def validate_manual_flight(body: FlightManualValidateRequest) -> FlightManualValidateResponse:
    errors: list[str] = []
    warnings: list[str] = []
    origin_iata: str | None = None
    dest_iata: str | None = None

    try:
        origin_iata = resolve_search_iata(body.origin)
    except UnknownCityCodeError:
        errors.append(f"无法识别出发地：{body.origin}")

    try:
        dest_iata = resolve_search_iata(body.destination)
    except UnknownCityCodeError:
        errors.append(f"无法识别到达地：{body.destination}")

    duration_minutes = 0
    try:
        d0 = datetime.fromisoformat(body.depart_at.replace("Z", "+00:00"))
        d1 = datetime.fromisoformat(body.arrive_at.replace("Z", "+00:00"))
        if d1 <= d0:
            errors.append("到达时间须晚于出发时间")
        else:
            duration_minutes = int((d1 - d0).total_seconds() // 60)
    except ValueError:
        errors.append("depart_at / arrive_at 时间格式无效")

    if body.trip_date_start:
        try:
            leg_day = body.depart_at[:10]
            if leg_day < body.trip_date_start:
                warnings.append(f"出发日 {leg_day} 早于行程开始 {body.trip_date_start}")
            if body.trip_date_end and leg_day > body.trip_date_end:
                warnings.append(f"出发日 {leg_day} 晚于行程结束 {body.trip_date_end}")
        except Exception:
            pass

    ok = len(errors) == 0
    return FlightManualValidateResponse(
        ok=ok,
        origin_iata=origin_iata,
        dest_iata=dest_iata,
        duration_minutes=duration_minutes if ok else None,
        errors=errors,
        warnings=warnings,
    )
