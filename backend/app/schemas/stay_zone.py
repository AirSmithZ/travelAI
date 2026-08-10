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


class StayZoneLodgingRequest(BaseModel):
    zone_id: str
    city: str
    label: str = ""
    lat: float
    lng: float
    radius_m: float = Field(default=1200, ge=200, le=5000)
    limit: int = Field(default=8, ge=1, le=20)


class StayZoneLodgingCandidate(BaseModel):
    name: str
    lat: float
    lng: float
    address: Optional[str] = None
    place_id: Optional[str] = None
    rating: Optional[float] = None
    distance_m: int = 0
    coord_source: str = "serpapi_lodging"


class StayZoneLodgingResponse(BaseModel):
    zone_id: str
    candidates: list[StayZoneLodgingCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    status: Literal["ok", "empty", "rate_limited", "provider_error", "unconfigured"] = "ok"
    query: str = ""
