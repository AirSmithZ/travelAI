from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

RankPreference = Literal["cheap", "fast", "balanced"]


@dataclass
class SearchRequest:
    origin: str
    destination: str
    date: str
    return_date: str | None = None
    adults: int = 1
    cabin: str = "economy"
    currency: str = "CNY"
    preference: RankPreference = "balanced"
    letsfg_timeout_sec: int = 300
    include_letsfg: bool = False
    include_duffel: bool = False


@dataclass
class FlightOffer:
    id: str
    origin_iata: str
    dest_iata: str
    airline: str
    route_label: str
    depart_time: str
    arrive_time: str
    duration_minutes: int
    stops: int
    price_amount: float
    price_currency: str
    source: str
    confidence: Literal["high", "medium", "low"]
    score: float | None = None
    rank: int | None = None
    rank_reason: str | None = None
    booking_deep_link: str | None = None
    fetched_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SearchResult:
    request: SearchRequest
    fetched_at: str
    deeplink: str
    offers: list[FlightOffer] = field(default_factory=list)
    ranked: list[FlightOffer] = field(default_factory=list)
    sources_used: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    latency_ms: dict[str, int] = field(default_factory=dict)
    errors: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "request": asdict(self.request),
            "fetched_at": self.fetched_at,
            "deeplink": self.deeplink,
            "sources_used": self.sources_used,
            "warnings": self.warnings,
            "latency_ms": self.latency_ms,
            "errors": self.errors,
            "offer_count": len(self.offers),
            "ranked": [o.to_dict() for o in self.ranked],
            "offers": [o.to_dict() for o in self.offers],
        }
