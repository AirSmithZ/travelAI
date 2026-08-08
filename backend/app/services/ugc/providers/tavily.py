"""Optional Tavily Search → EvidenceItem (WS-01 / WS-09 bench). Not required for TikHub path."""

from __future__ import annotations

import logging
import time
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

from app.config import Settings, get_settings
from app.services.api_usage import record_usage
from app.services.ugc.tikhub import EvidenceItem

logger = logging.getLogger(__name__)

TAVILY_SEARCH_URL = "https://api.tavily.com/search"

# Soft authority list for fact bucket (doc 21 F1)
DEFAULT_AUTHORITY_DOMAINS = [
    "japan.travel",
    "jnto.go.jp",
    "visitsingapore.com",
    "tourismthailand.org",
    "gov.sg",
    "moe.gov.sg",
    "stb.gov.sg",
    "wikipedia.org",
]


def search_tavily(
    query: str,
    *,
    settings: Settings | None = None,
    include_domains: list[str] | None = None,
    source: Literal["tavily", "tavily_authority"] = "tavily",
    max_results: int | None = None,
) -> list[EvidenceItem]:
    cfg = settings or get_settings()
    key = (cfg.tavily_api_key or "").strip()
    if not key or not query.strip():
        return []

    limit = max_results if max_results is not None else cfg.tavily_max_results
    body: dict[str, Any] = {
        "api_key": key,
        "query": query.strip(),
        "search_depth": cfg.tavily_search_depth or "basic",
        "max_results": max(1, min(limit, 10)),
        "include_answer": False,
    }
    if include_domains:
        body["include_domains"] = include_domains

    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(TAVILY_SEARCH_URL, json=body)
            resp.raise_for_status()
            data = resp.json()
        ms = int((time.perf_counter() - t0) * 1000)
    except Exception as e:
        record_usage(
            "tavily",
            source,
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=str(e)[:200],
        )
        logger.warning("tavily search failed: %s", e)
        return []

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        record_usage("tavily", source, ok=False, latency_ms=ms, error="no_results")
        return []
    record_usage("tavily", source, ok=True, latency_ms=ms)

    out: list[EvidenceItem] = []
    for row in results:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        title = str(row.get("title") or "").strip() or url
        snippet = str(row.get("content") or row.get("snippet") or "").strip()
        if not url:
            continue
        out.append(
            EvidenceItem(
                title=title[:200],
                url=url,
                snippet=snippet[:400],
                likes=None,
                source=source,
                query=query.strip(),
                note_id=None,
            )
        )
        if len(out) >= limit:
            break
    return out


def search_tavily_authority(
    destination: str,
    *,
    settings: Settings | None = None,
    max_results: int = 5,
) -> list[EvidenceItem]:
    dest = (destination or "").strip()
    if not dest:
        return []
    q = f"{dest} official tourism travel tips"
    return search_tavily(
        q,
        settings=settings,
        include_domains=DEFAULT_AUTHORITY_DOMAINS,
        source="tavily_authority",
        max_results=max_results,
    )


def domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""
