"""Deterministically enforce confirmed travel_intel hotels/flights on itineraries.

LLM prompts alone are soft; this post-pass makes user-confirmed lodging and flight
times authoritative, shapes day loops (hotel→POI→hotel), and cascades same-day
node clocks so the schedule stays coherent with those anchors.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

from app.services.visit_duration import (
    apply_category_duration_clamp,
    clamp_duration_minutes,
    typical_duration_minutes,
)

# Flight → airport buffers (ground time estimates, not airborne duration)
ARRIVE_BUFFER_MIN = 75
DEPART_BUFFER_MIN = 120
# Same-day cascade
GAP_MIN = 15
MIN_NODE_DUR = 20
EARLY_DEPART_BEFORE_MIN = 6 * 60  # treat departures before 06:00 specially


def _norm_name(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _has_coords(lat: Any, lng: Any) -> bool:
    try:
        la = float(lat)
        ln = float(lng)
    except (TypeError, ValueError):
        return False
    return abs(la) > 1e-6 or abs(ln) > 1e-6


def _date_prefix(value: Any) -> str:
    s = str(value or "").strip()
    return s[:10] if len(s) >= 10 else s


def _hhmm_from_iso(value: Any) -> str | None:
    """Extract local wall-clock HH:mm from ISO-like datetime (timezone ignored)."""
    s = str(value or "").strip()
    if not s:
        return None
    if "T" in s:
        tail = s.split("T", 1)[1]
    elif " " in s and len(s) >= 16:
        tail = s.split(" ", 1)[1]
    else:
        tail = s
    # HH:mm or HH:mm:ss… / HH:mm+08:00
    if len(tail) >= 5 and tail[2] == ":":
        hh, mm = tail[0:2], tail[3:5]
        if hh.isdigit() and mm.isdigit():
            h, m = int(hh), int(mm)
            if 0 <= h <= 23 and 0 <= m <= 59:
                return f"{h:02d}:{m:02d}"
    return None


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


def _duration_minutes(start: int | None, end: int | None, *, default: int) -> int:
    if start is None or end is None:
        return default
    if end >= start:
        return max(MIN_NODE_DUR, end - start)
    # Overnight window on same calendar day node (e.g. 21:00→08:00)
    return max(MIN_NODE_DUR, (end + 24 * 60) - start)


def _default_duration_for_node(node: dict[str, Any]) -> int:
    """Typical/clamped stay for cascade — delegates to visit_duration L1 table."""
    cat = (node.get("category") or "").strip().lower()
    if cat == "hotel":
        tips = " ".join(node.get("tips") or [])
        if "过夜" in tips or (node.get("start_time") == "21:00"):
            return _duration_minutes(
                _parse_hhmm(node.get("start_time")),
                _parse_hhmm(node.get("end_time")),
                default=11 * 60,
            )
        return typical_duration_minutes("hotel")
    if node.get("duration_minutes") is not None:
        try:
            return max(MIN_NODE_DUR, clamp_duration_minutes(cat, int(node["duration_minutes"])))
        except (TypeError, ValueError):
            pass
    return typical_duration_minutes(cat)


def _resolve_departure_day_index(
    days: list[dict[str, Any]],
    flights: list[dict[str, Any]] | None,
) -> int | None:
    """0-based index of confirmed return/leave day — that evening must not get 入住酒店."""
    if not days:
        return None
    date_to_i = {
        d: i
        for i, day in enumerate(days)
        if (d := _date_prefix(day.get("date")))
    }
    flights = [f for f in (flights or []) if isinstance(f, dict)]
    for f in flights:
        if f.get("role") != "return":
            continue
        d = _date_prefix(f.get("depart_at"))
        if d in date_to_i:
            return date_to_i[d]
    return None


def _day_indices_for_hotel(
    hotel: dict[str, Any],
    days: list[dict[str, Any]],
    zones: list[dict[str, Any]],
    *,
    departure_day: int | None = None,
) -> list[int]:
    """Return 0-based day list indices this hotel covers for lodging (overnight nights)."""
    n = len(days)
    if n == 0:
        return []

    # P92: prefer check_in/out over zone covers — zones often include checkout/return day
    cin = _date_prefix(hotel.get("check_in"))
    cout = _date_prefix(hotel.get("check_out"))
    if cin and cout:
        out: list[int] = []
        for i, day in enumerate(days):
            d = _date_prefix(day.get("date"))
            if d and cin <= d < cout:
                out.append(i)
        if out:
            if departure_day is not None:
                out = [i for i in out if i != departure_day]
            return out

    zone_id = hotel.get("zone_id")
    if zone_id:
        for z in zones:
            if z.get("id") != zone_id:
                continue
            covers = z.get("covers_day_indices") or []
            out = [int(i) for i in covers if isinstance(i, (int, float)) and 0 <= int(i) < n]
            if departure_day is not None:
                out = [i for i in out if i != departure_day]
            if out:
                return sorted(set(out))

    # Fallback: every night except confirmed return/leave day
    nights = list(range(n))
    if departure_day is not None and 0 <= departure_day < n:
        nights = [i for i in nights if i != departure_day]
    elif n > 1:
        # No explicit return: still avoid forcing overnight on the last calendar day
        nights = list(range(n - 1))
    return nights


def _expand_loop_days(
    overnight: list[int],
    n_days: int,
    *,
    departure_day: int | None = None,
) -> dict[int, set[Literal["morning", "evening"]]]:
    """Map day index → which hotel anchors to place (arrival/departure aware)."""
    plan: dict[int, set[Literal["morning", "evening"]]] = {}
    if n_days == 0:
        return plan

    overnight_set = set(overnight)
    # Departure morning: explicit return flight day, else day after last overnight
    departure_i = departure_day if departure_day is not None else None
    if departure_i is not None and not (0 <= departure_i < n_days):
        departure_i = None
    if departure_i is None:
        departure_i = max(overnight_set) + 1 if overnight_set else None
        if departure_i is not None and departure_i >= n_days:
            departure_i = n_days - 1 if (n_days - 1) not in overnight_set else None
        if departure_i is not None and departure_i in overnight_set:
            departure_i = None

    for i in range(n_days):
        slots: set[Literal["morning", "evening"]] = set()
        is_arrival = i == 0
        is_departure = departure_i is not None and i == departure_i
        # Last calendar day with no further overnight → treat as departure
        if i == n_days - 1 and i not in overnight_set and overnight_set:
            is_departure = True
        # Confirmed return day: never evening 入住 / 过夜（对称 Day1 无早出酒店）
        if departure_day is not None and i == departure_day:
            is_departure = True
        if i in overnight_set:
            if not is_arrival:
                slots.add("morning")
            if not is_departure:
                slots.add("evening")
            # Single-day overnight stay: still need evening (and morning if not arrival)
            if is_arrival and is_departure:
                slots.add("evening")
        elif is_departure and overnight_set:
            slots.add("morning")
        if slots:
            plan[i] = slots

    # Arrival day always gets evening if any overnight on day 0
    if 0 in overnight_set:
        plan.setdefault(0, set()).add("evening")
        plan[0].discard("morning")

    # Pure departure day: morning only (checkout → … → airport), never evening check-in
    if departure_i is not None and 0 <= departure_i < n_days:
        if departure_i in plan or overnight_set:
            plan[departure_i] = {"morning"}
    else:
        last = n_days - 1
        if last in plan and last not in overnight_set:
            plan[last] = {"morning"}

    return plan


def _apply_hotel_fields(
    node: dict[str, Any],
    hotel: dict[str, Any],
    *,
    role: Literal["morning", "evening"],
) -> None:
    name = (hotel.get("name") or "").strip()
    if name:
        node["name"] = name
    node["category"] = "hotel"
    if hotel.get("address"):
        node["address"] = hotel["address"]
    if not node.get("cost_label"):
        node["cost_label"] = "住宿"
    if role == "morning":
        node["start_time"] = node.get("start_time") if node.get("start_time") == "08:00" else "08:00"
        node["end_time"] = "08:30"
        node["tips"] = list(node.get("tips") or [])
        if not any("出发" in t for t in node["tips"]):
            node["tips"] = ["从酒店出发", *node["tips"]][:4]
    else:
        if not node.get("start_time") or node.get("start_time") == "08:00":
            node["start_time"] = "21:00"
        if not node.get("end_time") or node.get("end_time") == "08:30":
            node["end_time"] = "08:00"
        tips = [t for t in (node.get("tips") or []) if "出发" not in t]
        if not any("回" in t for t in tips):
            tips = ["返回酒店过夜", *tips][:4]
        node["tips"] = tips
    lat, lng = hotel.get("lat"), hotel.get("lng")
    if _has_coords(lat, lng):
        node["lat"] = float(lat)
        node["lng"] = float(lng)
        node["coord_confidence"] = "high"
        node["coord_source"] = "travel_intel"
    region = hotel.get("city")
    if region and not node.get("region"):
        node["region"] = region


def _reconnect_primary_chain(day: dict[str, Any]) -> None:
    nodes = day.get("nodes") or []
    if len(nodes) < 2:
        day["edges"] = [
            e
            for e in (day.get("edges") or [])
            if e.get("type") == "alternative"
            and e.get("from") in {n["id"] for n in nodes}
            and e.get("to") in {n["id"] for n in nodes}
        ]
        return

    ids = [n["id"] for n in nodes]
    id_set = set(ids)
    alt = [
        e
        for e in (day.get("edges") or [])
        if e.get("type") == "alternative" and e.get("from") in id_set and e.get("to") in id_set
    ]
    day_num = day.get("day_index") or 1
    primary = []
    for j in range(1, len(ids)):
        primary.append(
            {
                "id": f"d{day_num}-e{j}",
                "from": ids[j - 1],
                "to": ids[j],
                "type": "primary",
                "transport_mode": "walk",
                "duration_minutes": 20,
            }
        )
    day["edges"] = primary + alt


def _new_hotel_node(
    hotel: dict[str, Any],
    *,
    day: dict[str, Any],
    day_num: int,
    sequence: int,
    role: Literal["morning", "evening"],
) -> dict[str, Any]:
    name = (hotel.get("name") or "").strip() or "酒店"
    nodes = day.get("nodes") or []
    existing = {n.get("id") for n in nodes}
    nid = f"d{day_num}-hotel-{sequence}-{role[:2]}"
    suffix = 1
    while nid in existing:
        suffix += 1
        nid = f"d{day_num}-hotel-{sequence}-{role[:2]}-{suffix}"
    node: dict[str, Any] = {
        "id": nid,
        "name": name,
        "category": "hotel",
        "lat": 0,
        "lng": 0,
        "region": hotel.get("city") or day.get("region"),
        "is_optional": False,
        "coord_confidence": "none",
        "cost_label": "住宿",
    }
    _apply_hotel_fields(node, hotel, role=role)
    return node


def _strip_all_hotels(day: dict[str, Any]) -> list[dict[str, Any]]:
    """Remove hotel nodes; return non-hotel nodes in order."""
    return [n for n in (day.get("nodes") or []) if n.get("category") != "hotel"]


def _place_day_hotels(
    day: dict[str, Any],
    hotel: dict[str, Any],
    *,
    day_num: int,
    sequence: int,
    slots: set[Literal["morning", "evening"]],
) -> list[str]:
    """Rebuild day nodes with hotel anchors in morning/evening slots. Returns node ids."""
    middle = _strip_all_hotels(day)
    # Keep airports at natural ends when present
    head: list[dict[str, Any]] = []
    tail: list[dict[str, Any]] = []
    body = list(middle)
    if body and body[0].get("category") == "airport" and "morning" not in slots:
        head.append(body.pop(0))
    if body and body[-1].get("category") == "airport" and "evening" not in slots:
        tail.insert(0, body.pop())

    nodes: list[dict[str, Any]] = []
    ids: list[str] = []
    if "morning" in slots:
        m = _new_hotel_node(hotel, day=day, day_num=day_num, sequence=sequence, role="morning")
        nodes.append(m)
        ids.append(str(m["id"]))
    nodes.extend(head)
    nodes.extend(body)
    nodes.extend(tail)
    if "evening" in slots:
        e = _new_hotel_node(hotel, day=day, day_num=day_num, sequence=sequence, role="evening")
        nodes.append(e)
        ids.append(str(e["id"]))

    day["nodes"] = nodes
    _reconnect_primary_chain(day)
    return ids


def _rebuild_cross_day_edges(itinerary: dict[str, Any]) -> None:
    days = itinerary.get("days") or []
    cross: list[dict[str, Any]] = []
    for i in range(len(days) - 1):
        from_nodes = days[i].get("nodes") or []
        to_nodes = days[i + 1].get("nodes") or []
        if not from_nodes or not to_nodes:
            continue
        cross.append(
            {
                "id": f"xd-e{i + 1}",
                "from": from_nodes[-1]["id"],
                "to": to_nodes[0]["id"],
                "type": "primary",
                "transport_mode": "taxi",
                "duration_minutes": 25,
                "label": "跨日衔接",
            }
        )
    itinerary["cross_day_edges"] = cross


def _meal_coverage_warnings(days: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    meal_cats = {"restaurant", "snack"}
    for day in days:
        day_num = day.get("day_index") or "?"
        nodes = day.get("nodes") or []
        meals = [n for n in nodes if n.get("category") in meal_cats]
        if len(meals) >= 3:
            continue
        # Arrival/departure may legitimately miss a meal
        cats = [n.get("category") for n in nodes]
        tight = "airport" in cats
        if tight and len(meals) >= 1:
            continue
        warnings.append(
            f"第 {day_num} 天餐饮节点偏少（{len(meals)} 个）；默认宜含早午晚，赶路日可用小吃/路上解决并注明"
        )
        if len(warnings) >= 3:
            break
    return warnings


def _pick_flight(
    flights: list[dict[str, Any]],
    role: Literal["outbound", "return"],
) -> dict[str, Any] | None:
    for f in flights:
        if f.get("role") == role:
            return f
    if role == "outbound" and flights:
        return flights[0]
    return None


def _day_index_for_date(days: list[dict[str, Any]], date_s: str) -> int | None:
    if not date_s:
        return None
    for i, day in enumerate(days):
        if _date_prefix(day.get("date")) == date_s:
            return i
    return None


def _airport_display_name(flight: dict[str, Any], *, arriving: bool) -> str:
    if arriving:
        code = (flight.get("dest_iata") or flight.get("destination_iata") or "").strip()
        city = (flight.get("dest_city") or flight.get("destination") or "").strip()
    else:
        code = (flight.get("origin_iata") or "").strip()
        city = (flight.get("origin_city") or flight.get("origin") or "").strip()
    if city and code:
        return f"{city}机场"
    if city:
        return f"{city}机场" if "机场" not in city else city
    if code:
        return f"{code} 机场"
    return "机场"


def _new_airport_node(
    *,
    day: dict[str, Any],
    day_num: int,
    name: str,
    role: Literal["arrive", "depart"],
) -> dict[str, Any]:
    existing = {n.get("id") for n in (day.get("nodes") or [])}
    nid = f"d{day_num}-airport-{role}"
    suffix = 1
    while nid in existing:
        suffix += 1
        nid = f"d{day_num}-airport-{role}-{suffix}"
    return {
        "id": nid,
        "name": name,
        "category": "airport",
        "lat": 0,
        "lng": 0,
        "region": day.get("region"),
        "is_optional": False,
        "coord_confidence": "none",
        "cost_label": "交通",
    }


def _ensure_tip(node: dict[str, Any], tip: str) -> None:
    tips = [t for t in (node.get("tips") or []) if t]
    if tip not in tips:
        tips = [tip, *tips][:4]
    node["tips"] = tips


def _edge_gap_before(day: dict[str, Any], to_id: str) -> int:
    for e in day.get("edges") or []:
        if e.get("type") == "primary" and e.get("to") == to_id:
            try:
                return max(GAP_MIN, int(e.get("duration_minutes") or GAP_MIN))
            except (TypeError, ValueError):
                return GAP_MIN
    return GAP_MIN


def _is_evening_hotel(node: dict[str, Any]) -> bool:
    if node.get("category") != "hotel":
        return False
    tips = " ".join(node.get("tips") or [])
    if "过夜" in tips:
        return True
    st = _parse_hhmm(node.get("start_time"))
    return st is not None and st >= 18 * 60


def _is_morning_hotel(node: dict[str, Any]) -> bool:
    if node.get("category") != "hotel":
        return False
    return not _is_evening_hotel(node)


def enforce_confirmed_flights(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None,
) -> tuple[dict[str, Any], set[str]]:
    """Pin airport node clocks to confirmed flight arrive/depart times.

    Returns (itinerary, pinned_node_ids).
    """
    pinned: set[str] = set()
    if not travel_intel:
        return itinerary, pinned

    flights = [f for f in (travel_intel.get("flights") or []) if isinstance(f, dict)]
    if not flights:
        return itinerary, pinned

    out = deepcopy(itinerary)
    days: list[dict[str, Any]] = out.get("days") or []
    if not days:
        return out, pinned

    bindings: list[dict[str, Any]] = []
    warnings = list((out.get("meta") or {}).get("warnings") or [])

    outbound = _pick_flight(flights, "outbound")
    if outbound:
        arrive_hhmm = _hhmm_from_iso(outbound.get("arrive_at"))
        arrive_date = _date_prefix(outbound.get("arrive_at"))
        day_i = _day_index_for_date(days, arrive_date)
        if day_i is None:
            day_i = 0
        if arrive_hhmm:
            day = days[day_i]
            day_num = int(day.get("day_index") or (day_i + 1))
            nodes = list(day.get("nodes") or [])
            airport = next((n for n in nodes if n.get("category") == "airport"), None)
            if airport is None:
                airport = _new_airport_node(
                    day=day,
                    day_num=day_num,
                    name=_airport_display_name(outbound, arriving=True),
                    role="arrive",
                )
                nodes.insert(0, airport)
            elif nodes[0].get("id") != airport.get("id"):
                nodes = [airport] + [n for n in nodes if n.get("id") != airport.get("id")]
            start_m = _parse_hhmm(arrive_hhmm) or 0
            end_m = start_m + ARRIVE_BUFFER_MIN
            airport["start_time"] = _format_hhmm(start_m)
            airport["end_time"] = _format_hhmm(end_m)
            airport["duration_minutes"] = ARRIVE_BUFFER_MIN
            _ensure_tip(airport, "按确认航班抵达校准（出关缓冲为估计）")
            day["nodes"] = nodes
            _reconnect_primary_chain(day)
            pinned.add(str(airport["id"]))
            bindings.append(
                {
                    "flight_id": outbound.get("id"),
                    "node_id": airport["id"],
                    "role": "outbound",
                    "day_index": day_num,
                }
            )
        else:
            warnings.append("去程航班缺少可解析的 arrive_at，未能校准抵达机场时刻")

    ret = _pick_flight(flights, "return")
    if ret:
        depart_hhmm = _hhmm_from_iso(ret.get("depart_at"))
        depart_date = _date_prefix(ret.get("depart_at"))
        day_i = _day_index_for_date(days, depart_date)
        if day_i is None:
            day_i = _resolve_departure_day_index(days, flights)
        if day_i is None:
            day_i = len(days) - 1
        if depart_hhmm and 0 <= day_i < len(days):
            day = days[day_i]
            day_num = int(day.get("day_index") or (day_i + 1))
            nodes = list(day.get("nodes") or [])
            airport = None
            for n in reversed(nodes):
                if n.get("category") == "airport":
                    airport = n
                    break
            if airport is None:
                airport = _new_airport_node(
                    day=day,
                    day_num=day_num,
                    name=_airport_display_name(ret, arriving=False),
                    role="depart",
                )
                nodes.append(airport)
            elif nodes[-1].get("id") != airport.get("id"):
                nodes = [n for n in nodes if n.get("id") != airport.get("id")] + [airport]

            end_m = _parse_hhmm(depart_hhmm) or 0
            start_m = end_m - DEPART_BUFFER_MIN
            if start_m < 0:
                # Overnight window on departure day (e.g. 22:55→00:55)
                start_m += 24 * 60
            airport["start_time"] = _format_hhmm(start_m)
            airport["end_time"] = _format_hhmm(end_m)
            airport["duration_minutes"] = DEPART_BUFFER_MIN
            _ensure_tip(airport, "按确认航班起飞校准（值机安检缓冲为估计）")

            # Early-morning return: morning hotel must not sit after takeoff
            if end_m < EARLY_DEPART_BEFORE_MIN:
                for n in nodes:
                    if not _is_morning_hotel(n):
                        continue
                    # Checkout just before airport window (may be previous evening clock)
                    hotel_end_m = start_m
                    hotel_start_m = hotel_end_m - 30
                    if hotel_start_m < 0:
                        hotel_start_m += 24 * 60
                    n["start_time"] = _format_hhmm(hotel_start_m)
                    n["end_time"] = _format_hhmm(hotel_end_m)
                    _ensure_tip(n, "按确认回程早班调整退房时间")
                    pinned.add(str(n["id"]))
                    break

            day["nodes"] = nodes
            _reconnect_primary_chain(day)
            pinned.add(str(airport["id"]))
            bindings.append(
                {
                    "flight_id": ret.get("id"),
                    "node_id": airport["id"],
                    "role": "return",
                    "day_index": day_num,
                }
            )
        elif not depart_hhmm:
            warnings.append("回程航班缺少可解析的 depart_at，未能校准离境机场时刻")

    _rebuild_cross_day_edges(out)
    meta = out.setdefault("meta", {})
    merged_w = list(meta.get("warnings") or [])
    for w in warnings:
        if w not in merged_w:
            merged_w.append(w)
    if bindings:
        note = "已按用户确认航班校准机场时刻"
        if note not in merged_w:
            merged_w.append(note)
    meta["warnings"] = merged_w
    meta["flight_bindings"] = bindings
    return out, pinned


def align_day_schedules(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None = None,
    *,
    pinned_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Cascade same-day node times from anchors (flight airports / hotel slots)."""
    del travel_intel  # reserved for future soft facts
    pinned_ids = pinned_ids or set()
    out = itinerary
    days: list[dict[str, Any]] = out.get("days") or []
    if not days:
        return out

    warnings = list((out.get("meta") or {}).get("warnings") or [])

    for day in days:
        nodes: list[dict[str, Any]] = day.get("nodes") or []
        if len(nodes) < 2:
            continue

        day_num = day.get("day_index") or "?"
        # Build duration + pin flags
        durs: list[int] = []
        is_pin: list[bool] = []
        starts: list[int | None] = []
        for n in nodes:
            st = _parse_hhmm(n.get("start_time"))
            en = _parse_hhmm(n.get("end_time"))
            default = _default_duration_for_node(n)
            durs.append(_duration_minutes(st, en, default=default))
            starts.append(st)
            nid = str(n.get("id") or "")
            pin = nid in pinned_ids or _is_evening_hotel(n)
            # Flight-pinned airports always pin; morning hotel pins start on middle days
            if n.get("category") == "airport" and nid in pinned_ids:
                pin = True
            is_pin.append(pin)

        # Find right-boundary anchor (evening hotel or pinned depart airport at end)
        right_anchor_i: int | None = None
        for i in range(len(nodes) - 1, -1, -1):
            if is_pin[i] or _is_evening_hotel(nodes[i]):
                right_anchor_i = i
                break
            if nodes[i].get("category") == "airport" and str(nodes[i].get("id")) in pinned_ids:
                right_anchor_i = i
                break

        # Left cursor: first node start (prefer pinned / morning hotel / airport)
        first = nodes[0]
        cursor = starts[0]
        if cursor is None:
            if _is_morning_hotel(first) or first.get("category") == "airport":
                cursor = 8 * 60 if _is_morning_hotel(first) else 9 * 60
            else:
                cursor = 9 * 60
            first["start_time"] = _format_hhmm(cursor)
            first["end_time"] = _format_hhmm(cursor + durs[0])
        else:
            # Keep pinned start; refresh end from duration for non-overnight evening hotel
            if not _is_evening_hotel(first):
                end_m = cursor + durs[0]
                if str(first.get("id")) in pinned_ids and _parse_hhmm(first.get("end_time")) is not None:
                    end_m = _parse_hhmm(first.get("end_time")) or end_m
                first["start_time"] = _format_hhmm(cursor)
                first["end_time"] = _format_hhmm(end_m)
            cursor = _parse_hhmm(first.get("end_time")) or (cursor + durs[0])

        # If first is overnight airport (start > end clock), cursor is end (early morning)
        first_st = _parse_hhmm(first.get("start_time"))
        first_en = _parse_hhmm(first.get("end_time"))
        if (
            first.get("category") == "airport"
            and first_st is not None
            and first_en is not None
            and first_en < first_st
        ):
            cursor = first_en

        packed_tight = False
        for i in range(1, len(nodes)):
            n = nodes[i]
            gap = _edge_gap_before(day, str(n.get("id") or ""))
            st_pin = str(n.get("id") or "") in pinned_ids
            evening = _is_evening_hotel(n)

            if evening or (st_pin and n.get("category") == "airport"):
                # Keep anchor clock; if we overshoot, mark tight
                anchor_st = _parse_hhmm(n.get("start_time"))
                if anchor_st is None:
                    if n.get("category") == "airport":
                        anchor_st = cursor + gap
                        n["start_time"] = _format_hhmm(anchor_st)
                    else:
                        anchor_st = 21 * 60
                        n["start_time"] = "21:00"
                        n["end_time"] = n.get("end_time") or "08:00"
                # Overshoot: try compress previous flexible nodes
                if cursor + gap > anchor_st and not (
                    n.get("category") == "airport"
                    and _parse_hhmm(n.get("end_time")) is not None
                    and (_parse_hhmm(n.get("end_time")) or 0)
                    < (_parse_hhmm(n.get("start_time")) or 0)
                ):
                    overflow = cursor + gap - anchor_st
                    # Compress from i-1 down to 1 (skip index 0 if pinned)
                    for j in range(i - 1, 0, -1):
                        if is_pin[j] or _is_evening_hotel(nodes[j]):
                            continue
                        reducible = durs[j] - MIN_NODE_DUR
                        if reducible <= 0:
                            continue
                        cut = min(reducible, overflow)
                        durs[j] -= cut
                        overflow -= cut
                        if overflow <= 0:
                            break
                    # Replay 0..i-1 with new durs
                    c2 = _parse_hhmm(nodes[0].get("end_time"))
                    if c2 is None:
                        s0 = _parse_hhmm(nodes[0].get("start_time")) or cursor
                        c2 = s0 + durs[0]
                        if not _is_evening_hotel(nodes[0]):
                            nodes[0]["end_time"] = _format_hhmm(c2)
                    for j in range(1, i):
                        g = _edge_gap_before(day, str(nodes[j].get("id") or ""))
                        if is_pin[j] or _is_evening_hotel(nodes[j]):
                            c2 = _parse_hhmm(nodes[j].get("end_time")) or (
                                (_parse_hhmm(nodes[j].get("start_time")) or c2) + durs[j]
                            )
                            continue
                        s = c2 + g
                        e = s + durs[j]
                        nodes[j]["start_time"] = _format_hhmm(s)
                        nodes[j]["end_time"] = _format_hhmm(e)
                        c2 = e
                    cursor = c2
                    if cursor + gap > anchor_st:
                        packed_tight = True
                # Do not move evening hotel / pinned airport times
                if evening:
                    cursor = _parse_hhmm(n.get("end_time")) or anchor_st
                    # overnight end next morning — stop cascading after evening hotel
                    break
                # pinned airport at end
                cursor = _parse_hhmm(n.get("end_time")) or (
                    (_parse_hhmm(n.get("start_time")) or 0)
                    + durs[i]
                )
                continue

            # Flexible body node (or morning hotel not pinned)
            start_m = cursor + gap
            # Pinned morning hotel (early return): keep its times
            if st_pin and _is_morning_hotel(n):
                start_m = _parse_hhmm(n.get("start_time")) or start_m
                end_m = _parse_hhmm(n.get("end_time")) or (start_m + durs[i])
                n["start_time"] = _format_hhmm(start_m)
                n["end_time"] = _format_hhmm(end_m)
                cursor = end_m if end_m >= start_m else end_m  # overnight end
                continue

            end_m = start_m + durs[i]
            # Clamp before right anchor if this node is before it
            if right_anchor_i is not None and i < right_anchor_i:
                anchor_st = _parse_hhmm(nodes[right_anchor_i].get("start_time"))
                if anchor_st is not None:
                    # Leave room for remaining flexible nodes + gaps
                    remain = right_anchor_i - i
                    room_end = anchor_st - remain * (GAP_MIN + MIN_NODE_DUR)
                    if end_m > room_end and room_end > start_m + MIN_NODE_DUR:
                        end_m = room_end
                        durs[i] = max(MIN_NODE_DUR, end_m - start_m)
                    elif start_m >= anchor_st:
                        packed_tight = True
                        start_m = max(0, anchor_st - MIN_NODE_DUR - gap)
                        end_m = start_m + MIN_NODE_DUR
                        durs[i] = MIN_NODE_DUR

            n["start_time"] = _format_hhmm(start_m)
            n["end_time"] = _format_hhmm(end_m)
            if n.get("duration_minutes") is not None or n.get("category") in {
                "attraction",
                "restaurant",
                "snack",
                "museum",
                "park",
            }:
                n["duration_minutes"] = durs[i]
            cursor = end_m

        if packed_tight:
            w = f"第 {day_num} 天行程过满，已尽量压缩节点时长；请删减景点或调整航班"
            if w not in warnings:
                warnings.append(w)

    meta = out.setdefault("meta", {})
    meta["warnings"] = warnings
    return out


def enforce_confirmed_hotels(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None,
) -> dict[str, Any]:
    """Force hotel day-loops to match ``travel_intel.hotels`` exact names/coords."""
    if not travel_intel:
        return itinerary

    hotels = [h for h in (travel_intel.get("hotels") or []) if isinstance(h, dict)]
    hotels = [h for h in hotels if (h.get("name") or "").strip()]
    if not hotels:
        return itinerary

    out = deepcopy(itinerary)
    days: list[dict[str, Any]] = out.get("days") or []
    if not days:
        return out

    zones = [
        z
        for z in (travel_intel.get("recommended_stay_zones") or [])
        if isinstance(z, dict)
    ]
    flights = [
        f for f in (travel_intel.get("flights") or []) if isinstance(f, dict)
    ]
    departure_day = _resolve_departure_day_index(days, flights)
    bindings: list[dict[str, Any]] = []
    n = len(days)

    # Primary hotel first; later hotels override overlapping days
    ordered = sorted(hotels, key=lambda h: int(h.get("sequence") or 1))
    day_owner: dict[int, dict[str, Any]] = {}
    day_slots: dict[int, set[Literal["morning", "evening"]]] = {}

    for h in ordered:
        overnight = _day_indices_for_hotel(
            h, days, zones, departure_day=departure_day
        )
        loop = _expand_loop_days(overnight, n, departure_day=departure_day)
        for i, slots in loop.items():
            day_owner[i] = h
            day_slots[i] = slots

    for i, h in day_owner.items():
        day = days[i]
        day_num = int(day.get("day_index") or (i + 1))
        seq = int(h.get("sequence") or 1)
        slots = day_slots.get(i) or set()
        node_ids = _place_day_hotels(
            day, h, day_num=day_num, sequence=seq, slots=slots
        )
        for nid in node_ids:
            bindings.append(
                {
                    "hotel_id": h.get("id"),
                    "hotel_name": (h.get("name") or "").strip(),
                    "node_id": nid,
                    "day_index": day_num,
                }
            )

    _rebuild_cross_day_edges(out)

    meta = out.setdefault("meta", {})
    warnings = list(meta.get("warnings") or [])
    names = "、".join((h.get("name") or "").strip() for h in hotels[:3])
    note = f"已按用户确认酒店锚定日闭环：{names}"
    if note not in warnings:
        warnings.append(note)
    for w in _meal_coverage_warnings(days):
        if w not in warnings:
            warnings.append(w)
    meta["warnings"] = warnings
    meta["hotel_bindings"] = bindings
    return out


def pinned_ids_from_itinerary(itinerary: dict[str, Any]) -> set[str]:
    """Recover flight-pinned node ids from meta.flight_bindings (post-geocode re-align)."""
    pinned: set[str] = set()
    meta = itinerary.get("meta") or {}
    for b in meta.get("flight_bindings") or []:
        if not isinstance(b, dict):
            continue
        nid = str(b.get("node_id") or "").strip()
        if nid:
            pinned.add(nid)
    return pinned


def realign_schedules_after_commute(
    itinerary: dict[str, Any],
    *,
    note: bool = True,
) -> dict[str, Any]:
    """Re-cascade same-day clocks using current edge duration_minutes (TRN-02b).

    Call after commute enrich / manual edge duration updates so verified gaps
    actually shift POI start/end (flight/hotel anchors stay pinned).
    """
    pinned = pinned_ids_from_itinerary(itinerary)
    out = align_day_schedules(itinerary, None, pinned_ids=pinned)
    if note:
        meta = out.setdefault("meta", {})
        warnings = list(meta.get("warnings") or [])
        msg = "已按通勤边时长重排当日节点时刻"
        if msg not in warnings:
            warnings.append(msg)
        meta["warnings"] = warnings
    return out


def enforce_travel_intel_anchors(
    itinerary: dict[str, Any],
    travel_intel: dict[str, Any] | None,
) -> dict[str, Any]:
    """Public entry: hotels → flights → category duration clamp → same-day cascade."""
    out = enforce_confirmed_hotels(itinerary, travel_intel)
    out, pinned = enforce_confirmed_flights(out, travel_intel)
    if out is itinerary:
        out = deepcopy(itinerary)
    out = apply_category_duration_clamp(out, pinned_ids=pinned)
    return align_day_schedules(out, travel_intel, pinned_ids=pinned)
