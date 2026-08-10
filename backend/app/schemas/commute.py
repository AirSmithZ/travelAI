"""Commute lookup request/response (TRN-01)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TransportMode = Literal["walk", "subway", "bus", "taxi", "flight", "ferry"]
RouteSource = Literal["directions", "user_hint", "estimate"]


class CommutePoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    name: str = ""


class CommuteLookupRequest(BaseModel):
    from_point: CommutePoint
    to_point: CommutePoint
    """User original prompt / notes — used for ferry/trail/cable-car hints."""
    free_text: str = ""
    notes: str = ""
    """When false, only hints + estimate (no SerpApi)."""
    use_directions: bool = True


class CommuteCandidate(BaseModel):
    transport_mode: TransportMode
    duration_minutes: int = Field(..., ge=0)
    distance_meters: int | None = None
    label: str = ""
    summary: str = ""
    source: RouteSource
    recommended: bool = False
    fare_estimate: float | None = None
    currency: str | None = None


class CommuteLookupResponse(BaseModel):
    candidates: list[CommuteCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    provider: str | None = None
    straight_line_meters: int | None = None
