#!/usr/bin/env python3
"""Tier 1.5 — Ignav API spike (structured fares for LLM analysis)."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from flight_spike.ignav import search_ignav  # noqa: E402
from flight_spike.models import SearchRequest  # noqa: E402
from flight_spike.rank import rank_offers  # noqa: E402

FIXTURES = ROOT / "fixtures" / "routes.json"
OUT_DIR = ROOT / "output" / datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load_dotenv() -> None:
    """Load flight-spike/.env then travel repo root .env (IGNAV_API_KEY often lives there)."""
    candidates = [
        ROOT / ".env",
        ROOT.parent / ".env",
    ]
    for env_path in candidates:
        if not env_path.is_file():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_routes() -> list[dict]:
    return json.loads(FIXTURES.read_text(encoding="utf-8"))


def route_to_request(route: dict) -> SearchRequest:
    return SearchRequest(
        origin=route["origin"],
        destination=route["destination"],
        date=route["date"],
        return_date=route.get("return_date"),
        adults=route.get("adults", 1),
        cabin=route.get("cabin", "economy"),
        currency="USD",
        preference="balanced",
    )


def run_route(route: dict) -> dict:
    req = route_to_request(route)
    offers, latency_ms, err = search_ignav(req)
    ranked = rank_offers(offers, req.preference, top_n=5) if offers else []

    preview = [
        {
            "rank": o.rank,
            "airline": o.airline,
            "route": o.route_label,
            "depart": o.depart_time,
            "arrive": o.arrive_time,
            "duration_minutes": o.duration_minutes,
            "stops": o.stops,
            "price": o.price_amount,
            "currency": o.price_currency,
            "booking_deep_link": o.booking_deep_link,
        }
        for o in ranked
    ]

    return {
        "route_id": route["id"],
        "origin": route["origin"],
        "destination": route["destination"],
        "date": route["date"],
        "return_date": route.get("return_date"),
        "success": bool(offers),
        "latency_ms": latency_ms,
        "offer_count": len(offers),
        "ranked_preview": preview,
        "error": err,
        "lowest_price": min((o.price_amount for o in offers), default=None),
        "currency": offers[0].price_currency if offers else None,
    }


def main() -> int:
    _load_dotenv()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    has_key = bool(os.environ.get("IGNAV_API_KEY", "").strip())
    if not has_key:
        print(
            "WARN: IGNAV_API_KEY not set — add to travel/.env or flight-spike/.env",
            flush=True,
        )

    routes = load_routes()
    results = []
    for route in routes:
        print(f"Ignav {route['id']} {route['origin']}→{route['destination']} ...", flush=True)
        row = run_route(route)
        results.append(row)
        print(
            f"  -> success={row['success']} offers={row['offer_count']} "
            f"ms={row['latency_ms']} err={row.get('error')}",
            flush=True,
        )

    report = {
        "tier": "1.5",
        "source": "ignav",
        "run_at": datetime.now(timezone.utc).isoformat(),
        "api_key_configured": has_key,
        "results": results,
        "summary": {
            "total_routes": len(results),
            "success_count": sum(1 for r in results if r["success"]),
            "latency_ms_p50": sorted(r["latency_ms"] for r in results)[len(results) // 2] if results else 0,
        },
    }

    out_path = OUT_DIR / "tier15_ignav.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Output: {out_path}")
    return 0 if has_key and report["summary"]["success_count"] > 0 else (2 if not has_key else 1)


if __name__ == "__main__":
    sys.exit(main())
