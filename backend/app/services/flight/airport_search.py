"""Local fuzzy airport / country search over airports.json."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).resolve().parent / "data" / "airports.json"
_WS_RE = re.compile(r"\s+")
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# Country expansion: surface primary hubs before secondary fields.
_COUNTRY_HUBS: dict[str, tuple[str, ...]] = {
    "Malaysia": ("KUL", "PEN", "BKI", "LGK", "KCH", "JHB"),
    "Thailand": ("BKK", "DMK", "HKT", "CNX", "USM"),
    "Japan": ("NRT", "HND", "KIX", "ITM", "NGO", "FUK"),
    "South Korea": ("ICN", "GMP", "PUS", "CJU"),
    "China": ("PVG", "SHA", "PEK", "PKX", "CAN", "SZX", "TFU", "CTU", "HKG"),
    "United States": ("JFK", "EWR", "LAX", "SFO", "ORD", "SEA"),
    "United Kingdom": ("LHR", "LGW", "STN", "MAN", "EDI"),
    "France": ("CDG", "ORY", "NCE", "LYS"),
    "Australia": ("SYD", "MEL", "BNE", "PER"),
    "Indonesia": ("CGK", "DPS", "SUB", "JOG"),
    "Vietnam": ("SGN", "HAN", "DAD"),
    "Singapore": ("SIN",),
    "Hong Kong": ("HKG",),
    "Taiwan": ("TPE", "TSA", "KHH"),
}


@dataclass(frozen=True, slots=True)
class AirportHit:
    iata: str
    name: str
    city: str
    country: str
    name_zh: str
    city_zh: str
    country_zh: str
    label: str
    match_type: str  # iata | city | alias | name | country
    score: float


def _norm(value: str) -> str:
    return _WS_RE.sub("", (value or "").strip().lower())


def _has_cjk(value: str) -> bool:
    return bool(_CJK_RE.search(value or ""))


@lru_cache
def _load() -> dict:
    if not _DATA.exists():
        return {"countries": {}, "airports": []}
    return json.loads(_DATA.read_text(encoding="utf-8"))


def _country_index() -> dict[str, str]:
    raw = _load().get("countries") or {}
    return {_norm(k): str(v) for k, v in raw.items() if str(k).strip()}


@lru_cache
def _country_zh_map() -> dict[str, str]:
    """English country name → preferred Chinese label."""
    raw = _load().get("countries") or {}
    out: dict[str, str] = {}
    for alias, en in raw.items():
        en_s = str(en).strip()
        al = str(alias).strip()
        if not en_s or not al or not _has_cjk(al):
            continue
        # Prefer fuller Chinese names（马来西亚 > 马来；澳大利亚 > 澳洲 as tie-break by length）.
        prev = out.get(en_s)
        if prev is None or len(al) > len(prev):
            out[en_s] = al
    return out


@lru_cache
def _city_zh_map() -> dict[str, str]:
    """English city/municipality → Chinese, inferred from airport aliases."""
    out: dict[str, str] = {}
    for row in _load().get("airports") or []:
        city = (row.get("city") or "").strip()
        if not city:
            continue
        key = city.lower()
        if key in out:
            continue
        for alias in row.get("aliases") or []:
            a = str(alias).strip()
            if _has_cjk(a):
                out[key] = a
                break
    return out


def _airports() -> list[dict]:
    return list(_load().get("airports") or [])


def _score_text(query: str, text: str, *, exact: float, prefix: float, contains: float) -> float:
    if not text:
        return 0.0
    if query == text:
        return exact
    if text.startswith(query):
        return prefix
    if query in text:
        return contains
    return 0.0


def _cjk_aliases(row: dict) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for alias in row.get("aliases") or []:
        a = str(alias).strip()
        if not a or not _has_cjk(a):
            continue
        key = a.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def _localize(row: dict) -> tuple[str, str, str, str]:
    """Return (name_zh, city_zh, country_zh, label)."""
    iata = row["iata"]
    name_en = (row.get("name") or "").strip()
    city_en = (row.get("city") or "").strip()
    country_en = (row.get("country") or "").strip()

    country_zh = _country_zh_map().get(country_en, country_en)
    cjk = _cjk_aliases(row)
    city_zh = cjk[0] if cjk else _city_zh_map().get(city_en.lower(), city_en)

    if len(cjk) >= 2:
        # e.g. 东京 + 成田 / 新加坡 + 新加坡樟宜
        name_zh = cjk[1] if cjk[1] != city_zh else cjk[0]
        if name_zh == city_zh and _has_cjk(city_zh):
            name_zh = f"{city_zh}机场"
    elif cjk:
        # Single alias: treat as city; airport line uses 「城市 + 机场」
        name_zh = f"{cjk[0]}机场" if not cjk[0].endswith("机场") else cjk[0]
    elif _has_cjk(city_zh):
        name_zh = f"{city_zh}机场"
    else:
        name_zh = name_en

    primary = city_zh or name_zh or iata
    label = f"{primary}（{iata}）"
    if country_zh:
        label = f"{label} · {country_zh}"
    if name_zh and name_zh != primary and name_zh != f"{primary}机场":
        label = f"{label} · {name_zh}"
    return name_zh, city_zh, country_zh, label


def _to_hit(row: dict, *, match_type: str, score: float) -> AirportHit:
    name_zh, city_zh, country_zh, label = _localize(row)
    return AirportHit(
        iata=row["iata"],
        name=row.get("name") or "",
        city=row.get("city") or "",
        country=row.get("country") or "",
        name_zh=name_zh,
        city_zh=city_zh,
        country_zh=country_zh,
        label=label,
        match_type=match_type,
        score=score,
    )


def search_airports(query: str, *, limit: int = 12) -> list[AirportHit]:
    q_raw = (query or "").strip()
    if len(q_raw) < 1:
        return []
    q = _norm(q_raw)
    if not q:
        return []

    limit = max(1, min(int(limit), 40))
    countries = _country_index()
    country_name = countries.get(q)

    # Country query → list airports in that country (hubs first).
    if country_name:
        hubs = _COUNTRY_HUBS.get(country_name, ())
        hub_rank = {code: i for i, code in enumerate(hubs)}

        def country_key(a: dict) -> tuple:
            iata = a["iata"]
            return (
                hub_rank.get(iata, 100),
                0 if a.get("popular") else 1,
                a.get("city") or "",
                iata,
            )

        rows = [a for a in _airports() if a.get("country") == country_name]
        rows.sort(key=country_key)
        hits: list[AirportHit] = []
        for idx, row in enumerate(rows[:limit]):
            hub_bonus = 20.0 if row["iata"] in hub_rank else 0.0
            hits.append(_to_hit(row, match_type="country", score=120.0 - idx + hub_bonus))
        return hits

    scored: list[AirportHit] = []
    for row in _airports():
        iata = row["iata"]
        city_n = _norm(row.get("city") or "")
        name_n = _norm(row.get("name") or "")
        aliases_n = [_norm(a) for a in (row.get("aliases") or [])]
        country_n = _norm(row.get("country") or "")
        # Also match Chinese country / city display strings.
        country_zh_n = _norm(_country_zh_map().get(row.get("country") or "", ""))
        city_zh_n = _norm(_city_zh_map().get((row.get("city") or "").lower(), ""))

        score = 0.0
        match_type = "name"

        if q == _norm(iata):
            score = 200.0
            match_type = "iata"
        else:
            best_alias = max(
                (_score_text(q, a, exact=180, prefix=140, contains=110) for a in aliases_n),
                default=0.0,
            )
            city_score = max(
                _score_text(q, city_n, exact=170, prefix=130, contains=100),
                _score_text(q, city_zh_n, exact=170, prefix=130, contains=100),
            )
            name_score = _score_text(q, name_n, exact=120, prefix=90, contains=70)
            country_score = 0.0
            if len(q) >= 2:
                country_score = max(
                    _score_text(q, country_n, exact=0, prefix=0, contains=40),
                    _score_text(q, country_zh_n, exact=0, prefix=0, contains=40),
                )
            iata_prefix = 160.0 if _norm(iata).startswith(q) and len(q) >= 2 else 0.0

            candidates = [
                (best_alias, "alias"),
                (city_score, "city"),
                (name_score, "name"),
                (country_score, "country"),
                (iata_prefix, "iata"),
            ]
            score, match_type = max(candidates, key=lambda x: x[0])

        if score <= 0:
            continue
        if row.get("popular"):
            score += 8.0
        scored.append(_to_hit(row, match_type=match_type, score=score))

    scored.sort(key=lambda h: (-h.score, h.city_zh or h.city, h.iata))
    return scored[:limit]
