#!/usr/bin/env python3
"""Demo search+rank using fixture data (no LetsFG/Duffel network)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from flight_spike.letsfg import parse_letsfg_stdout
from flight_spike.models import SearchRequest, SearchResult
from flight_spike.deeplink import google_flights_url
from flight_spike.rank import rank_offers

FIXTURE = """
│ 1    │       USD │ D7-AirA… │ PVG→KUL→SIN │  06:00 │   20:45 │ 14h 45m │   1   │
│      │    104.00 │          │             │        │         │         │       │
│ 2    │       USD │ Scoot    │ PVG→SIN     │  02:10 │   07:35 │  5h 25m │   0   │
│      │    189.00 │          │             │        │         │         │       │
│ 3    │       USD │ SQ       │ PVG→SIN     │  08:05 │   13:20 │  5h 15m │   0   │
│      │    312.00 │          │             │        │         │         │       │
│ 4    │       USD │ MU       │ PVG→CAN→SIN │  09:30 │   16:10 │  6h 40m │   1   │
│      │    156.00 │          │             │        │         │         │       │
"""


def main() -> int:
    pref = sys.argv[1] if len(sys.argv) > 1 else "balanced"
    req = SearchRequest(
        origin="PVG", destination="SIN", date="2026-10-16", preference=pref  # type: ignore
    )
    fetched_at = datetime.now(timezone.utc).isoformat()
    offers = parse_letsfg_stdout(FIXTURE, req, fetched_at=fetched_at)
    ranked = rank_offers(offers, req.preference, top_n=3)
    result = SearchResult(
        request=req,
        fetched_at=fetched_at,
        deeplink=google_flights_url(req.origin, req.destination, req.date),
        offers=offers,
        ranked=ranked,
        sources_used=["deeplink", "fixture"],
        warnings=["演示数据，非实时报价"],
    )
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
