"""UGC / EvidencePack endpoints (WS-07 · doc 23 paste-link)."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.ugc.evidence_pack import fetch_evidence_pack
from app.services.ugc.link_providers import fetch_evidence_from_link
from app.services.ugc.tikhub import evidence_items_as_dicts

router = APIRouter(prefix="/ugc", tags=["ugc"])


class EvidencePreviewRequest(BaseModel):
    destination: str = Field(..., min_length=1)
    day_count: int | None = Field(default=None, ge=1, le=30)


class EvidencePreviewResponse(BaseModel):
    destination: str
    day_count: int | None = None
    configured: bool
    tikhub_configured: bool = False
    tavily_configured: bool = False
    evidence_status: str = "empty"
    evidence: list[dict[str, Any]]
    count: int


class EvidenceFromLinkRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2000)
    destination: str | None = Field(default=None, max_length=120)


class EvidenceFromLinkResponse(BaseModel):
    ok: bool
    item: dict[str, Any] | None = None
    error: str | None = None
    provider: str | None = None


@router.post("/evidence/preview", response_model=EvidencePreviewResponse)
async def evidence_preview(body: EvidencePreviewRequest) -> EvidencePreviewResponse:
    """Debug: run TikHub EvidencePack queries without calling the LLM."""
    settings = get_settings()
    dest = body.destination.strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination 不能为空")

    evidence = await fetch_evidence_pack(dest, body.day_count, settings=settings)
    configured = settings.tikhub_configured or settings.web_search_configured
    if evidence:
        status = "ok"
    elif not configured:
        status = "unconfigured"
    else:
        status = "empty"
    return EvidencePreviewResponse(
        destination=dest,
        day_count=body.day_count,
        configured=configured,
        tikhub_configured=settings.tikhub_configured,
        tavily_configured=settings.web_search_configured,
        evidence_status=status,
        evidence=evidence,
        count=len(evidence),
    )


@router.post("/evidence/from-link", response_model=EvidenceFromLinkResponse)
async def evidence_from_link(body: EvidenceFromLinkRequest) -> EvidenceFromLinkResponse:
    """Fetch core note content for one pasted URL (per-module 检索)."""
    settings = get_settings()
    dest = (body.destination or "").strip() or None
    item, err, provider = await asyncio.to_thread(
        fetch_evidence_from_link,
        body.url,
        settings=settings,
        destination=dest,
    )
    if item is None:
        return EvidenceFromLinkResponse(ok=False, item=None, error=err, provider=provider)

    # Optional light POI enrich when destination known (soft-fail)
    payload = evidence_items_as_dicts([item])[0]
    if dest:
        try:
            from app.services.ugc.poi_extract import enrich_evidence_pois

            enriched, _pois = await asyncio.to_thread(
                enrich_evidence_pois,
                [payload],
                dest,
                settings=settings,
            )
            if enriched:
                payload = enriched[0]
        except Exception:
            pass

    return EvidenceFromLinkResponse(ok=True, item=payload, error=None, provider=provider)
