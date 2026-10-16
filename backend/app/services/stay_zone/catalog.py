"""HOT-ZONE-CATALOG D: closed district pools (real coords, not inventory).

Mirror of frontend stayZoneCatalog; LLM may only rank ids in this table.
"""

from __future__ import annotations

from typing import Any

# Shared shape: id, city, label, label_en, lat, lng, radius_m, search_query, themes, transit_note

HCMC_CITY_KEYS = ("胡志明", "胡志明市", "西贡", "ho chi minh", "saigon", "sgn")

HCMC_CATALOG: list[dict[str, Any]] = [
    {
        "id": "catalog:hcmc:d1",
        "city": "胡志明市",
        "label": "第一郡 · 滨城",
        "label_en": "District 1 · Ben Thanh",
        "lat": 10.7725,
        "lng": 106.698,
        "radius_m": 1400,
        "search_query": "Ben Thanh Market Ho Chi Minh City",
        "themes": ["food", "transit", "nightlife"],
        "transit_note": "地铁/公交枢纽；步行可达歌剧院一带",
    },
    {
        "id": "catalog:hcmc:d3",
        "city": "胡志明市",
        "label": "第三郡",
        "label_en": "District 3",
        "lat": 10.784,
        "lng": 106.693,
        "radius_m": 1300,
        "search_query": "District 3 Ho Chi Minh City hotels",
        "themes": ["food", "quiet"],
        "transit_note": "相对第一郡安静，餐饮密集",
    },
    {
        "id": "catalog:hcmc:bui-vien",
        "city": "胡志明市",
        "label": "范五老 / 背包客街",
        "label_en": "Bui Vien",
        "lat": 10.7668,
        "lng": 106.6917,
        "radius_m": 900,
        "search_query": "Bui Vien Street Ho Chi Minh City",
        "themes": ["nightlife", "budget"],
        "transit_note": "夜生活集中；噪音敏感者慎选",
    },
    {
        "id": "catalog:hcmc:thao-dien",
        "city": "胡志明市",
        "label": "草甸 · 安富",
        "label_en": "Thao Dien",
        "lat": 10.802,
        "lng": 106.732,
        "radius_m": 1500,
        "search_query": "Thao Dien Ho Chi Minh City",
        "themes": ["family", "quiet", "food"],
        "transit_note": "外侨区；去市中心需过桥/打车",
    },
    {
        "id": "catalog:hcmc:phu-my-hung",
        "city": "胡志明市",
        "label": "富美兴 · 第七郡",
        "label_en": "Phu My Hung D7",
        "lat": 10.729,
        "lng": 106.721,
        "radius_m": 1600,
        "search_query": "Phu My Hung District 7 Ho Chi Minh",
        "themes": ["family", "quiet"],
        "transit_note": "新区规划好；距中心较远",
    },
    {
        "id": "catalog:hcmc:cho-lon",
        "city": "胡志明市",
        "label": "堤岸 · 第五郡",
        "label_en": "Cholon D5",
        "lat": 10.752,
        "lng": 106.663,
        "radius_m": 1400,
        "search_query": "Cholon District 5 Ho Chi Minh City",
        "themes": ["food", "culture"],
        "transit_note": "华人商圈；美食密集",
    },
    {
        "id": "catalog:hcmc:tan-binh",
        "city": "胡志明市",
        "label": "新山一机场带 · 新平",
        "label_en": "Tan Binh · Airport",
        "lat": 10.801,
        "lng": 106.655,
        "radius_m": 1800,
        "search_query": "Tan Son Nhat Airport hotels Ho Chi Minh",
        "themes": ["transit"],
        "transit_note": "早飞/晚到友好；非观光核心",
    },
    {
        "id": "catalog:hcmc:nguyen-hue",
        "city": "胡志明市",
        "label": "阮惠步行街一带",
        "label_en": "Nguyen Hue Walking Street",
        "lat": 10.7743,
        "lng": 106.7038,
        "radius_m": 1000,
        "search_query": "Nguyen Hue Boulevard Ho Chi Minh City",
        "themes": ["food", "transit", "nightlife"],
        "transit_note": "市中心地标轴；偏游客区",
    },
]

DANANG_CITY_KEYS = ("岘港", "峴港", "da nang", "danang", "dad", "đà nẵng")

DANANG_CATALOG: list[dict[str, Any]] = [
    {
        "id": "catalog:danang:my-khe",
        "city": "岘港",
        "label": "美溪海滩",
        "label_en": "My Khe Beach",
        "lat": 16.0599,
        "lng": 108.2465,
        "radius_m": 1500,
        "search_query": "My Khe Beach Da Nang hotels",
        "themes": ["beach", "family"],
        "transit_note": "沙滩步行友好；去古城需交通",
    },
    {
        "id": "catalog:danang:an-thuong",
        "city": "岘港",
        "label": "安赏 / 海边餐饮带",
        "label_en": "An Thuong",
        "lat": 16.0535,
        "lng": 108.244,
        "radius_m": 1200,
        "search_query": "An Thuong Da Nang",
        "themes": ["food", "beach", "nightlife"],
        "transit_note": "餐厅酒吧密集；近美溪",
    },
    {
        "id": "catalog:danang:han-river",
        "city": "岘港",
        "label": "韩江 / 市中心",
        "label_en": "Han River downtown",
        "lat": 16.0678,
        "lng": 108.2208,
        "radius_m": 1400,
        "search_query": "Han River Da Nang hotels",
        "themes": ["transit", "food", "culture"],
        "transit_note": "龙桥/市中心；去海滩约 10–15min",
    },
    {
        "id": "catalog:danang:son-tra",
        "city": "岘港",
        "label": "山茶半岛一带",
        "label_en": "Son Tra",
        "lat": 16.106,
        "lng": 108.277,
        "radius_m": 1800,
        "search_query": "Son Tra Peninsula Da Nang hotels",
        "themes": ["quiet", "nature"],
        "transit_note": "安静靠山；去市区需车",
    },
    {
        "id": "catalog:danang:bac-my-an",
        "city": "岘港",
        "label": "北美安",
        "label_en": "Bac My An",
        "lat": 16.039,
        "lng": 108.248,
        "radius_m": 1300,
        "search_query": "Bac My An Da Nang",
        "themes": ["beach", "quiet", "family"],
        "transit_note": "相对安静的海滩段",
    },
    {
        "id": "catalog:danang:hai-chau",
        "city": "岘港",
        "label": "海洲城区",
        "label_en": "Hai Chau",
        "lat": 16.067,
        "lng": 108.21,
        "radius_m": 1400,
        "search_query": "Hai Chau District Da Nang",
        "themes": ["transit", "food"],
        "transit_note": "本地生活区；交通便利",
    },
    {
        "id": "catalog:danang:airport",
        "city": "岘港",
        "label": "岘港机场带",
        "label_en": "Da Nang Airport",
        "lat": 16.0439,
        "lng": 108.199,
        "radius_m": 1600,
        "search_query": "Da Nang Airport hotels",
        "themes": ["transit"],
        "transit_note": "早飞友好；非观光核心",
    },
]


def _norm(s: str) -> str:
    return (s or "").strip().lower().replace(" ", "")


def city_matches(city: str, keys: tuple[str, ...]) -> bool:
    n = _norm(city)
    if not n:
        return False
    for k in keys:
        kk = _norm(k)
        if kk and (kk in n or n in kk):
            return True
    return False


def get_stay_zone_catalog_for_city(city: str) -> list[dict[str, Any]]:
    if city_matches(city, HCMC_CITY_KEYS):
        return list(HCMC_CATALOG)
    if city_matches(city, DANANG_CITY_KEYS):
        return list(DANANG_CATALOG)
    return []


def has_stay_zone_catalog(city: str) -> bool:
    return bool(get_stay_zone_catalog_for_city(city))


def catalog_compact_for_prompt(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fields LLM is allowed to see — no inventing coords."""
    out: list[dict[str, Any]] = []
    for e in entries:
        out.append(
            {
                "id": e["id"],
                "label": e["label"],
                "label_en": e.get("label_en"),
                "themes": e.get("themes") or [],
                "transit_note": e.get("transit_note"),
            }
        )
    return out


def order_catalog_by_ids(
    catalog: list[dict[str, Any]],
    ordered_ids: list[str] | None,
) -> list[dict[str, Any]]:
    """Enforce closed pool: only catalog ids; unknown dropped; missing appended."""
    by_id = {str(e["id"]): e for e in catalog}
    seen: set[str] = set()
    ordered: list[dict[str, Any]] = []
    for raw in ordered_ids or []:
        cid = str(raw).strip()
        if cid in by_id and cid not in seen:
            ordered.append(by_id[cid])
            seen.add(cid)
    for e in catalog:
        cid = str(e["id"])
        if cid not in seen:
            ordered.append(e)
            seen.add(cid)
    return ordered


def entry_to_zone_dict(
    entry: dict[str, Any],
    *,
    sequence: int,
    check_in: str,
    check_out: str,
    day_indices: list[int] | None = None,
    rationale: str | None = None,
) -> dict[str, Any]:
    themes = entry.get("themes") or []
    return {
        "id": entry["id"],
        "sequence": sequence,
        "city": entry["city"],
        "label": entry["label"],
        "check_in": check_in,
        "check_out": check_out,
        "rationale": rationale
        or (
            f"片区目录（HOT-ZONE-CATALOG）· {entry.get('label_en') or entry['label']}。"
            "可搜店范围供参考，房价以 Trip/RollingGo 为准。"
        ),
        "transit_note": entry.get("transit_note"),
        "strategy": "main_cluster",
        "anchor_hints": [entry.get("search_query") or entry["label"]],
        "covers_day_indices": day_indices or [],
        "status": "proposed",
        "fit_tag": "current_anchor",
        "bookable": True,
        "tag_note": "封闭片区目录 · 非 LLM 编造",
        "matched_themes": [{"id": t, "label": t} for t in themes[:3]],
        "geometry": {
            "type": "circle",
            "center": {"lat": entry["lat"], "lng": entry["lng"]},
            "radius_m": entry.get("radius_m") or 1200,
        },
    }
