from __future__ import annotations

from flight_spike.models import FlightOffer, RankPreference

# Preference weights: price vs duration vs stops penalty
_WEIGHTS: dict[RankPreference, tuple[float, float, float]] = {
    "cheap": (0.75, 0.15, 0.10),
    "fast": (0.15, 0.75, 0.10),
    "balanced": (0.45, 0.45, 0.10),
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


def rank_offers(
    offers: list[FlightOffer],
    preference: RankPreference = "balanced",
    *,
    top_n: int = 5,
) -> list[FlightOffer]:
    if not offers:
        return []

    prices = [o.price_amount for o in offers if o.price_amount > 0]
    durations = [float(o.duration_minutes) for o in offers if o.duration_minutes > 0]
    p_lo, p_hi = _min_max(prices)
    d_lo, d_hi = _min_max(durations)
    w_price, w_duration, w_stops = _WEIGHTS[preference]

    scored: list[tuple[float, FlightOffer, str]] = []
    for o in offers:
        price_n = _norm(o.price_amount, p_lo, p_hi) if o.price_amount > 0 else 1.0
        dur_n = _norm(float(o.duration_minutes), d_lo, d_hi) if o.duration_minutes > 0 else 1.0
        stops_n = min(o.stops / 2.0, 1.0)
        # lower is better
        score = w_price * price_n + w_duration * dur_n + w_stops * stops_n
        reason_parts = []
        if preference == "cheap" or (preference == "balanced" and price_n <= 0.3):
            reason_parts.append("价格较低")
        if o.stops == 0:
            reason_parts.append("直飞")
        elif o.stops == 1:
            reason_parts.append("1 次中转")
        if preference == "fast" or (preference == "balanced" and dur_n <= 0.3):
            reason_parts.append("耗时较短")
        if o.price_amount > 0 and price_n <= 0.2 and dur_n > 0.6:
            reason_parts.append("便宜但耗时长")
        reason = "、".join(reason_parts) or "综合得分较优"
        scored.append((score, o, reason))

    scored.sort(key=lambda x: x[0])
    ranked: list[FlightOffer] = []
    for i, (score, o, reason) in enumerate(scored[:top_n], start=1):
        o.score = round(1.0 - score, 4)  # higher = better for display
        o.rank = i
        o.rank_reason = reason
        ranked.append(o)
    return ranked
