#!/usr/bin/env python3
"""Build compact airports.json from OpenFlights + Chinese aliases.

Preferred source (smaller / faster CDN):
  https://cdn.jsdelivr.net/gh/jpatokal/openflights@master/data/airports.dat

Usage:
  curl -L -o /tmp/openflights-airports.dat \\
    https://cdn.jsdelivr.net/gh/jpatokal/openflights@master/data/airports.dat
  python backend/scripts/build_airports_index.py [/path/to/airports.dat]
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "services" / "flight" / "data"
CITY_CODES = DATA / "city_codes.json"
COUNTRY_ALIASES = DATA / "country_aliases.json"
ALIASES_ZH = DATA / "airport_aliases_zh.json"
OUT = DATA / "airports.json"

# OpenFlights dump can lag newer hubs; keep searchable.
_EXTRA_AIRPORTS = [
    {
        "iata": "TFU",
        "name": "Chengdu Tianfu International Airport",
        "city": "Chengdu",
        "country": "China",
        "lat": 30.3125,
        "lon": 104.445,
    },
]


def _load_city_label_by_iata() -> dict[str, str]:
    raw = json.loads(CITY_CODES.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for info in raw.values():
        label = (info.get("label") or "").strip()
        if not label:
            continue
        for alias in info.get("aliases") or []:
            a = str(alias).strip()
            if len(a) == 3 and a.isascii() and a.isalpha():
                out[a.upper()] = label
        preferred = (info.get("ignav_iata") or "").strip().upper()
        if len(preferred) == 3:
            out.setdefault(preferred, label)
    return out


def _load_extra_aliases() -> dict[str, list[str]]:
    if not ALIASES_ZH.exists():
        return {}
    raw = json.loads(ALIASES_ZH.read_text(encoding="utf-8"))
    return {k.upper(): [str(x) for x in v] for k, v in raw.items()}


def _merge_aliases(*groups: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for group in groups:
        for a in group:
            key = a.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(a.strip())
    return out


def build(dat_path: Path) -> dict:
    city_labels = _load_city_label_by_iata()
    extra = _load_extra_aliases()
    country_aliases = json.loads(COUNTRY_ALIASES.read_text(encoding="utf-8"))

    by_iata: dict[str, dict] = {}

    with dat_path.open(newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) < 8:
                continue
            iata = (row[4] or "").strip().upper()
            if len(iata) != 3 or not iata.isalpha() or iata == "\\N":
                continue
            name = (row[1] or "").strip()
            city = (row[2] or "").strip()
            country = (row[3] or "").strip()
            if not name or not country or country == "\\N":
                continue
            try:
                lat = float(row[6]) if row[6] and row[6] != "\\N" else None
                lon = float(row[7]) if row[7] and row[7] != "\\N" else None
            except ValueError:
                lat = lon = None

            aliases = _merge_aliases(
                [city_labels[iata]] if iata in city_labels else [],
                extra.get(iata, []),
            )
            by_iata[iata] = {
                "iata": iata,
                "name": name,
                "city": city,
                "country": country,
                "lat": lat,
                "lon": lon,
                "aliases": aliases,
                "popular": iata in city_labels or iata in extra,
            }

    for item in _EXTRA_AIRPORTS:
        iata = item["iata"]
        if iata in by_iata:
            continue
        aliases = _merge_aliases(
            [city_labels[iata]] if iata in city_labels else [],
            extra.get(iata, []),
        )
        by_iata[iata] = {
            **item,
            "aliases": aliases,
            "popular": True,
        }

    airports = sorted(
        by_iata.values(),
        key=lambda a: (0 if a.get("popular") else 1, a["city"] or "", a["iata"]),
    )

    return {
        "source": "OpenFlights",
        "count": len(airports),
        "countries": country_aliases,
        "airports": airports,
    }


def main() -> None:
    dat_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/openflights-airports.dat")
    if not dat_path.exists():
        raise SystemExit(f"DAT not found: {dat_path}")
    if not COUNTRY_ALIASES.exists():
        raise SystemExit(f"Missing {COUNTRY_ALIASES}")

    payload = build(dat_path)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT} ({payload['count']} airports, {size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
