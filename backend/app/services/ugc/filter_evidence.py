"""WS-09: filter / denoise EvidenceItem before prompt injection (doc 21 §4.3)."""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable
from urllib.parse import urlparse

from app.services.ugc.tikhub import EvidenceItem

_AD_RE = re.compile(
    r"(机票优惠|签证代办|酒店折扣|特价机票|代订|返现|佣金|affiliate)",
    re.I,
)
_ITIN_RE = re.compile(
    r"(行程|自由行|一日游|攻略|itinerary|避坑|景点|打卡|游记)",
    re.I,
)


def filter_evidence_items(
    items: Iterable[EvidenceItem | dict],
    *,
    destination: str = "",
    max_items: int = 12,
    max_per_domain: int = 3,
) -> list[EvidenceItem]:
    """Drop ads / wrong-city / dupes; cap per-domain and total."""
    dest = (destination or "").strip()
    dest_tokens = [t for t in re.split(r"[\s,，/]+", dest) if len(t) >= 2]

    normalized: list[EvidenceItem] = []
    for raw in items:
        if isinstance(raw, EvidenceItem):
            normalized.append(raw)
        elif isinstance(raw, dict):
            try:
                normalized.append(EvidenceItem.model_validate(raw))
            except Exception:
                continue

    seen_keys: set[str] = set()
    domain_counts: Counter[str] = Counter()
    kept: list[EvidenceItem] = []

    # Prefer higher likes first among TikHub-like items
    def sort_key(it: EvidenceItem) -> tuple[int, int]:
        likes = it.likes if it.likes is not None else -1
        return (likes, 0)

    for item in sorted(normalized, key=sort_key, reverse=True):
        key = (item.note_id or item.url or item.title).strip().lower()
        if not key or key in seen_keys:
            continue

        blob = f"{item.title} {item.snippet}"
        if _AD_RE.search(blob) and not _ITIN_RE.search(blob):
            continue

        if dest_tokens and not any(tok in blob for tok in dest_tokens):
            # Allow English dest aliases lightly: skip strict drop if source is authority
            if "authority" not in (item.source or ""):
                continue

        host = ""
        try:
            host = urlparse(item.url).netloc.lower()
        except Exception:
            host = ""
        if host and domain_counts[host] >= max_per_domain:
            continue

        seen_keys.add(key)
        if host:
            domain_counts[host] += 1
        kept.append(item)
        if len(kept) >= max_items:
            break

    return kept
