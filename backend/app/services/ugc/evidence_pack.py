"""EvidencePack fetch helpers — TikHub pattern + optional Tavily fact (WS-09 Phase 1 soft-merge).

WS-CACHE: in-process TTL cache to cut TikHub spend (see docs/llm-travel-data/21 §0.1).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any

from app.config import Settings, get_settings
from app.services.ugc.filter_evidence import filter_evidence_items
from app.services.ugc.tikhub import (
    EvidenceItem,
    build_evidence_pack,
    evidence_items_as_dicts,
)

logger = logging.getLogger(__name__)

# (expires_at_monotonic, items)
_EVIDENCE_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_EVIDENCE_CACHE_MAX = 256


def clear_evidence_cache() -> None:
    """Test / ops helper."""
    _EVIDENCE_CACHE.clear()


def _evidence_cache_key(
    destination: str,
    day_count: int | None,
    stay_zone_label: str | None,
    preference_tags: list[str] | None,
    include_tavily_fact: bool,
) -> str:
    payload = {
        "dest": destination.strip().lower(),
        "days": day_count,
        "zone": (stay_zone_label or "").strip().lower(),
        "tags": sorted(t.strip().lower() for t in (preference_tags or []) if t and t.strip()),
        "tavily": bool(include_tavily_fact),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> list[dict[str, Any]] | None:
    row = _EVIDENCE_CACHE.get(key)
    if not row:
        return None
    expires_at, items = row
    if time.monotonic() >= expires_at:
        _EVIDENCE_CACHE.pop(key, None)
        return None
    # Return a shallow copy so callers can mutate verified flags safely
    return [dict(x) for x in items]


def _cache_set(key: str, items: list[dict[str, Any]], ttl_sec: int) -> None:
    if ttl_sec <= 0:
        return
    if len(_EVIDENCE_CACHE) >= _EVIDENCE_CACHE_MAX:
        # Drop oldest-inserted key (dict preserves insertion order)
        _EVIDENCE_CACHE.pop(next(iter(_EVIDENCE_CACHE)), None)
    _EVIDENCE_CACHE[key] = (time.monotonic() + float(ttl_sec), [dict(x) for x in items])


def fetch_evidence_pack_sync(
    destination: str,
    day_count: int | None = None,
    *,
    settings: Settings | None = None,
    stay_zone_label: str | None = None,
    preference_tags: list[str] | None = None,
    include_tavily_fact: bool = True,
) -> list[dict[str, Any]]:
    """Sync fetch; returns [] when providers unset or soft-fail. Honors TTL cache."""
    cfg = settings or get_settings()
    dest = (destination or "").strip()
    if not dest:
        return []

    cache_key = _evidence_cache_key(
        dest, day_count, stay_zone_label, preference_tags, include_tavily_fact
    )
    ttl = int(cfg.evidence_cache_ttl_sec)
    if ttl > 0:
        cached = _cache_get(cache_key)
        if cached is not None:
            logger.info("evidence pack cache hit dest=%s n=%s", dest, len(cached))
            return cached

    items: list[EvidenceItem] = []
    try:
        if cfg.tikhub_configured:
            items.extend(
                build_evidence_pack(
                    dest,
                    day_count,
                    settings=cfg,
                    stay_zone_label=stay_zone_label,
                    preference_tags=preference_tags,
                )
            )
    except Exception as e:
        logger.warning("tikhub evidence failed: %s", e)

    if include_tavily_fact and cfg.tavily_configured:
        try:
            from app.services.ugc.providers.tavily import search_tavily_authority

            facts = search_tavily_authority(dest, settings=cfg, max_results=3)
            items.extend(facts)
        except Exception as e:
            logger.warning("tavily fact evidence failed: %s", e)

    if not items:
        return []

    # Re-filter merge (pattern+fact); allow authority without dest token match
    filtered = filter_evidence_items(items, destination=dest, max_items=12)
    # Ensure some authority items survive if filter dropped them
    if include_tavily_fact:
        auth = [i for i in items if i.source == "tavily_authority"]
        have = {i.url for i in filtered}
        for a in auth[:3]:
            if a.url not in have:
                filtered.append(a)
                have.add(a.url)
        filtered = filtered[:12]

    out = evidence_items_as_dicts(filtered)
    if ttl > 0 and out:
        _cache_set(cache_key, out, ttl)
    return out


async def fetch_evidence_pack(
    destination: str,
    day_count: int | None = None,
    *,
    settings: Settings | None = None,
    stay_zone_label: str | None = None,
    preference_tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Async wrapper (runs sync httpx client in a worker thread)."""
    cfg = settings or get_settings()
    dest = (destination or "").strip()
    if not dest:
        return []
    if not cfg.tikhub_configured and not cfg.tavily_configured:
        return []
    return await asyncio.to_thread(
        fetch_evidence_pack_sync,
        dest,
        day_count,
        settings=cfg,
        stay_zone_label=stay_zone_label,
        preference_tags=preference_tags,
    )
