"""住宿段切分：按行程天数与目的地划分 stay segment。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class StaySegment:
    city: str
    check_in: str
    check_out: str
    day_indices: list[int]


def _day_dates(itinerary: dict[str, Any] | None) -> list[tuple[int, str | None]]:
    if not itinerary:
        return []
    out: list[tuple[int, str | None]] = []
    for i, day in enumerate(itinerary.get("days") or []):
        out.append((i, day.get("date")))
    return out


def segment_stays(
    trip_request: dict[str, Any],
    itinerary: dict[str, Any] | None,
) -> list[StaySegment]:
    """Phase 1：同城整段为 1 segment；无 itinerary 时用 trip_request 日期。"""
    destination = (trip_request.get("destination") or "").strip() or "目的地"
    day_rows = _day_dates(itinerary)

    if not day_rows:
        check_in = trip_request.get("date_start") or ""
        check_out = trip_request.get("date_end") or check_in
        if not check_in:
            check_in = check_out or ""
        return [
            StaySegment(
                city=destination,
                check_in=check_in,
                check_out=check_out or check_in,
                day_indices=list(range(max(1, trip_request.get("day_count") or 1))),
            )
        ]

    indices = [i for i, _ in day_rows]
    dates = [d for _, d in day_rows if d]
    check_in = dates[0] if dates else (trip_request.get("date_start") or "")
    check_out = dates[-1] if dates else (trip_request.get("date_end") or check_in)
    if check_out and check_in and check_out <= check_in:
        check_out = check_in

    return [
        StaySegment(
            city=destination,
            check_in=check_in,
            check_out=check_out,
            day_indices=indices,
        )
    ]
