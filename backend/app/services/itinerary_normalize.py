"""行程数据规范化：区域、默认值等。"""

from __future__ import annotations

from typing import Any

from app.data.region_aliases import normalize_region

_FALLBACK_REGION = "其他"


def normalize_node_regions(itinerary: dict[str, Any]) -> dict[str, Any]:
    """确保每个节点都有显式 region，缺省回退到 day.region；DATA-07 别名归一。"""
    for day in itinerary.get("days", []):
        day_region = normalize_region(day.get("region")) or _FALLBACK_REGION
        if day.get("region"):
            day["region"] = day_region
        for node in day.get("nodes", []):
            raw = normalize_region(node.get("region"))
            node["region"] = raw or day_region
    return itinerary