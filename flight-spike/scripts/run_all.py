#!/usr/bin/env python3
"""Run Tier 0–3 flight spike validations; write JSON to output/YYYY-MM-DD/."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "routes.json"
OUT_DIR = ROOT / "output" / datetime.now(timezone.utc).strftime("%Y-%m-%d")


def load_routes() -> list[dict]:
    return json.loads(FIXTURES.read_text(encoding="utf-8"))


def google_flights_url(origin: str, dest: str, date: str) -> str:
    q = quote(f"Flights {origin} to {dest} on {date}")
    return f"https://www.google.com/travel/flights?q={q}"


def tier0(routes: list[dict]) -> dict:
    results = []
    for r in routes:
        url = google_flights_url(r["origin"], r["destination"], r["date"])
        results.append(
            {
                "route_id": r["id"],
                "success": True,
                "latency_ms": 0,
                "url": url,
            }
        )
    return {"tier": 0, "source": "deeplink", "results": results}


def tier1_letsfg(route: dict, timeout_sec: int = 180) -> dict:
    cmd = [
        "letsfg",
        "search",
        route["origin"],
        route["destination"],
        route["date"],
        "--mode",
        "fast",
        "--limit",
        "5",
        "--currency",
        "USD",
    ]
    if route.get("return_date"):
        cmd.extend(["--return", route["return_date"]])
    if route.get("adults", 1) != 1:
        cmd.extend(["--adults", str(route["adults"])])

    started = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            cwd=ROOT,
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        success = proc.returncode == 0 and len(stdout.strip()) > 0
        return {
            "route_id": route["id"],
            "success": success,
            "latency_ms": latency_ms,
            "returncode": proc.returncode,
            "stdout_preview": stdout[:4000],
            "stderr_preview": stderr[:2000],
            "cmd": " ".join(cmd),
        }
    except subprocess.TimeoutExpired as e:
        latency_ms = int((time.perf_counter() - started) * 1000)
        out = (e.stdout or b"").decode("utf-8", errors="replace")[:2000]
        return {
            "route_id": route["id"],
            "success": False,
            "latency_ms": latency_ms,
            "error": f"timeout after {timeout_sec}s",
            "stdout_preview": out,
            "cmd": " ".join(cmd),
        }


def tier2_flights_lib(route: dict) -> dict:
    started = time.perf_counter()
    try:
        from fast_flights import FlightQuery, Passengers, create_query, get_flights

        q = create_query(
            flights=[
                FlightQuery(
                    date=route["date"],
                    from_airport=route["origin"],
                    to_airport=route["destination"],
                )
            ],
            trip="one-way",
            passengers=Passengers(adults=route.get("adults", 1)),
            seat="economy",
            currency="USD",
        )
        result = get_flights(q)
        latency_ms = int((time.perf_counter() - started) * 1000)
        flights = getattr(result, "flights", None) or []
        preview = [
            {
                "name": getattr(f, "name", str(f)),
                "price": getattr(f, "price", None),
                "departure": getattr(f, "departure", None),
                "arrival": getattr(f, "arrival", None),
            }
            for f in list(flights)[:5]
        ]
        return {
            "route_id": route["id"],
            "success": len(flights) > 0,
            "latency_ms": latency_ms,
            "offer_count": len(flights),
            "preview": preview,
            "library": "fast-flights",
        }
    except ImportError:
        return {
            "route_id": route["id"],
            "success": False,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "error": "fast-flights not installed (pip install fast-flights)",
        }
    except Exception as e:
        return {
            "route_id": route["id"],
            "success": False,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "error": repr(e),
            "library": "fast-flights",
        }


def tier3_duffel(route: dict) -> dict:
    token = os.environ.get("DUFFEL_TOKEN", "").strip()
    if not token:
        return {
            "route_id": route["id"],
            "success": False,
            "skipped": True,
            "error": "DUFFEL_TOKEN not set",
        }

    import httpx

    payload = {
        "data": {
            "slices": [
                {
                    "origin": route["origin"],
                    "destination": route["destination"],
                    "departure_date": route["date"],
                }
            ],
            "passengers": [{"type": "adult"}] * route.get("adults", 1),
            "cabin_class": route.get("cabin", "economy"),
        }
    }
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                "https://api.duffel.com/air/offer_requests",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Duffel-Version": "v2",
                    "Accept-Encoding": "gzip",
                },
                json=payload,
            )
        latency_ms = int((time.perf_counter() - started) * 1000)
        body = resp.json() if resp.content else {}
        offers = body.get("data", {}).get("offers") or []
        return {
            "route_id": route["id"],
            "success": resp.status_code == 200 and len(offers) > 0,
            "latency_ms": latency_ms,
            "status_code": resp.status_code,
            "offer_count": len(offers),
            "first_offer_preview": offers[0] if offers else None,
            "error_body": body if resp.status_code >= 400 else None,
        }
    except Exception as e:
        return {
            "route_id": route["id"],
            "success": False,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "error": repr(e),
        }


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    routes = load_routes()
    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "tiers": {},
    }

    t0 = tier0(routes)
    report["tiers"]["0_deeplink"] = t0
    (OUT_DIR / "tier0_deeplink.json").write_text(
        json.dumps(t0, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Tier 0 OK", len(t0["results"]), "routes")

    t1_results = []
    for r in routes:
        print(f"Tier 1 LetsFG {r['id']} ...", flush=True)
        t1_results.append(tier1_letsfg(r))
        print(f"  -> success={t1_results[-1]['success']} ms={t1_results[-1].get('latency_ms')}")
    report["tiers"]["1_letsfg"] = t1_results
    (OUT_DIR / "tier1_letsfg.json").write_text(
        json.dumps(t1_results, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    t2_results = []
    for r in routes:
        if r["id"] == "duffel-sandbox":
            continue
        print(f"Tier 2 fast_flights {r['id']} ...", flush=True)
        t2_results.append(tier2_flights_lib(r))
        print(f"  -> success={t2_results[-1]['success']} offers={t2_results[-1].get('offer_count')}")
    report["tiers"]["2_fast_flights"] = t2_results
    (OUT_DIR / "tier2_fast_flights.json").write_text(
        json.dumps(t2_results, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    duffel_route = next(x for x in routes if x["id"] == "duffel-sandbox")
    print("Tier 3 Duffel ...", flush=True)
    t3 = tier3_duffel(duffel_route)
    report["tiers"]["3_duffel"] = t3
    (OUT_DIR / "tier3_duffel.json").write_text(
        json.dumps(t3, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  -> success={t3.get('success')} skipped={t3.get('skipped')}")

    (OUT_DIR / "summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    print("Output:", OUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
