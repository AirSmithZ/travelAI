"""常见目的地中文/别名 → OSM/Photon 友好检索串（P64）。"""

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
