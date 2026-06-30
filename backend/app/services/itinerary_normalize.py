"""行程数据规范化：区域、默认值等。"""

from __future__ import annotations

from typing import Any

_FALLBACK_REGION = "其他"


def normalize_node_regions(itinerary: dict[str, Any]) -> dict[str, Any]:
    """确保每个节点都有显式 region，缺省回退到 day.region。"""
    for day in itinerary.get("days", []):
        default = (day.get("region") or "").strip() or _FALLBACK_REGION
        for node in day.get("nodes", []):
            raw = (node.get("region") or "").strip()
            node["region"] = raw or default
    return itinerary
