"""Lightweight Wikidata place lookup (P625) as geocode bilingual fallback.

Not a static alias table: resolves zh/en labels via Wikidata search at runtime.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_WD_API = "https://www.wikidata.org/w/api.php"
_COORD_RE = re.compile(
    r"Point\(\s*(?P<lng>-?\d+(?:\.\d+)?)\s+(?P<lat>-?\d+(?:\.\d+)?)\s*\)"
)


def _search_entity_id(client: httpx.Client, label: str, *, language: str) -> str | None:
    resp = client.get(
        _WD_API,
        params={
            "action": "wbsearchentities",
            "search": label,
            "language": language,
            "uselang": language,
            "type": "item",
            "limit": 5,
            "format": "json",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    for item in data.get("search") or []:
        eid = item.get("id")
        if isinstance(eid, str) and eid.startswith("Q"):
            return eid
    return None


def _coords_from_entity(client: httpx.Client, entity_id: str) -> tuple[float, float] | None:
    resp = client.get(
        _WD_API,
        params={
            "action": "wbgetentities",
            "ids": entity_id,
            "props": "claims",
            "format": "json",
        },
    )
    resp.raise_for_status()
    entity = ((resp.json().get("entities") or {}).get(entity_id)) or {}
    claims = entity.get("claims") or {}
    for snak in claims.get("P625") or []:
        mainsnak = snak.get("mainsnak") or {}
        datavalue = mainsnak.get("datavalue") or {}
        value = datavalue.get("value")
        if isinstance(value, dict) and "latitude" in value and "longitude" in value:
            return float(value["latitude"]), float(value["longitude"])
        if isinstance(value, str):
            m = _COORD_RE.search(value)
            if m:
                return float(m.group("lat")), float(m.group("lng"))
    return None


def resolve_wikidata_place(
    label: str,
    *,
    label_en: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    """Return {lat,lng,address,coord_source,place_id,geocode_label} or None."""
    labels: list[tuple[str, str]] = []
    en = (label_en or "").strip()
    zh = (label or "").strip()
    if en:
        labels.append((en, "en"))
    if zh and zh.lower() != en.lower():
        # Prefer Chinese search when label looks CJK
        lang = "zh" if any("\u4e00" <= c <= "\u9fff" for c in zh) else "en"
        labels.append((zh, lang))
    if not labels:
        return None

    cfg = settings or get_settings()
    timeout = float(cfg.geocode_timeout_sec)
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": cfg.geocode_user_agent}) as client:
            for text, language in labels:
                eid = _search_entity_id(client, text, language=language)
                if not eid:
                    continue
                coords = _coords_from_entity(client, eid)
                if not coords:
                    continue
                lat, lng = coords
                return {
                    "lat": lat,
                    "lng": lng,
                    "address": f"{text} (Wikidata {eid})",
                    "coord_confidence": "medium",
                    "coord_source": "wikidata",
                    "place_id": eid,
                    "geocode_label": text,
                }
    except Exception as e:
        logger.info("wikidata resolve failed for %r / %r: %s", label, label_en, e)
    return None
