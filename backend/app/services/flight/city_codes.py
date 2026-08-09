from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).resolve().parent / "data" / "city_codes.json"


class UnknownCityCodeError(ValueError):
    """Raised when origin/destination cannot be mapped to Trip.com city code."""


@lru_cache
def _load_raw() -> dict[str, dict]:
    return json.loads(_DATA.read_text(encoding="utf-8"))


@lru_cache
def _load_index() -> dict[str, str]:
    raw = _load_raw()
    index: dict[str, str] = {}
    for code, info in raw.items():
        index[code.lower()] = code.lower()
        for alias in info.get("aliases", []):
            index[alias.strip().lower()] = code.lower()
    return index


def _is_iata_token(value: str) -> bool:
    """True for ASCII 3-letter airport/metro tokens (not CJK city names like 新加坡)."""
    return len(value) == 3 and value.isascii() and value.isalpha()


@lru_cache
def _airport_alias_set() -> frozenset[str]:
    """ASCII 3-letter airport aliases (not the Trip.com metro key itself)."""
    airports: set[str] = set()
    for code, info in _load_raw().items():
        metro = code.lower()
        for alias in info.get("aliases", []):
            a = alias.strip().lower()
            if _is_iata_token(a) and a != metro:
                airports.add(a)
        preferred = (info.get("ignav_iata") or "").strip().lower()
        if _is_iata_token(preferred):
            airports.add(preferred)
    return frozenset(airports)


def resolve_tripcom_city_code(value: str) -> str:
    """Map IATA, Chinese name, or Trip.com code to lowercase city code."""
    key = (value or "").strip().lower()
    if not key:
        raise UnknownCityCodeError("empty city code")
    index = _load_index()
    if key in index:
        return index[key]
    if _is_iata_token(key):
        return key
    raise UnknownCityCodeError(f"unknown city: {value!r}")


def resolve_search_iata(value: str) -> str:
    """Map user input to uppercase code for LetsFG / generic search (legacy)."""
    return resolve_tripcom_city_code(value).upper()


def resolve_ignav_iata(value: str) -> str:
    """
    Map user input to an airport IATA Ignav accepts.

    Trip.com uses metro codes (BJS/TYO/SEL/…) which Ignav rejects.
    - Explicit airport aliases (PEK, NRT, ICN…) are preserved.
    - City names / metro codes fall back to city_codes.json ``ignav_iata``.
    """
    key = (value or "").strip().lower()
    if not key:
        raise UnknownCityCodeError("empty city code")

    # User typed a concrete airport (PEK, NRT, PVG…) — do not collapse to metro.
    if key in _airport_alias_set():
        return key.upper()

    raw = _load_raw()
    try:
        metro = resolve_tripcom_city_code(value)
    except UnknownCityCodeError:
        if _is_iata_token(key):
            return key.upper()
        raise

    info = raw.get(metro) or {}
    preferred = (info.get("ignav_iata") or "").strip().upper()
    if _is_iata_token(preferred.lower()):
        return preferred

    # Last resort: metro upper — may fail for BJS/TYO; callers see Ignav error.
    return metro.upper()


def city_label(code: str) -> str:
    raw = _load_raw()
    info = raw.get(code.lower())
    return info["label"] if info else code.upper()
