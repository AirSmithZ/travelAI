"""UGC / EvidencePack debug endpoints (WS-07)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.ugc.evidence_pack import fetch_evidence_pack

router = APIRouter(prefix="/ugc", tags=["ugc"])


class EvidencePreviewRequest(BaseModel):
    destination: str = Field(..., min_length=1)
    day_count: int | None = Field(default=None, ge=1, le=30)


class EvidencePreviewResponse(BaseModel):
    destination: str
    day_count: int | None = None
    configured: bool
    evidence: list[dict[str, Any]]
    count: int


@router.post("/evidence/preview", response_model=EvidencePreviewResponse)
async def evidence_preview(body: EvidencePreviewRequest) -> EvidencePreviewResponse:
    """Debug: run TikHub EvidencePack queries without calling the LLM."""
    settings = get_settings()
    dest = body.destination.strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination 不能为空")

    evidence = await fetch_evidence_pack(dest, body.day_count, settings=settings)
    return EvidencePreviewResponse(
        destination=dest,
        day_count=body.day_count,
        configured=settings.tikhub_configured,
        evidence=evidence,
        count=len(evidence),
    )
