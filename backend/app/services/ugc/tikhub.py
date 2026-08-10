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
GET_IMAGE_NOTE_PATH = "/api/v1/xiaohongshu/app_v2/get_image_note_detail"
GET_VIDEO_NOTE_PATH = "/api/v1/xiaohongshu/app_v2/get_video_note_detail"
XHS_NOTE_URL = "https://www.xiaohongshu.com/explore/{note_id}"
SOURCE_TIKHUB_XHS = "tikhub_xhs"
SOURCE_USER_PASTE_XHS = "user_paste_xhs"
DEFAULT_SNIPPET_MAX = 400
# Full note body for UI / paste; LLM inject still caps separately
PASTE_SNIPPET_MAX = 4000


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
    author: str | None = None
    comments_count: int | None = None
    collected_count: int | None = None
    shared_count: int | None = None
    note_type: str | None = None


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


def normalize_note_item(
    raw: dict[str, Any],
    *,
    query: str | None = None,
    source: str = SOURCE_TIKHUB_XHS,
    snippet_max: int = DEFAULT_SNIPPET_MAX,
) -> EvidenceItem | None:
    """Normalize one search hit or note-detail payload to EvidenceItem."""
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
    # Prefer longer body fields; share_info.content is often truncated share copy
    share_info = note.get("share_info") if isinstance(note.get("share_info"), dict) else {}
    snippet = _strip_highlight(
        str(
            note.get("desc")
            or note.get("content")
            or share_info.get("content")
            or note.get("share_text")
            or ""
        )
    )
    if not title and snippet:
        title = snippet[:80]
    if not title and not note_id:
        return None
    if not title:
        title = f"小红书笔记 {note_id[:8]}"

    url = str(note.get("share_url") or note.get("url") or share_info.get("link") or "").strip()
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
    comments = parse_likes(
        interact.get("comment_count")
        if interact
        else note.get("comments_count") or note.get("comment_count")
    )
    collected = parse_likes(
        interact.get("collected_count")
        if interact
        else note.get("collected_count")
    )
    shared = parse_likes(note.get("shared_count") or note.get("share_count"))
    user = note.get("user") if isinstance(note.get("user"), dict) else {}
    author = str(user.get("nickname") or user.get("name") or "").strip() or None
    note_type = str(note.get("type") or note.get("model_type") or "").strip() or None
    cap = max(80, int(snippet_max))

    return EvidenceItem(
        title=title,
        url=url,
        snippet=snippet[:cap],
        likes=likes,
        source=source or SOURCE_TIKHUB_XHS,
        query=query,
        note_id=note_id or None,
        author=author,
        comments_count=comments,
        collected_count=collected,
        shared_count=shared,
        note_type=note_type,
    )


def _first_from_note_list(obj: Any) -> dict[str, Any] | None:
    """App V2 detail: data.data[].note_list[0] or bare note dict."""
    if isinstance(obj, dict):
        if isinstance(obj.get("note_list"), list):
            for n in obj["note_list"]:
                if isinstance(n, dict) and (n.get("id") or n.get("note_id") or n.get("title")):
                    return n
        if obj.get("note_id") or obj.get("id") or obj.get("title") or obj.get("desc"):
            return obj
        if isinstance(obj.get("note"), dict):
            return obj["note"]
        return None
    if isinstance(obj, list):
        for row in obj:
            hit = _first_from_note_list(row)
            if hit is not None:
                return hit
    return None


def _dig_note_detail(payload: Any) -> dict[str, Any] | None:
    """Unwrap TikHub note-detail envelopes to a note dict (incl. App V2 note_list)."""
    if not isinstance(payload, dict):
        return None
    # Prefer nested note_list before treating outer envelope as the note
    data = payload.get("data") if "data" in payload else payload
    hit = _first_from_note_list(data)
    if hit is not None:
        return hit
    if isinstance(data, dict):
        nested = data.get("data")
        hit = _first_from_note_list(nested)
        if hit is not None:
            return hit
        if isinstance(nested, dict):
            return _dig_note_detail({"data": nested})
    return None


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

    def _get_note_detail_raw(
        self,
        path: str,
        *,
        note_id: str | None = None,
        share_text: str | None = None,
        timeout: float | None = None,
        operation: str = "get_note_detail",
    ) -> tuple[dict[str, Any], str | None]:
        """Returns (payload, error_code). error_code e.g. tikhub_402 / timeout."""
        if not self.configured:
            logger.debug("TikHub not configured; skip %s", operation)
            return {}, "unconfigured"
        nid = (note_id or "").strip()
        share = (share_text or "").strip()
        if not nid and not share:
            return {}, "empty_params"

        params: dict[str, Any] = {}
        if nid:
            params["note_id"] = nid
        if share:
            params["share_text"] = share

        url = f"{self._base()}{path}"
        to = timeout if timeout is not None else float(self.settings.tikhub_timeout_sec)
        import time

        from app.services.api_usage import record_usage

        t0 = time.perf_counter()
        last_exc: Exception | None = None
        for attempt in range(2):
            try:
                with httpx.Client(timeout=to) as client:
                    resp = client.get(url, headers=self._headers(), params=params)
                    resp.raise_for_status()
                    data = resp.json()
                    ms = int((time.perf_counter() - t0) * 1000)
                    ok_payload = data if isinstance(data, dict) else {}
                    record_usage("tikhub", operation, ok=bool(ok_payload), latency_ms=ms)
                    return ok_payload, None
            except httpx.TimeoutException:
                record_usage(
                    "tikhub",
                    operation,
                    ok=False,
                    latency_ms=int((time.perf_counter() - t0) * 1000),
                    error="timeout",
                )
                logger.warning("TikHub %s timeout", operation)
                return {}, "timeout"
            except httpx.HTTPStatusError as e:
                code = e.response.status_code
                record_usage(
                    "tikhub",
                    operation,
                    ok=False,
                    latency_ms=int((time.perf_counter() - t0) * 1000),
                    error=f"http_{code}",
                )
                logger.warning("TikHub %s HTTP %s", operation, code)
                if code == 402:
                    return {}, "tikhub_402"
                return {}, f"http_{code}"
            except Exception as e:
                last_exc = e
                # Transient SSL / connection blips — one retry
                if attempt == 0 and "SSL" in str(e):
                    logger.warning("TikHub %s SSL blip, retrying: %s", operation, e)
                    continue
                record_usage(
                    "tikhub",
                    operation,
                    ok=False,
                    latency_ms=int((time.perf_counter() - t0) * 1000),
                    error=str(e)[:200],
                )
                logger.warning("TikHub %s failed: %s", operation, e)
                return {}, "error"
        if last_exc is not None:
            record_usage(
                "tikhub",
                operation,
                ok=False,
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=str(last_exc)[:200],
            )
            logger.warning("TikHub %s failed: %s", operation, last_exc)
        return {}, "error"

    def get_note_by_share_or_id(
        self,
        *,
        note_id: str | None = None,
        share_text: str | None = None,
        timeout: float | None = None,
        source: str = SOURCE_USER_PASTE_XHS,
        snippet_max: int = PASTE_SNIPPET_MAX,
    ) -> tuple[EvidenceItem | None, str | None]:
        """
        Fetch note detail via App V2 image then video endpoints.
        Returns (item, error_code). error_code set when item is None.
        """
        last_err: str | None = None
        for path, op in (
            (GET_IMAGE_NOTE_PATH, "get_image_note_detail"),
            (GET_VIDEO_NOTE_PATH, "get_video_note_detail"),
        ):
            raw, err = self._get_note_detail_raw(
                path,
                note_id=note_id,
                share_text=share_text,
                timeout=timeout,
                operation=op,
            )
            if err:
                last_err = err
            if not raw:
                continue
            note = _dig_note_detail(raw)
            if not note:
                last_err = last_err or "empty"
                continue
            item = normalize_note_item(
                note,
                source=source,
                snippet_max=snippet_max,
            )
            if item is not None:
                return item, None
            last_err = last_err or "empty"
        return None, last_err or "empty"

    def enrich_search_hits_with_detail(
        self,
        items: list[EvidenceItem],
        *,
        max_enrich: int | None = None,
    ) -> list[EvidenceItem]:
        """
        search_notes only returns feed-card snippets. Pull App V2 detail for each
        note_id so title/desc/likes reflect the real post body.
        """
        limit = max_enrich if max_enrich is not None else self.settings.tikhub_max_results
        out: list[EvidenceItem] = []
        for item in items:
            if len(out) >= limit:
                break
            nid = (item.note_id or "").strip()
            if not nid:
                out.append(item)
                continue
            detailed, err = self.get_note_by_share_or_id(
                note_id=nid,
                source=SOURCE_TIKHUB_XHS,
                snippet_max=PASTE_SNIPPET_MAX,
            )
            if detailed is None:
                logger.debug("detail enrich skip note_id=%s err=%s", nid, err)
                out.append(item)
                continue
            out.append(
                detailed.model_copy(
                    update={
                        "query": item.query,
                        "source": SOURCE_TIKHUB_XHS,
                    }
                )
            )
        return out


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

    # search_notes = feed cards only; detail API supplies real title/desc
    merged = hub.enrich_search_hits_with_detail(merged, max_enrich=limit)

    from app.services.ugc.filter_evidence import filter_evidence_items

    return filter_evidence_items(merged, destination=dest, max_items=limit)


def evidence_items_as_dicts(items: list[EvidenceItem]) -> list[dict[str, Any]]:
    return [i.model_dump(exclude_none=True) for i in items]
