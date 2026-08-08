"""TikHub Xiaohongshu App V2 client → EvidenceItem / EvidencePack (WS-07)."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx
from pydantic import BaseModel

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

SEARCH_NOTES_PATH = "/api/v1/xiaohongshu/app_v2/search_notes"
XHS_NOTE_URL = "https://www.xiaohongshu.com/explore/{note_id}"
SOURCE_TIKHUB_XHS = "tikhub_xhs"

_HIGHLIGHT_RE = re.compile(r"</?em>", re.IGNORECASE)
_WAN_RE = re.compile(r"^([\d.]+)\s*万$")


class EvidenceItem(BaseModel):
    title: str
    url: str
    snippet: str = ""
    likes: int | None = None
    source: str = SOURCE_TIKHUB_XHS
    query: str | None = None
    note_id: str | None = None


def parse_likes(value: Any) -> int | None:
    """Parse liked_count which may be int, digit string, or Chinese '1.2万'."""
    if value is None or value is False:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        return int(value) if value >= 0 else None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    if text.isdigit():
        return int(text)
    m = _WAN_RE.match(text)
    if m:
        try:
            return int(float(m.group(1)) * 10_000)
        except ValueError:
            return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _strip_highlight(text: str) -> str:
    return _HIGHLIGHT_RE.sub("", text or "").strip()


def _dig_items(payload: Any) -> list[Any]:
    """Extract note items from TikHub envelopes (flat or nested data)."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []

    for key in ("items", "notes", "note_list"):
        val = payload.get(key)
        if isinstance(val, list):
            return val

    nested = payload.get("data")
    if isinstance(nested, dict):
        return _dig_items(nested)
    if isinstance(nested, list):
        return nested
    return []


def normalize_note_item(raw: dict[str, Any], *, query: str | None = None) -> EvidenceItem | None:
    """Normalize one search hit (item or bare note) to EvidenceItem."""
    if not isinstance(raw, dict):
        return None

    note = raw.get("note") if isinstance(raw.get("note"), dict) else raw
    if not isinstance(note, dict):
        return None

    note_id = (
        note.get("note_id")
        or note.get("id")
        or raw.get("note_id")
        or raw.get("id")
    )
    note_id = str(note_id).strip() if note_id else ""

    title = _strip_highlight(
        str(note.get("display_title") or note.get("title") or note.get("desc") or "")
    )
    snippet = _strip_highlight(str(note.get("desc") or note.get("content") or ""))
    if not title and snippet:
        title = snippet[:80]
    if not title and not note_id:
        return None
    if not title:
        title = f"小红书笔记 {note_id[:8]}"

    url = str(note.get("share_url") or note.get("url") or "").strip()
    if not url and note_id:
        url = XHS_NOTE_URL.format(note_id=note_id)
    if not url:
        return None

    interact = note.get("interact_info") if isinstance(note.get("interact_info"), dict) else {}
    likes = parse_likes(
        interact.get("liked_count")
        if interact
        else note.get("liked_count") or note.get("likes")
    )

    return EvidenceItem(
        title=title,
        url=url,
        snippet=snippet[:400],
        likes=likes,
        source=SOURCE_TIKHUB_XHS,
        query=query,
        note_id=note_id or None,
    )


def normalize_search_response(
    payload: dict[str, Any] | list[Any],
    *,
    query: str | None = None,
    max_results: int | None = None,
) -> list[EvidenceItem]:
    root = payload
    if isinstance(payload, dict) and "data" in payload:
        root = payload.get("data")
    items = _dig_items(root)
    out: list[EvidenceItem] = []
    seen: set[str] = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        item = normalize_note_item(raw, query=query)
        if item is None:
            continue
        key = item.note_id or item.url
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if max_results is not None and len(out) >= max_results:
            break
    return out


class TikHubClient:
    """Bearer-auth client for TikHub Xiaohongshu App V2."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    @property
    def configured(self) -> bool:
        return self.settings.tikhub_configured

    def _headers(self) -> dict[str, str]:
        key = (self.settings.tikhub_api_key or "").strip()
        return {
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        }

    def _base(self) -> str:
        return (self.settings.tikhub_api_base or "https://api.tikhub.io").rstrip("/")

    def search_notes(
        self,
        keyword: str,
        *,
        sort_type: str = "popularity_descending",
        page: int = 1,
        note_type: str = "不限",
        time_filter: str = "不限",
        search_id: str | None = None,
        search_session_id: str | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """GET search_notes; returns raw JSON (empty dict on soft failure)."""
        kw = (keyword or "").strip()
        if not kw:
            return {}
        if not self.configured:
            logger.debug("TikHub not configured; skip search_notes")
            return {}

        params: dict[str, Any] = {
            "keyword": kw,
            "page": max(1, int(page)),
            "sort_type": sort_type or "popularity_descending",
            "note_type": note_type,
            "time_filter": time_filter,
        }
        if search_id:
            params["search_id"] = search_id
        if search_session_id:
            params["search_session_id"] = search_session_id

        url = f"{self._base()}{SEARCH_NOTES_PATH}"
        to = timeout if timeout is not None else float(self.settings.tikhub_timeout_sec)
        import time

        from app.services.api_usage import record_usage

        t0 = time.perf_counter()
        try:
            with httpx.Client(timeout=to) as client:
                resp = client.get(url, headers=self._headers(), params=params)
                resp.raise_for_status()
                data = resp.json()
                ms = int((time.perf_counter() - t0) * 1000)
                ok_payload = data if isinstance(data, dict) else {}
                record_usage("tikhub", "search_notes", ok=bool(ok_payload), latency_ms=ms)
                return ok_payload
        except httpx.TimeoutException:
            record_usage(
                "tikhub",
                "search_notes",
                ok=False,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error="timeout",
            )
            logger.warning("TikHub search_notes timeout keyword=%r", kw)
        except httpx.HTTPStatusError as e:
            record_usage(
                "tikhub",
                "search_notes",
                ok=False,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=f"http_{e.response.status_code}",
            )
            logger.warning(
                "TikHub search_notes HTTP %s keyword=%r",
                e.response.status_code,
                kw,
            )
        except Exception as e:
            record_usage(
                "tikhub",
                "search_notes",
                ok=False,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=str(e)[:200],
            )
            logger.warning("TikHub search_notes failed: %s", e)
        return {}

    def search_notes_as_evidence(
        self,
        keyword: str,
        *,
        sort_type: str = "popularity_descending",
        page: int = 1,
        max_results: int | None = None,
        **kwargs: Any,
    ) -> list[EvidenceItem]:
        raw = self.search_notes(keyword, sort_type=sort_type, page=page, **kwargs)
        if not raw:
            return []
        limit = max_results if max_results is not None else self.settings.tikhub_max_results
        return normalize_search_response(raw, query=keyword, max_results=limit)


def evidence_queries(
    destination: str,
    day_count: int | None,
    *,
    stay_zone_label: str | None = None,
    preference_tags: list[str] | None = None,
) -> list[str]:
    """WS-09 / doc 21 §4.2: slotted queries, capped to ≤4 searches."""
    dest = (destination or "").strip()
    if not dest:
        return []
    n = day_count if day_count and day_count > 0 else 3
    queries: list[str] = [
        f"{dest} 自由行 {n}天 行程",
        f"{dest} 避坑",
    ]
    zone = (stay_zone_label or "").strip()
    if zone:
        queries.append(f"{zone} 一日游")
    else:
        queries.append(f"{dest} {n}-day itinerary")

    tags = [t.strip() for t in (preference_tags or []) if t and str(t).strip()]
    if tags:
        queries.append(f"{dest} {tags[0]}")

    # Dedupe preserve order, max 4
    seen: set[str] = set()
    out: list[str] = []
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        out.append(q)
        if len(out) >= 4:
            break
    return out


def build_evidence_pack(
    destination: str,
    day_count: int | None = None,
    *,
    settings: Settings | None = None,
    client: TikHubClient | None = None,
    max_results: int | None = None,
    stay_zone_label: str | None = None,
    preference_tags: list[str] | None = None,
) -> list[EvidenceItem]:
    """
    Run slotted TikHub queries and merge/dedupe into an EvidencePack list.
    Graceful no-op when TikHub is not configured or requests fail.
    """
    cfg = settings or get_settings()
    if not cfg.tikhub_configured:
        return []

    dest = (destination or "").strip()
    if not dest:
        return []

    hub = client or TikHubClient(cfg)
    limit = max_results if max_results is not None else cfg.tikhub_max_results
    queries = evidence_queries(
        dest,
        day_count,
        stay_zone_label=stay_zone_label,
        preference_tags=preference_tags,
    )
    per_query = max(2, (limit + len(queries) - 1) // max(1, len(queries)))

    merged: list[EvidenceItem] = []
    seen: set[str] = set()
    for q in queries:
        for item in hub.search_notes_as_evidence(q, max_results=per_query):
            key = item.note_id or item.url
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                break
        if len(merged) >= limit:
            break

    from app.services.ugc.filter_evidence import filter_evidence_items

    return filter_evidence_items(merged, destination=dest, max_items=limit)


def evidence_items_as_dicts(items: list[EvidenceItem]) -> list[dict[str, Any]]:
    return [i.model_dump(exclude_none=True) for i in items]
