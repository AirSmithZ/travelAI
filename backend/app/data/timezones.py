"""目的地 → IANA 时区（DATA-02）。

优先用 ``city_aliases.country_code_for_destination``，再辅以英文/中文关键词；
未覆盖时回退 ``UTC``（并可由调用方记 warning）。
"""

from __future__ import annotations

from app.data.city_aliases import country_code_for_destination

# ISO 3166-1 alpha-2 → 代表性 IANA（单国单区简化；中国统一 Asia/Shanghai）
COUNTRY_TIMEZONES: dict[str, str] = {
    "sg": "Asia/Singapore",
    "my": "Asia/Kuala_Lumpur",
    "th": "Asia/Bangkok",
    "jp": "Asia/Tokyo",
    "kr": "Asia/Seoul",
    "id": "Asia/Jakarta",
    "hk": "Asia/Hong_Kong",
    "tw": "Asia/Taipei",
    "cn": "Asia/Shanghai",
    "fr": "Europe/Paris",
    "gb": "Europe/London",
    "us": "America/New_York",
    "au": "Australia/Sydney",
    "vn": "Asia/Ho_Chi_Minh",
    "ph": "Asia/Manila",
    "ae": "Asia/Dubai",
    "it": "Europe/Rome",
    "es": "Europe/Madrid",
    "de": "Europe/Berlin",
    "nz": "Pacific/Auckland",
}

# 关键词（小写匹配）；顺序：更具体的城市/别名靠前。不用过短 token（如 "sin"）防误伤。
_KEYWORD_TIMEZONES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("新加坡", "singapore"), "Asia/Singapore"),
    (("吉隆坡", "kuala lumpur", "槟城", "penang", "兰卡威", "langkawi", "亚庇", "沙巴", "马来西亚", "malaysia"), "Asia/Kuala_Lumpur"),
    (("曼谷", "bangkok", "清迈", "chiang mai", "普吉", "phuket", "泰国", "thailand"), "Asia/Bangkok"),
    (("东京", "tokyo", "大阪", "osaka", "京都", "kyoto", "日本", "japan"), "Asia/Tokyo"),
    (("首尔", "seoul", "韩国", "korea"), "Asia/Seoul"),
    (("巴厘", "bali", "雅加达", "jakarta", "印度尼西亚", "indonesia"), "Asia/Jakarta"),
    (("香港", "hong kong"), "Asia/Hong_Kong"),
    (("台北", "taipei", "台湾", "taiwan"), "Asia/Taipei"),
    (("上海", "北京", "深圳", "广州", "杭州", "成都", "中国", "china"), "Asia/Shanghai"),
    (("巴黎", "paris", "法国", "france"), "Europe/Paris"),
    (("伦敦", "london", "英国", "united kingdom"), "Europe/London"),
    (("纽约", "new york", "美国", "united states", "usa"), "America/New_York"),
    (("悉尼", "sydney", "墨尔本", "melbourne", "澳大利亚", "australia"), "Australia/Sydney"),
    (("胡志明", "河内", "越南", "vietnam", "ho chi minh", "hanoi"), "Asia/Ho_Chi_Minh"),
    (("马尼拉", "菲律宾", "manila", "philippines"), "Asia/Manila"),
    (("迪拜", "dubai", "阿联酋"), "Asia/Dubai"),
)


def timezone_for_destination(destination: str) -> str:
    """Resolve IANA timezone for a free-text destination. Unknown → UTC."""
    raw = (destination or "").strip()
    if not raw:
        return "UTC"

    cc = country_code_for_destination(raw)
    if cc and cc in COUNTRY_TIMEZONES:
        return COUNTRY_TIMEZONES[cc]

    d = raw.lower()
    for keys, tz in _KEYWORD_TIMEZONES:
        if any(k in d or k in raw for k in keys):
            return tz

    return "UTC"
