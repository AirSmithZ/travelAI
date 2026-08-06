"""Lightweight TravelIntel payload for itinerary generate (B-P4)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TravelIntelIn(BaseModel):
    """Loose mirror of frontend TravelIntel; dict lists keep schema light."""

    model_config = ConfigDict(extra="allow")

    status: str | None = None
    flights: list[dict[str, Any]] = Field(default_factory=list)
    hotels: list[dict[str, Any]] = Field(default_factory=list)
    recommended_stay_zones: list[dict[str, Any]] = Field(default_factory=list)
