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
TAVILY_EXTRACT_URL = "https://api.tavily.com/extract"

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


_MD_LINK_RE = __import__("re").compile(r"\[([^\]]+)\]\([^)]+\)")


def _clean_extract_snippet(title: str, raw: str, *, max_len: int = 1000) -> str:
    """Drop XHS chrome / footer; keep body-ish text for LLM."""
    text = (raw or "").replace("\r", "\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    skip_sub = (
        "行吟信息",
        "© 2014",
        "电话：",
        "地址：",
        "关于我们",
        "[发现]",
        "[RED]",
        "[直播]",
        "[发布]",
        "[通知]",
    )
    useful = [ln for ln in lines if not any(s in ln for s in skip_sub)]
    joined = "\n".join(useful)
    core_title = title.replace(" - 小红书", "").strip()
    if core_title:
        idx = joined.find(core_title)
        if idx >= 0:
            joined = joined[idx:]
    # Strip markdown / hashtag deep links noise
    joined = _MD_LINK_RE.sub(r"\1", joined)
    joined = joined.replace("﻿", "")
    return joined[:max_len].strip()


def extract_tavily_url(
    url: str,
    *,
    settings: Settings | None = None,
    note_id: str | None = None,
    source: str = "user_paste_tavily",
) -> EvidenceItem | None:
    """Tavily Extract → EvidenceItem (fallback when TikHub note-detail is 402/empty)."""
    cfg = settings or get_settings()
    key = (cfg.tavily_api_key or "").strip()
    target = (url or "").strip()
    if not key or not target:
        return None

    t0 = time.perf_counter()
    data: Any = None
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=45.0) as client:
                resp = client.post(
                    TAVILY_EXTRACT_URL,
                    json={"urls": [target]},
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            break
        except Exception as e:
            last_err = e
            if attempt == 0 and "SSL" in str(e):
                logger.warning("tavily extract SSL blip, retrying: %s", e)
                continue
            record_usage(
                "tavily",
                "extract",
                ok=False,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=str(e)[:200],
            )
            logger.warning("tavily extract failed: %s", e)
            return None
    if data is None:
        record_usage(
            "tavily",
            "extract",
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=str(last_err)[:200] if last_err else "empty",
        )
        return None
    ms = int((time.perf_counter() - t0) * 1000)

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list) or not results:
        record_usage("tavily", "extract", ok=False, latency_ms=ms, error="no_results")
        return None

    row = results[0] if isinstance(results[0], dict) else None
    if not row:
        record_usage("tavily", "extract", ok=False, latency_ms=ms, error="bad_row")
        return None

    title = str(row.get("title") or "").strip()
    raw = str(row.get("raw_content") or row.get("content") or "").strip()
    out_url = str(row.get("url") or target).strip()
    if not title and not raw:
        record_usage("tavily", "extract", ok=False, latency_ms=ms, error="empty_content")
        return None

    # Skip soft-404 pages
    if "页面不见了" in title or "页面不见了" in raw[:80]:
        record_usage("tavily", "extract", ok=False, latency_ms=ms, error="page_gone")
        return None

    snippet = _clean_extract_snippet(title or "", raw, max_len=1000)
    if not snippet and raw:
        snippet = raw[:1000]
    if not title:
        title = (snippet[:80] if snippet else out_url) or out_url

    record_usage("tavily", "extract", ok=True, latency_ms=ms)
    return EvidenceItem(
        title=title[:200],
        url=out_url,
        snippet=snippet,
        likes=None,
        source=source,
        query=None,
        note_id=note_id,
    )


def domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""
