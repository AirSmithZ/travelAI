"""WS-08b: enrich verified POI candidates with SerpAPI Maps types / rating (soft-fail)."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.services.api_usage import record_usage

logger = logging.getLogger(__name__)

_MAX_ENRICH = 6


def enrich_poi_places(
    candidates: list[dict[str, Any]],
    destination: str,
    *,
    settings: Settings | None = None,
    max_items: int = _MAX_ENRICH,
) -> list[dict[str, Any]]:
    """
    For verified candidates with coords, fetch Google Maps place details via SerpAPI.
    Adds place_types / rating / place_id when available. Never raises.
    """
    cfg = settings or get_settings()
    if not cfg.serpapi_configured:
        return candidates

    key = (cfg.serpapi_api_key or "").strip()
    base = (cfg.serpapi_base_url or "https://serpapi.com").rstrip("/")
    dest = (destination or "").strip()
    n = 0

    for cand in candidates:
        if n >= max_items:
            break
        if not cand.get("verified"):
            continue
        lat, lng = cand.get("lat"), cand.get("lng")
        name = str(cand.get("name") or "").strip()
        if lat is None or lng is None or not name:
            continue
        t0 = time.perf_counter()
        try:
            params = {
                "engine": "google_maps",
                "q": f"{name} {dest}".strip(),
                "type": "search",
                "hl": "zh-cn",
                "ll": f"@{lat},{lng},15z",
                "api_key": key,
            }
            with httpx.Client(timeout=float(cfg.serpapi_timeout_sec or 20)) as client:
                resp = client.get(f"{base}/search.json", params=params)
                resp.raise_for_status()
                data = resp.json()
            ms = int((time.perf_counter() - t0) * 1000)
        except Exception as e:
            record_usage(
                "serpapi",
                "places",
                ok=False,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=str(e)[:200],
            )
            logger.debug("places enrich skip %s: %s", name, e)
            continue

        if not isinstance(data, dict) or data.get("error"):
            record_usage(
                "serpapi",
                "places",
                ok=False,
                latency_ms=ms,
                error=str((data or {}).get("error") if isinstance(data, dict) else "bad")[:200],
            )
            continue
        record_usage("serpapi", "places", ok=True, latency_ms=ms)

        item: dict[str, Any] | None = None
        place = data.get("place_results")
        if isinstance(place, dict):
            item = place
        else:
            local = data.get("local_results")
            if isinstance(local, list) and local and isinstance(local[0], dict):
                item = local[0]
        if not item:
            continue

        types = item.get("type") or item.get("types")
        if isinstance(types, str) and types.strip():
            cand["place_types"] = [types.strip()]
        elif isinstance(types, list):
            cand["place_types"] = [str(t) for t in types if t][:5]

        rating = item.get("rating")
        try:
            if rating is not None:
                cand["rating"] = float(rating)
        except (TypeError, ValueError):
            pass

        pid = item.get("place_id") or item.get("data_id")
        if pid:
            cand["place_id"] = str(pid)

        # Soft open-hours signals (may be stale; never treat as official)
        hours_text = item.get("hours") or item.get("operating_hours")
        if isinstance(hours_text, str) and hours_text.strip():
            cand["hours_text"] = hours_text.strip()[:160]
        elif isinstance(hours_text, list):
            bits = [str(x).strip() for x in hours_text if x][:4]
            if bits:
                cand["hours_text"] = "；".join(bits)[:160]
        elif isinstance(hours_text, dict):
            # e.g. {"wednesday": "9 AM–6 PM", ...}
            bits = [f"{k}:{v}" for k, v in list(hours_text.items())[:3] if v]
            if bits:
                cand["hours_text"] = "；".join(bits)[:160]

        open_state = item.get("open_state") or item.get("hours_status")
        if isinstance(open_state, str) and open_state.strip():
            cand["open_state"] = open_state.strip()[:80]

        n += 1

    return candidates
