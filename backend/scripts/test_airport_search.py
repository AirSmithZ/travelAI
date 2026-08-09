#!/usr/bin/env python3
"""Smoke tests for local airport fuzzy search."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.flight.airport_search import search_airports


def _iatas(q: str) -> list[str]:
    return [h.iata for h in search_airports(q, limit=20)]


def main() -> None:
    my = search_airports("马来西亚", limit=20)
    assert my, "马来西亚 should expand"
    assert all(h.match_type == "country" for h in my)
    assert _iatas("马来西亚")[:3] == ["KUL", "PEN", "BKI"]

    assert _iatas("KUL")[0] == "KUL"
    assert "KUL" in _iatas("吉隆坡")
    assert "SIN" in _iatas("新加坡")
    assert "TFU" in _iatas("天府") or "TFU" in _iatas("成都")

    print("ok", {
        "malaysia_top": _iatas("马来西亚")[:6],
        "kul": _iatas("KUL")[:3],
        "jl": _iatas("吉隆坡")[:3],
    })


if __name__ == "__main__":
    main()
