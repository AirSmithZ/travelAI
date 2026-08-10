"""Itinerary API schemas（DATA-04：出参校验；extra=allow 防卡死）。"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.chat import TripRequestIn
from app.schemas.travel_intel import TravelIntelIn

GenerateMode = Literal["generate", "optimize", "regenerate"]


class ItineraryMetaOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    generated_at: str = ""
    model: str = "llm"
    locale: str = "zh-CN"
    warnings: list[str] = Field(default_factory=list)
    evidence: Optional[list[dict[str, Any]]] = None
    poi_candidates: Optional[list[dict[str, Any]]] = None
    # ok | empty | unconfigured — empty packs stay discoverable in UI
    evidence_status: Optional[str] = None
    flight_quote_ids: Optional[list[str]] = None
    intel_fingerprint: Optional[str] = None


class ItineraryNodeOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    name_en: Optional[str] = None
    category: str = "attraction"
    lat: float = 0
    lng: float = 0
    is_optional: bool = False


class DayPlanOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    day_index: int
    date: str = ""
    weekday: str = ""
    label: str = ""
    nodes: list[ItineraryNodeOut] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class ItineraryOut(BaseModel):
    """Loose itinerary contract for generate/geocode responses."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    destination: str
    timezone: str = "UTC"
    days: list[DayPlanOut] = Field(default_factory=list)
    cross_day_edges: Optional[list[dict[str, Any]]] = None
    meta: ItineraryMetaOut = Field(default_factory=ItineraryMetaOut)


def validate_itinerary_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Validate structure; return dumped dict (extras preserved via extra=allow)."""
    return ItineraryOut.model_validate(data).model_dump(mode="python")


class GenerateItineraryRequest(BaseModel):
    trip_request: TripRequestIn
    geocode: bool = False
    travel_intel: TravelIntelIn | None = None
    mode: GenerateMode = "generate"
    current_itinerary: dict[str, Any] | None = None
    user_evidence: list[dict[str, Any]] | None = Field(
        default=None,
        description="User-pasted links already fetched (doc 23); only ok modules",
    )


class GenerateItineraryResponse(BaseModel):
    itinerary: dict[str, Any]
    llm_latency_ms: int | None = None
    geocode_latency_ms: int | None = None


class GeocodeItineraryRequest(BaseModel):
    itinerary: dict[str, Any]
    destination: str = Field(..., min_length=1)
    free_text: str = Field(
        default="",
        description="User prompt for TRN-02 ferry/trail hint matching during auto-enrich",
    )
    notes: str = ""


class GeocodeItineraryResponse(BaseModel):
    itinerary: dict[str, Any]
    geocode_latency_ms: int | None = None
