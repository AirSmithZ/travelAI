from typing import Any

from pydantic import BaseModel, Field

from app.schemas.chat import TripRequestIn
from app.schemas.travel_intel import TravelIntelIn


class GenerateItineraryRequest(BaseModel):
    trip_request: TripRequestIn
    geocode: bool = False
    travel_intel: TravelIntelIn | None = None


class GenerateItineraryResponse(BaseModel):
    itinerary: dict[str, Any]
    llm_latency_ms: int | None = None
    geocode_latency_ms: int | None = None


class GeocodeItineraryRequest(BaseModel):
    itinerary: dict[str, Any]
    destination: str = Field(..., min_length=1)


class GeocodeItineraryResponse(BaseModel):
    itinerary: dict[str, Any]
    geocode_latency_ms: int | None = None
