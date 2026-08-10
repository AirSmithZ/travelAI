"""Commute lookup API (TRN-01)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.commute import CommuteLookupRequest, CommuteLookupResponse
from app.services.commute import lookup_commute

router = APIRouter(prefix="/commute", tags=["commute"])


@router.post("/lookup", response_model=CommuteLookupResponse)
def commute_lookup(body: CommuteLookupRequest) -> CommuteLookupResponse:
    """Look up commute options between two geocoded nodes.

    Combines SerpApi Directions with user-prompt route hints (ferry/trail/etc.).
    """
    try:
        return lookup_commute(body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"通勤查询失败: {e}") from e
