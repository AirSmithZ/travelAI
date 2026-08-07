"""片区/region 别名归一（DATA-07）。"""

from __future__ import annotations

# 常见口语 → 规范片区名（可按目的地扩展）
REGION_ALIASES: dict[str, str] = {
    "市中心": "市中心",
    "市区": "市中心",
    "城中": "市中心",
    "downtown": "市中心",
    "cbd": "市中心",
    "CBD": "市中心",
    "中央商务区": "市中心",
    "滨海湾": "滨海湾",
    "marina bay": "滨海湾",
    "牛车水": "牛车水",
    "chinatown": "牛车水",
    "乌节": "乌节路",
    "乌节路": "乌节路",
    "orchard": "乌节路",
    "樟宜": "樟宜区",
    "樟宜区": "樟宜区",
    "changi": "樟宜区",
    "圣淘沙": "圣淘沙",
    "sentosa": "圣淘沙",
}


def normalize_region(region: str | None) -> str | None:
    raw = (region or "").strip()
    if not raw:
        return None
    if raw in REGION_ALIASES:
        return REGION_ALIASES[raw]
    key = raw.lower()
    for alias, canonical in REGION_ALIASES.items():
        if alias.lower() == key or alias in raw or key in alias.lower():
            return canonical
    return raw
