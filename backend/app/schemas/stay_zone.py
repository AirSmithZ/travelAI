from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.chat import TripRequestIn


class StayZonePreferencesIn(BaseModel):
    transit: float = 1.0
    minimize_hotel_moves: bool = True
    quiet: Optional[float] = None
    family_friendly: Optional[float] = None
    budget: Optional[float] = None
    walk_tolerance: Optional[Literal["low", "medium", "high"]] = "medium"
    safety_sensitive: bool = False
    scenery: Optional[float] = None


class StayZoneCircleGeometry(BaseModel):
    type: Literal["circle"] = "circle"
    center: dict[str, float]
    radius_m: float = 800.0


class StayZonePolygonGeometry(BaseModel):
    type: Literal["polygon"] = "polygon"
    coordinates: list[list[float]]


class ThemeTagOut(BaseModel):
    id: str
    label: str
    polarity: Literal["positive", "negative"] = "positive"
    confidence: Optional[float] = None
    evidence: Optional[str] = None
    entity: Optional[str] = None


class ThemeRefOut(BaseModel):
    id: str
    label: str


class RecommendedStayZoneOut(BaseModel):
    id: str
    sequence: int
    city: str
    label: str
    check_in: str
    check_out: str
    rationale: str
    transit_note: Optional[str] = None
    strategy: Optional[Literal["compromise", "split", "main_cluster"]] = "compromise"
    anchor_hints: list[str] = Field(default_factory=list)
    covers_day_indices: list[int] = Field(default_factory=list)
    status: Literal["proposed", "confirmed", "rejected"] = "proposed"
    geometry: Optional[StayZoneCircleGeometry | StayZonePolygonGeometry] = None
    purchase_url: Optional[str] = None
    # HOT-ZONE-TAG：机酒状态（次要）
    fit_tag: Literal[
        "current_anchor", "preference_fit", "compromise", "needs_city_change"
    ] = "current_anchor"
    bookable: bool = True
    tag_note: Optional[str] = None
    # HOT-THEME-TAG：提示词主题命中 / 未覆盖（主展示）
    matched_themes: list[ThemeRefOut] = Field(default_factory=list)
    uncovered_themes: list[ThemeRefOut] = Field(default_factory=list)


class StayZoneRecommendRequest(BaseModel):
    trip_request: TripRequestIn
    flights: list[dict] = Field(default_factory=list)
    itinerary: Optional[dict] = None
    preferences: Optional[StayZonePreferencesIn] = None


class StayZoneRecommendResponse(BaseModel):
    zones: list[RecommendedStayZoneOut]
    fetched_at: str
    source: Literal["llm", "heuristic"] = "heuristic"
    warnings: list[str] = Field(default_factory=list)
    # 运行时主题（不写回 preference_tags）
    prompt_themes: list[ThemeTagOut] = Field(default_factory=list)


class StayZoneLodgingRequest(BaseModel):
    zone_id: str
    city: str
    label: str = ""
    lat: float
    lng: float
    radius_m: float = Field(default=1200, ge=200, le=5000)
    limit: int = Field(default=8, ge=1, le=20)
    # HOT-TRIP: Trip 深链日期 / 人数 / 预算
    check_in: str = ""
    check_out: str = ""
    adults: int = Field(default=2, ge=1, le=9)
    max_price: Optional[float] = Field(default=None, ge=0)


class StayZoneLodgingCandidate(BaseModel):
    name: str
    lat: float
    lng: float
    address: Optional[str] = None
    place_id: Optional[str] = None
    rating: Optional[float] = None
    distance_m: int = 0
    coord_source: str = "serpapi_lodging"
    # HOT-RG-02: RollingGo 参考价 / 渠道链（非 Trip）
    ref_price: Optional[float] = None
    currency: Optional[str] = None
    booking_url: Optional[str] = None


class StayZoneLodgingResponse(BaseModel):
    zone_id: str
    candidates: list[StayZoneLodgingCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    status: Literal[
        "ok", "empty", "rate_limited", "provider_error", "unconfigured", "trip_first"
    ] = "ok"
    query: str = ""
    # HOT-TRIP-01: always prefer deep link when structured search unavailable
    trip_url: str = ""
    mode: Literal["rollinggo", "serp", "trip_first"] = "trip_first"
