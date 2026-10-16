"""住宿段切分：按 trip_request.segments 或多城日期窗划分 stay segment（FLOW-MC-2/4）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class StaySegment:
    city: str
    check_in: str
    check_out: str
    day_indices: list[int]
    segment_id: str = "seg_1"


@dataclass
class DayCity:
    """FLOW-MC-4: which city/segment a calendar day belongs to."""

    city: str
    segment_id: str
    hotel: dict[str, Any] | None = None


def _day_dates(itinerary: dict[str, Any] | None) -> list[tuple[int, str | None]]:
    if not itinerary:
        return []
    out: list[tuple[int, str | None]] = []
    for i, day in enumerate(itinerary.get("days") or []):
        out.append((i, day.get("date")))
    return out


def _prefix(d: str | None) -> str:
    s = (d or "").strip()
    return s[:10] if len(s) >= 10 else s


def _norm_city(s: str) -> str:
    return "".join((s or "").strip().lower().split())


def _indices_for_window(
    day_rows: list[tuple[int, str | None]],
    check_in: str,
    check_out: str,
    fallback_all: bool,
) -> list[int]:
    cin, cout = _prefix(check_in), _prefix(check_out)
    if day_rows and cin and cout:
        out: list[int] = []
        for i, d in day_rows:
            dd = _prefix(d)
            if dd and cin <= dd < cout:
                out.append(i)
            elif dd and cin <= dd <= cout and cin == cout:
                out.append(i)
        if out:
            return out
        for i, d in day_rows:
            dd = _prefix(d)
            if dd and cin <= dd <= cout:
                out.append(i)
        if out:
            return out
    if fallback_all and day_rows:
        return [i for i, _ in day_rows]
    return []


def derive_raw_segments(trip_request: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalized segment dicts (id/city/dates); empty → synthetic from destination."""
    destination = (trip_request.get("destination") or "").strip() or "目的地"
    raw_segs = trip_request.get("segments") or []
    cities: list[dict[str, Any]] = []
    for i, s in enumerate(raw_segs):
        if not isinstance(s, dict):
            continue
        city = (s.get("city") or "").strip()
        if not city:
            continue
        cities.append(
            {
                "id": (s.get("id") or "").strip() or f"seg_{i + 1}",
                "city": city,
                "date_start": _prefix(s.get("date_start") or s.get("check_in")),
                "date_end": _prefix(s.get("date_end") or s.get("check_out")),
            }
        )
    if cities:
        return cities
    return [
        {
            "id": "seg_1",
            "city": destination,
            "date_start": _prefix(trip_request.get("date_start")),
            "date_end": _prefix(trip_request.get("date_end")),
        }
    ]


def _hotel_for_date(
    hotels: list[dict[str, Any]] | None,
    day: str,
) -> dict[str, Any] | None:
    if not hotels or not day:
        return None
    hits: list[dict[str, Any]] = []
    for h in hotels:
        if not isinstance(h, dict):
            continue
        cin, cout = _prefix(h.get("check_in")), _prefix(h.get("check_out"))
        if cin and cout and cin <= day < cout:
            hits.append(h)
        elif cin and cout and cin == cout and cin == day:
            hits.append(h)
        elif cin and not cout and cin == day:
            hits.append(h)
    if not hits:
        return None
    hits.sort(key=lambda x: int(x.get("sequence") or 0))
    return hits[-1]


def city_for_day_date(
    day_date: str | None,
    trip_request: dict[str, Any],
    hotels: list[dict[str, Any]] | None = None,
) -> DayCity | None:
    """Resolve city/segment for a YYYY-MM-DD day (FLOW-MC-4).

    Prefer owning locked hotel city/segment_id; else segment date window;
    else destination / seg_1.
    """
    day = _prefix(day_date)
    segs = derive_raw_segments(trip_request)
    hotel = _hotel_for_date(hotels, day) if day else None
    if hotel is not None:
        sid = str(hotel.get("segment_id") or "").strip()
        city = str(hotel.get("city") or "").strip()
        if not sid and city:
            for s in segs:
                if _norm_city(s["city"]) == _norm_city(city):
                    sid = s["id"]
                    break
        if not sid:
            sid = segs[0]["id"]
        if not city:
            for s in segs:
                if s["id"] == sid:
                    city = s["city"]
                    break
        return DayCity(city=city or segs[0]["city"], segment_id=sid, hotel=hotel)

    if day:
        for s in segs:
            cin = s.get("date_start") or ""
            cout = s.get("date_end") or ""
            if cin and cout and cin <= day < cout:
                return DayCity(city=s["city"], segment_id=s["id"], hotel=None)
            if cin and cout and cin == cout and cin == day:
                return DayCity(city=s["city"], segment_id=s["id"], hotel=None)
            if cin and not cout and cin <= day:
                return DayCity(city=s["city"], segment_id=s["id"], hotel=None)
        for s in segs:
            cin = s.get("date_start") or ""
            cout = s.get("date_end") or ""
            if cin and cout and cin <= day <= cout:
                return DayCity(city=s["city"], segment_id=s["id"], hotel=None)

    s0 = segs[0]
    return DayCity(city=s0["city"], segment_id=s0["id"], hotel=None)


def stamp_day_segment_ids(
    itinerary: dict[str, Any],
    trip_request: dict[str, Any],
    hotels: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Write days[].segment_id / soft-fill region from city_for_day (MC-4)."""
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        dc = city_for_day_date(day.get("date"), trip_request, hotels)
        if not dc:
            continue
        day["segment_id"] = dc.segment_id
        region = str(day.get("region") or "").strip()
        if not region or region == (trip_request.get("destination") or "").strip():
            day["region"] = dc.city
    return itinerary


def segment_stays(
    trip_request: dict[str, Any],
    itinerary: dict[str, Any] | None,
) -> list[StaySegment]:
    """Prefer trip_request.segments[]; else single segment from destination (compat)."""
    destination = (trip_request.get("destination") or "").strip() or "目的地"
    day_rows = _day_dates(itinerary)
    cities = derive_raw_segments(trip_request)
    has_explicit = bool(
        [
            s
            for s in (trip_request.get("segments") or [])
            if isinstance(s, dict) and (s.get("city") or "").strip()
        ]
    )

    if has_explicit:
        out: list[StaySegment] = []
        for i, s in enumerate(cities):
            check_in = s.get("date_start") or _prefix(trip_request.get("date_start"))
            check_out = s.get("date_end") or _prefix(trip_request.get("date_end")) or check_in
            if check_out and check_in and check_out < check_in:
                check_out = check_in
            indices = _indices_for_window(
                day_rows,
                check_in,
                check_out,
                fallback_all=(len(cities) == 1),
            )
            if not indices and not day_rows:
                n = max(1, int(trip_request.get("day_count") or 1))
                chunk = max(1, n // len(cities))
                start = i * chunk
                end = n if i == len(cities) - 1 else min(n, start + chunk)
                indices = list(range(start, end)) if start < n else [max(0, n - 1)]
            out.append(
                StaySegment(
                    city=s["city"],
                    check_in=check_in or "",
                    check_out=check_out or check_in or "",
                    day_indices=indices,
                    segment_id=s["id"],
                )
            )
        return out

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
                segment_id="seg_1",
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
            segment_id="seg_1",
        )
    ]
