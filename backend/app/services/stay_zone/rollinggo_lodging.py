"""HOT-RG-02: map RollingGo searchHotels → lodging candidates near zone hub."""

from __future__ import annotations

import logging
import math
import re
from datetime import date, datetime
from typing import Any

from app.config import Settings
from app.data.city_aliases import country_code_for_destination
from app.services.stay_zone.lodging_search import LodgingSearchResult
from app.services.stay_zone.rollinggo_client import (
    rollinggo_configured,
    search_hotels_mcp,
)

logger = logging.getLogger(__name__)

_DISTRICT_RE = re.compile(r"(区|郡|县|District|Dist\.?)", re.I)
_POI_HINT_RE = re.compile(
    r"(湾|公园|广场|寺|塔|桥|街|路|机场|车站|码头|beach|bay|park|tower|street)",
    re.I,
)
_PAREN_RE = re.compile(r"[（(][^）)]*[）)]")
_CN_NUM = {
    "一": "1",
    "二": "2",
    "三": "3",
    "四": "4",
    "五": "5",
    "六": "6",
    "七": "7",
    "八": "8",
    "九": "9",
    "十": "10",
}
_DISTRICT_NUM_RE = re.compile(r"第([一二三四五六七八九十\d]+)([郡区县])")


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _cn_ordinal_to_digit(token: str) -> str:
    if token.isdigit():
        return token
    if token in _CN_NUM:
        return _CN_NUM[token]
    if token.startswith("十") and len(token) == 2:
        return "1" + _CN_NUM.get(token[1], "")
    return token


def sanitize_zone_place(city: str, label: str) -> str:
    """Strip parentheticals / city prefix; 第一郡 → 第1郡.

    RollingGo often returns success+empty list for verbose labels like
    「胡志明市第一郡（市中心）」; short district tokens work.
    """
    city_s = (city or "").strip()
    s = _PAREN_RE.sub("", (label or "").strip()).strip()
    s = re.sub(r"\s+", "", s)
    if city_s and s.startswith(city_s):
        s = s[len(city_s) :].lstrip(" ·-—/,，")

    def _repl(m: re.Match[str]) -> str:
        return f"第{_cn_ordinal_to_digit(m.group(1))}{m.group(2)}"

    s = _DISTRICT_NUM_RE.sub(_repl, s)
    return s or (label or "").strip() or city_s


def build_place_attempts(*, city: str, label: str) -> list[tuple[str, str]]:
    """Ordered (place, placeType) variants for RollingGo searchHotels."""
    city_s = (city or "").strip()
    cleaned = sanitize_zone_place(city_s, label)
    attempts: list[tuple[str, str]] = []

    def add(place: str, place_type: str) -> None:
        p = (place or "").strip()
        if not p:
            return
        item = (p, place_type)
        if item not in attempts:
            attempts.append(item)

    if cleaned:
        if cleaned == city_s:
            add(cleaned, "城市")
        elif _DISTRICT_RE.search(cleaned):
            add(cleaned, "区/县")
        elif _POI_HINT_RE.search(cleaned):
            add(cleaned, "景点")
        else:
            add(cleaned, "区/县")

        m = re.search(r"第(\d+)郡", cleaned)
        if m:
            n = m.group(1)
            add(f"District {n}", "区/县")
            if city_s:
                add(f"{city_s} District {n}", "区/县")
                if "胡志明" in city_s or "西贡" in city_s:
                    add(f"Ho Chi Minh City District {n}", "区/县")

    if city_s:
        add(city_s, "城市")

    if not attempts:
        add("未知", "城市")
    return attempts


def resolve_place_type(*, city: str, label: str) -> tuple[str, str]:
    """Primary (place, placeType); prefer first attempt from build_place_attempts."""
    return build_place_attempts(city=city, label=label)[0]


def _parse_ymd(s: str) -> date | None:
    t = (s or "").strip()[:10]
    if not t:
        return None
    try:
        return datetime.strptime(t, "%Y-%m-%d").date()
    except ValueError:
        return None


def stay_nights_between(check_in: str, check_out: str) -> int:
    d0, d1 = _parse_ymd(check_in), _parse_ymd(check_out)
    if not d0:
        return 1
    if not d1 or d1 <= d0:
        return 1
    return max(1, min((d1 - d0).days, 28))


def _map_hotel(
    raw: dict[str, Any],
    *,
    hub_lat: float,
    hub_lng: float,
) -> dict[str, Any] | None:
    name = str(raw.get("name") or raw.get("nameEn") or "").strip()
    if not name:
        return None
    try:
        lat = float(raw.get("latitude"))
        lng = float(raw.get("longitude"))
    except (TypeError, ValueError):
        return None
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        return None
    dist_raw = raw.get("distanceInMeters")
    try:
        distance_m = int(dist_raw) if dist_raw is not None else int(
            round(_haversine_m(hub_lat, hub_lng, lat, lng))
        )
    except (TypeError, ValueError):
        distance_m = int(round(_haversine_m(hub_lat, hub_lng, lat, lng)))

    price = raw.get("price") if isinstance(raw.get("price"), dict) else {}
    ref_price = None
    currency = None
    if price.get("hasPrice") and price.get("lowestPrice") is not None:
        try:
            ref_price = float(price.get("lowestPrice"))
            currency = str(price.get("currency") or "CNY")
        except (TypeError, ValueError):
            ref_price = None

    hotel_id = raw.get("hotelId")
    place_id = f"rg:{hotel_id}" if hotel_id is not None else None
    rating = raw.get("starRating")
    try:
        rating_f = float(rating) if rating is not None else None
    except (TypeError, ValueError):
        rating_f = None

    out: dict[str, Any] = {
        "name": name,
        "lat": lat,
        "lng": lng,
        "address": (str(raw.get("address") or "").strip() or None),
        "place_id": place_id,
        "rating": rating_f,
        "distance_m": distance_m,
        "coord_source": "rollinggo",
        "booking_url": (str(raw.get("bookingUrl") or "").strip() or None),
    }
    if ref_price is not None:
        out["ref_price"] = ref_price
        out["currency"] = currency or "CNY"
    return out


def search_lodging_via_rollinggo(
    *,
    lat: float,
    lng: float,
    city: str,
    label: str = "",
    settings: Settings,
    limit: int = 8,
    radius_m: float = 1200.0,
    check_in: str = "",
    check_out: str = "",
    adults: int = 2,
    max_price: float | None = None,
) -> LodgingSearchResult:
    if not rollinggo_configured(settings):
        return LodgingSearchResult(
            status="unconfigured",
            warnings=["ROLLINGGO_MCP_API_KEY 未配置"],
        )

    attempts = build_place_attempts(city=city, label=label)
    nights = stay_nights_between(check_in, check_out)
    cc = country_code_for_destination(city) or country_code_for_destination(label)
    # Occupancy too high can empty inventory; keep search sane
    adult_n = max(1, min(int(adults or 2), 4))
    origin = f"{city} {label} 附近酒店".strip()
    last_query = ""
    last_error: str | None = None
    hotels: list[Any] = []

    for place, place_type in attempts:
        query = f"rollinggo:{place_type}:{place}"
        last_query = query
        try:
            data = search_hotels_mcp(
                settings,
                origin_query=origin,
                place=place,
                place_type=place_type,
                size=max(limit, 8),
                check_in_date=(check_in or "")[:10],
                stay_nights=nights,
                adult_count=adult_n,
                max_price_per_night=max_price,
                distance_in_meter=int(max(radius_m, 500)),
                country_code=cc.upper() if cc else None,
            )
        except Exception as e:
            logger.warning("rollinggo lodging failed place=%r: %s", place, e)
            last_error = str(e)[:160]
            continue

        if not data.get("success", True) and data.get("code") not in (None, 2000, 200):
            last_error = str(data.get("message") or "RollingGo 搜店失败")[:160]
            continue

        batch = data.get("hotelInformationList") or []
        if not isinstance(batch, list):
            batch = []
        if batch:
            hotels = batch
            break
        logger.info(
            "rollinggo empty list for place=%r type=%s; trying next", place, place_type
        )

    if not hotels:
        warn = "RollingGo 对该片区地名未返回酒店列表（非「附近无店」）；可改用 Trip.com 或店名搜索"
        if last_error:
            warn = f"{warn}（末次错误：{last_error}）"
        return LodgingSearchResult(
            status="empty",
            warnings=[warn],
            query=last_query,
        )

    mapped: list[dict[str, Any]] = []
    skipped_no_coord = 0
    for h in hotels:
        if not isinstance(h, dict):
            continue
        row = _map_hotel(h, hub_lat=lat, hub_lng=lng)
        if not row:
            skipped_no_coord += 1
            continue
        mapped.append(row)

    mapped.sort(key=lambda x: x.get("distance_m") or 10**9)
    in_radius = [c for c in mapped if (c.get("distance_m") or 0) <= radius_m * 1.35]
    chosen = in_radius[:limit] if in_radius else mapped[:limit]

    if not chosen:
        msg = "RollingGo 有结果但无有效坐标，无法上图；可改用 Trip.com 或店名搜索"
        if skipped_no_coord:
            msg = (
                f"RollingGo 返回 {skipped_no_coord} 家但缺坐标，无法上图；"
                "可改用 Trip.com 或店名搜索"
            )
        return LodgingSearchResult(
            status="empty",
            warnings=[msg],
            query=last_query,
        )

    warnings: list[str] = []
    if not in_radius and mapped:
        warnings.append("片区半径内较少，已按距枢纽远近展示附近候选（参考价）")

    return LodgingSearchResult(
        candidates=chosen,
        status="ok",
        warnings=warnings,
        query=last_query,
    )
