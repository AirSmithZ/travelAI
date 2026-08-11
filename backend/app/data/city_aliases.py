"""常见目的地中文/别名 → OSM/Photon 友好检索串（P64）与国家码（GEO-01）。"""

CITY_ALIASES: dict[str, str] = {
    "亚庇": "Kota Kinabalu, Malaysia",
    "哥打基纳巴卢": "Kota Kinabalu, Malaysia",
    "沙巴": "Sabah, Malaysia",
    "吉隆坡": "Kuala Lumpur, Malaysia",
    "槟城": "Penang, Malaysia",
    "兰卡威": "Langkawi, Malaysia",
    "新加坡": "Singapore",
    "曼谷": "Bangkok, Thailand",
    "清迈": "Chiang Mai, Thailand",
    "普吉": "Phuket, Thailand",
    "东京": "Tokyo, Japan",
    "大阪": "Osaka, Japan",
    "京都": "Kyoto, Japan",
    "首尔": "Seoul, South Korea",
    "巴厘岛": "Bali, Indonesia",
    "雅加达": "Jakarta, Indonesia",
    "香港": "Hong Kong",
    "台北": "Taipei, Taiwan",
    "巴黎": "Paris, France",
    "伦敦": "London, United Kingdom",
    "纽约": "New York, United States",
    "悉尼": "Sydney, Australia",
    "奥克兰": "Auckland, New Zealand",
    "新西兰": "New Zealand",
    "基督城": "Christchurch, New Zealand",
    "皇后镇": "Queenstown, New Zealand",
    "越南": "Vietnam",
    "胡志明": "Ho Chi Minh City, Vietnam",
    "胡志明市": "Ho Chi Minh City, Vietnam",
    "西贡": "Ho Chi Minh City, Vietnam",
    "河内": "Hanoi, Vietnam",
    "岘港": "Da Nang, Vietnam",
}

# ISO 3166-1 alpha-2（Nominatim countrycodes / Photon 过滤）
CITY_COUNTRY_CODES: dict[str, str] = {
    "亚庇": "my",
    "哥打基纳巴卢": "my",
    "沙巴": "my",
    "吉隆坡": "my",
    "槟城": "my",
    "兰卡威": "my",
    "新加坡": "sg",
    "曼谷": "th",
    "清迈": "th",
    "普吉": "th",
    "东京": "jp",
    "大阪": "jp",
    "京都": "jp",
    "首尔": "kr",
    "巴厘岛": "id",
    "雅加达": "id",
    "香港": "hk",
    "台北": "tw",
    "巴黎": "fr",
    "伦敦": "gb",
    "纽约": "us",
    "悉尼": "au",
    "奥克兰": "nz",
    "新西兰": "nz",
    "基督城": "nz",
    "皇后镇": "nz",
    "越南": "vn",
    "胡志明": "vn",
    "胡志明市": "vn",
    "西贡": "vn",
    "河内": "vn",
    "岘港": "vn",
    "vietnam": "vn",
    "ho chi minh": "vn",
    "saigon": "vn",
    "hanoi": "vn",
    "da nang": "vn",
}


def normalize_city(destination: str) -> str:
    """将 trip_request.destination 等中文别名转为 geocoder 友好 city 串。"""
    raw = destination.strip()
    if not raw:
        return ""
    if raw in CITY_ALIASES:
        return CITY_ALIASES[raw]
    for key, value in CITY_ALIASES.items():
        if key in raw and len(key) >= 2:
            return value
    return raw


def country_code_for_destination(destination: str) -> str | None:
    """目的地 → ISO country code（小写）；未知则 None。"""
    raw = destination.strip()
    if not raw:
        return None
    if raw in CITY_COUNTRY_CODES:
        return CITY_COUNTRY_CODES[raw]
    low = raw.lower()
    if low in CITY_COUNTRY_CODES:
        return CITY_COUNTRY_CODES[low]
    for key, code in CITY_COUNTRY_CODES.items():
        if len(key) < 2:
            continue
        if key in raw:
            return code
        if key.lower() in low:
            return code
    return None
