from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import httpx

from flight_spike.models import FlightOffer, SearchRequest


def _parse_iso_duration(iso: str | None) -> int:
    if not iso or not iso.startswith("PT"):
        return 0
    import re

    h = re.search(r"(\d+)H", iso)
    m = re.search(r"(\d+)M", iso)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


def search_duffel(req: SearchRequest) -> tuple[list[FlightOffer], int, str | None]:
    token = os.environ.get("DUFFEL_TOKEN", "").strip()
    if not token:
        return [], 0, "DUFFEL_TOKEN not set (skipped)"

    payload = {
        "data": {
            "slices": [
                {
                    "origin": req.origin.upper(),
                    "destination": req.destination.upper(),
                    "departure_date": req.date,
                }
            ],
            "passengers": [{"type": "adult"}] * req.adults,
            "cabin_class": req.cabin,
        }
    }
    fetched_at = datetime.now(timezone.utc).isoformat()
    import time

    t0 = time.perf_counter()
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
        latency_ms = int((time.perf_counter() - t0) * 1000)
        if resp.status_code >= 400:
            return [], latency_ms, f"HTTP {resp.status_code}: {resp.text[:300]}"

        body = resp.json()
        raw_offers = body.get("data", {}).get("offers") or []
        offers: list[FlightOffer] = []
        for o in raw_offers:
            slices = o.get("slices") or []
            if not slices:
                continue
            segs = (slices[0].get("segments") or [])
            if not segs:
                continue
            first, last = segs[0], segs[-1]
            owner = (o.get("owner") or {}).get("name") or "Unknown"
            stops = max(0, len(segs) - 1)
            offers.append(
                FlightOffer(
                    id=o.get("id") or f"duffel-{uuid.uuid4().hex[:8]}",
                    origin_iata=req.origin.upper(),
                    dest_iata=req.destination.upper(),
                    airline=owner,
                    route_label=f"{req.origin}→{req.destination}" + (f" ({stops} stop)" if stops else " (direct)"),
                    depart_time=(first.get("departing_at") or "")[11:16],
                    arrive_time=(last.get("arriving_at") or "")[11:16],
                    duration_minutes=_parse_iso_duration(slices[0].get("duration")),
                    stops=stops,
                    price_amount=float(o.get("total_amount") or 0),
                    price_currency=o.get("total_currency") or req.currency,
                    source="duffel",
                    confidence="high" if not token.startswith("duffel_test_") else "medium",
                    fetched_at=fetched_at,
                )
            )
        if not offers:
            return [], latency_ms, "no offers in Duffel response"
        return offers, latency_ms, None
    except Exception as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, repr(e)
