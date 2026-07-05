from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).resolve().parent / "data" / "city_codes.json"


class UnknownCityCodeError(ValueError):
    """Raised when origin/destination cannot be mapped to Trip.com city code."""


@lru_cache
def _load_index() -> dict[str, str]:
    raw = json.loads(_DATA.read_text(encoding="utf-8"))
    index: dict[str, str] = {}
    for code, info in raw.items():
        index[code.lower()] = code.lower()
        for alias in info.get("aliases", []):
            index[alias.strip().lower()] = code.lower()
    return index


def resolve_tripcom_city_code(value: str) -> str:
    """Map IATA, Chinese name, or Trip.com code to lowercase city code."""
    key = (value or "").strip().lower()
    if not key:
        raise UnknownCityCodeError("empty city code")
    index = _load_index()
    if key in index:
        return index[key]
    if len(key) == 3 and key.isalpha():
        return key
    raise UnknownCityCodeError(f"unknown city: {value!r}")


def resolve_search_iata(value: str) -> str:
    """Map user input to uppercase IATA/city code for LetsFG CLI."""
    return resolve_tripcom_city_code(value).upper()


def city_label(code: str) -> str:
    raw = json.loads(_DATA.read_text(encoding="utf-8"))
    info = raw.get(code.lower())
    return info["label"] if info else code.upper()
