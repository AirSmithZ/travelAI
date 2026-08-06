from __future__ import annotations

from app.schemas.flight import FlightQuote, RankPreference

# price : duration : stops : arrival
_WEIGHTS: dict[RankPreference, tuple[float, float, float, float]] = {
    "cheap": (0.70, 0.10, 0.10, 0.10),
    "fast": (0.10, 0.70, 0.10, 0.10),
    # 性价比默认：价:时:中转:到达 = 5:2:2:1
    "balanced": (0.50, 0.20, 0.20, 0.10),
}


def _min_max(values: list[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 1.0
    lo, hi = min(values), max(values)
    if hi <= lo:
        return lo, lo + 1.0
    return lo, hi


def _norm(value: float, lo: float, hi: float) -> float:
    return (value - lo) / (hi - lo)


def _effective_duration(offer: FlightQuote) -> int:
    total = offer.duration_minutes or 0
    if offer.return_leg:
        total += offer.return_leg.duration_minutes or 0
    return total


def _effective_stops(offer: FlightQuote) -> int:
    stops = offer.stops or 0
    if offer.return_leg:
        stops += offer.return_leg.stops or 0
    return stops


def _parse_arrive_hour(arrive_time: str | None) -> int | None:
    s = (arrive_time or "").strip()
    if not s:
        return None
    time_part = s.split("T", 1)[1] if "T" in s else s
    # strip timezone suffix like +08:00 / Z
    for sep in ("+", "Z", " "):
        if sep in time_part:
            time_part = time_part.split(sep, 1)[0]
    if ":" not in time_part:
        return None
    try:
        return int(time_part.split(":", 1)[0])
    except ValueError:
        return None


def _arrival_time_fit(arrive_time: str | None) -> float:
    """Arrival fitness cost in [0, 1]; lower is better.

    Hour bands (local arrive hour):
    - 10–20: best (0.0)
    - 6–10 / 20–24: medium (0.5)
    - 0–6: high penalty (1.0)
    """
    hour = _parse_arrive_hour(arrive_time)
    if hour is None:
        return 0.5
    hour = hour % 24
    if 10 <= hour < 20:
        return 0.0
    if 6 <= hour < 10 or 20 <= hour < 24:
        return 0.5
    return 1.0


def _build_rank_reason(
    offer: FlightQuote,
    preference: RankPreference,
    price_n: float,
    dur_n: float,
    arrival_n: float,
) -> str:
    reason_parts: list[str] = []
    if offer.trip_type == "round_trip":
        reason_parts.append("往返组合")
    if preference == "cheap" or (preference == "balanced" and price_n <= 0.3):
        reason_parts.append("总价较低" if offer.trip_type == "round_trip" else "价格较低")
    if offer.stops == 0:
        reason_parts.append("去程直飞")
    elif offer.stops == 1:
        reason_parts.append("去程 1 次中转")
    if offer.return_leg:
        if offer.return_leg.stops == 0:
            reason_parts.append("回程直飞")
        elif offer.return_leg.stops == 1:
            reason_parts.append("回程 1 次中转")
    if preference == "fast" or (preference == "balanced" and dur_n <= 0.3):
        reason_parts.append("总耗时较短")
    if arrival_n <= 0.0:
        reason_parts.append("抵达时段适宜")
    elif arrival_n >= 1.0:
        reason_parts.append("抵达偏深夜/凌晨")
    elif arrival_n >= 0.5:
        reason_parts.append("抵达偏早或偏晚")
    if offer.price_amount > 0 and price_n <= 0.2 and dur_n > 0.6:
        reason_parts.append("便宜但总耗时长")
    return "、".join(reason_parts) or "综合得分较优"


def rank_offers(
    offers: list[FlightQuote],
    preference: RankPreference = "balanced",
    *,
    top_n: int = 5,
) -> list[FlightQuote]:
    if not offers:
        return []

    prices = [o.price_amount for o in offers if o.price_amount > 0]
    durations = [float(_effective_duration(o)) for o in offers if _effective_duration(o) > 0]
    arrivals = [_arrival_time_fit(o.arrive_time) for o in offers]
    p_lo, p_hi = _min_max(prices)
    d_lo, d_hi = _min_max(durations)
    a_lo, a_hi = _min_max(arrivals)
    w_price, w_duration, w_stops, w_arrival = _WEIGHTS[preference]

    scored: list[tuple[float, FlightQuote, str]] = []
    for offer in offers:
        price_n = _norm(offer.price_amount, p_lo, p_hi) if offer.price_amount > 0 else 1.0
        eff_dur = _effective_duration(offer)
        dur_n = _norm(float(eff_dur), d_lo, d_hi) if eff_dur > 0 else 1.0
        stops_n = min(_effective_stops(offer) / 3.0, 1.0)
        arrival_raw = _arrival_time_fit(offer.arrive_time)
        arrival_n = _norm(arrival_raw, a_lo, a_hi)
        score = (
            w_price * price_n
            + w_duration * dur_n
            + w_stops * stops_n
            + w_arrival * arrival_n
        )
        reason = _build_rank_reason(offer, preference, price_n, dur_n, arrival_raw)
        scored.append((score, offer, reason))

    scored.sort(key=lambda x: x[0])
    ranked: list[FlightQuote] = []
    for i, (score, offer, reason) in enumerate(scored[:top_n], start=1):
        ranked.append(
            offer.model_copy(
                update={
                    "score": round(1.0 - score, 4),
                    "rank": i,
                    "rank_reason": reason,
                }
            )
        )
    return ranked
