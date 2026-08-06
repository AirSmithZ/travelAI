"""EvidencePack fetch helpers for itinerary generate (WS-04 minimal / WS-07)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import Settings, get_settings
from app.services.ugc.tikhub import (
    EvidenceItem,
    build_evidence_pack,
    evidence_items_as_dicts,
)

logger = logging.getLogger(__name__)


def fetch_evidence_pack_sync(
    destination: str,
    day_count: int | None = None,
    *,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """Sync fetch; returns [] when TikHub unset or soft-fails."""
    cfg = settings or get_settings()
    try:
        items: list[EvidenceItem] = build_evidence_pack(
            destination,
            day_count,
            settings=cfg,
        )
        return evidence_items_as_dicts(items)
    except Exception as e:
        logger.warning("fetch_evidence_pack_sync failed: %s", e)
        return []


async def fetch_evidence_pack(
    destination: str,
    day_count: int | None = None,
    *,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """Async wrapper (runs sync httpx client in a worker thread)."""
    cfg = settings or get_settings()
    if not cfg.tikhub_configured:
        return []
    dest = (destination or "").strip()
    if not dest:
        return []
    return await asyncio.to_thread(
        fetch_evidence_pack_sync,
        dest,
        day_count,
        settings=cfg,
    )
