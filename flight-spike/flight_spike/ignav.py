"""Ignav flight search API client (Tier 1.5 spike)."""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from flight_spike.models import FlightOffer, SearchRequest

IGNAV_BASE = "https://ignav.com"
DEFAULT_TIMEOUT_SEC = 120.0


def _api_key() -> str:
    return os.environ.get("IGNAV_API_KEY", "").strip()


def _headers() -> dict[str, str]:
    key = _api_key()
    if not key:
        return {"Content-Type": "application/json"}
    return {"Content-Type": "application/json", "X-Api-Key": key}


def _segment_stops(segments: list[dict[str, Any]]) -> int:
    return max(0, len(segments) - 1)


def _leg_label(segments: list[dict[str, Any]]) -> str:
    if not segments:
        return ""
    parts = [segments[0].get("departure_airport", "")]
    for seg in segments:
        parts.append(seg.get("arrival_airport", ""))
    return "→".join(p for p in parts if p)


def _leg_times(segments: list[dict[str, Any]]) -> tuple[str, str]:
    if not segments:
        return "", ""
    depart = segments[0].get("departure_time_local") or segments[0].get("departure_time_utc") or ""
    arrive = segments[-1].get("arrival_time_local") or segments[-1].get("arrival_time_utc") or ""
    return str(depart), str(arrive)


def normalize_itinerary(
    itinerary: dict[str, Any],
    *,
    origin_iata: str,
    dest_iata: str,
    fetched_at: str,
    booking_url: str | None = None,
) -> FlightOffer:
    outbound = itinerary.get("outbound") or {}
    segments = outbound.get("segments") or []
    carrier = outbound.get("carrier") or ""
    if not carrier and segments:
        carrier = segments[0].get("operating_carrier_name") or segments[0].get("marketing_carrier_code") or ""

    price_obj = itinerary.get("price") or {}
    amount = float(price_obj.get("amount") or 0)
    currency = str(price_obj.get("currency") or "USD")
    duration = int(outbound.get("duration_minutes") or 0)
    if not duration and segments:
        duration = sum(int(s.get("duration_minutes") or 0) for s in segments)

    depart_time, arrive_time = _leg_times(segments)

    return FlightOffer(
        id=f"ignav-{itinerary.get('ignav_id', uuid.uuid4().hex[:8])}",
        origin_iata=origin_iata.upper(),
        dest_iata=dest_iata.upper(),
        airline=str(carrier),
        route_label=_leg_label(segments),
        depart_time=depart_time,
        arrive_time=arrive_time,
        duration_minutes=duration,
        stops=_segment_stops(segments),
        price_amount=amount,
        price_currency=currency,
        source="ignav",
        confidence="medium",
        booking_deep_link=booking_url,
        fetched_at=fetched_at,
    )


def _build_fare_payload(req: SearchRequest) -> tuple[str, dict[str, Any]]:
    if req.return_date:
        return "/api/fares/round-trip", {
            "origin": req.origin.upper(),
            "destination": req.destination.upper(),
            "departure_date": req.date,
            "return_date": req.return_date,
            "adults": req.adults,
            "cabin_class": req.cabin,
        }
    return "/api/fares/one-way", {
        "origin": req.origin.upper(),
        "destination": req.destination.upper(),
        "departure_date": req.date,
        "adults": req.adults,
        "cabin_class": req.cabin,
    }


def search_ignav(req: SearchRequest) -> tuple[list[FlightOffer], int, dict[str, Any] | None]:
    """Search Ignav fares; returns (offers, latency_ms, error_info)."""
    if not _api_key():
        return [], 0, {
            "code": "missing_api_key",
            "message": "Set IGNAV_API_KEY in .env (register at https://ignav.com/)",
        }

    path, payload = _build_fare_payload(req)
    fetched_at = datetime.now(timezone.utc).isoformat()
    t0 = time.perf_counter()

    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT_SEC) as client:
            resp = client.post(f"{IGNAV_BASE}{path}", headers=_headers(), json=payload)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        body: dict[str, Any] = resp.json() if resp.content else {}

        if resp.status_code >= 400:
            err = body.get("error") or {}
            return [], latency_ms, {
                "status_code": resp.status_code,
                "code": err.get("code") or f"http_{resp.status_code}",
                "message": err.get("message") or resp.text[:500],
                "type": err.get("type"),
            }

        itineraries = body.get("itineraries") or []
        offers: list[FlightOffer] = []
        for itin in itineraries:
            offers.append(
                normalize_itinerary(
                    itin,
                    origin_iata=req.origin,
                    dest_iata=req.destination,
                    fetched_at=fetched_at,
                )
            )

        # Fetch booking link for cheapest offer (optional, best-effort)
        if offers:
            cheapest = min(offers, key=lambda o: o.price_amount or float("inf"))
            ignav_id = cheapest.id.removeprefix("ignav-")
            link, _ = fetch_booking_links(ignav_id)
            if link:
                cheapest.booking_deep_link = link

        return offers, latency_ms, None
    except httpx.TimeoutException:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, {"code": "timeout", "message": f"timeout after {DEFAULT_TIMEOUT_SEC}s"}
    except Exception as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, {"code": "exception", "message": repr(e)}


def fetch_booking_links(ignav_id: str) -> tuple[str | None, dict[str, Any] | None]:
    """Return first booking URL for an itinerary ignav_id."""
    if not _api_key():
        return None, {"code": "missing_api_key", "message": "IGNAV_API_KEY not set"}

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{IGNAV_BASE}/api/fares/booking-links",
                headers=_headers(),
                json={"ignav_id": ignav_id},
            )
        body: dict[str, Any] = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            err = body.get("error") or {}
            return None, {
                "status_code": resp.status_code,
                "code": err.get("code"),
                "message": err.get("message"),
            }

        options = body.get("booking_options") or []
        for opt in options:
            for link in opt.get("links") or []:
                url = link.get("url")
                if url:
                    return str(url), None
        return None, {"code": "no_booking_links", "message": "booking_options empty"}
    except Exception as e:
        return None, {"code": "exception", "message": repr(e)}


def search_airports(query: str, *, limit: int = 3) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    if not _api_key():
        return [], {"code": "missing_api_key", "message": "IGNAV_API_KEY not set"}

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(
                f"{IGNAV_BASE}/api/airports",
                headers=_headers(),
                params={"q": query, "limit": limit},
            )
        body: dict[str, Any] = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            err = body.get("error") or {}
            return [], {"status_code": resp.status_code, "code": err.get("code"), "message": err.get("message")}
        airports = body.get("airports") or body.get("results") or []
        if isinstance(airports, list):
            return airports, None
        return [], {"code": "unexpected_shape", "message": "airports field missing"}
    except Exception as e:
        return [], {"code": "exception", "message": repr(e)}
