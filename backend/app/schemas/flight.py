from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

RankPreference = Literal["cheap", "fast", "balanced"]
CabinClass = Literal["economy", "premium_economy", "business", "first"]


class FlightSearchRequest(BaseModel):
    origin: str = Field(..., min_length=1, max_length=32, description="IATA / 中文 / Trip.com 城市码")
    destination: str = Field(..., min_length=1, max_length=32)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    return_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    adults: int = Field(default=1, ge=1, le=9)
    cabin: CabinClass = "economy"
    preference: RankPreference = "balanced"
    include_letsfg: bool = False
    include_ignav: bool = True

    @field_validator("date", "return_date")
    @classmethod
    def validate_real_date(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from datetime import date

        date.fromisoformat(v)
        return v


class PurchaseChannel(BaseModel):
    name: Literal["Trip.com"] = "Trip.com"
    url: str
    type: Literal["search"] = "search"
    note: str = "航班与价格以 Trip.com 预订页为准"


class FlightLegSnapshot(BaseModel):
    """单趟行程（含转机 segment 聚合后的门到门信息）。"""

    origin_iata: str
    dest_iata: str
    airline: str
    route_label: str
    depart_time: str
    arrive_time: str
    duration_minutes: int
    stops: int
    flight_numbers: list[str] = Field(default_factory=list)


class FlightQuote(BaseModel):
    """Ignav / LetsFG 等参考价源。flat 字段为去程/单程；往返时另含 return_leg。"""

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
    confidence: Literal["high", "medium", "low"] = "medium"
    purchase_url: str | None = None
    bookability: Literal["search_link", "verified_offer", "reference_only"] = "search_link"
    rank: int | None = None
    score: float | None = None
    rank_reason: str | None = None
    trip_type: Literal["one_way", "round_trip"] = "one_way"
    return_leg: FlightLegSnapshot | None = None
    flight_numbers: list[str] = Field(default_factory=list)


class FlightSearchResponse(BaseModel):
    request: FlightSearchRequest
    fetched_at: str
    purchase: PurchaseChannel
    offers: list[FlightQuote] = Field(default_factory=list)
    ranked: list[FlightQuote] = Field(default_factory=list)
    sources_used: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: dict[str, str] = Field(default_factory=dict)
    latency_ms: dict[str, int] = Field(default_factory=dict)


class FlightIntentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class FlightVerifyFromTextRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    chat_history: list[FlightIntentMessage] = Field(default_factory=list, max_length=20)


class FlightIntentParsed(BaseModel):
    origin: str | None = None
    destination: str | None = None
    date: str | None = None
    return_date: str | None = None
    adults: int = Field(default=1, ge=1, le=9)
    preference: RankPreference = "balanced"
    missing_fields: list[str] = Field(default_factory=list)


class FlightVerifyFromTextResponse(BaseModel):
    reply: str
    parsed: FlightIntentParsed
    search: FlightSearchResponse | None = None
    recommendation: str | None = None
    warnings: list[str] = Field(default_factory=list)
