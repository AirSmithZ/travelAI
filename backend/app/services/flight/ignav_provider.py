"""Ignav REST API — structured flight fares for App内查价."""

from __future__ import annotations

import time
import uuid
from typing import Any

import httpx

from app.config import Settings
from app.schemas.flight import FlightQuote, FlightSearchRequest
from app.services.flight.leg_normalize import snapshot_from_ignav_leg

IGNAV_BASE = "https://ignav.com"
DEFAULT_TIMEOUT_SEC = 120.0


def _headers(settings: Settings) -> dict[str, str]:
    key = (settings.ignav_api_key or "").strip()
    return {"Content-Type": "application/json", "X-Api-Key": key}


def normalize_ignav_itinerary(
    itinerary: dict[str, Any],
    *,
    origin_iata: str,
    dest_iata: str,
    purchase_url: str | None = None,
    is_round_trip: bool = False,
) -> FlightQuote | None:
    outbound = itinerary.get("outbound") or {}
    outbound_snap = snapshot_from_ignav_leg(
        outbound,
        origin_iata=origin_iata,
        dest_iata=dest_iata,
    )
    if not outbound_snap.depart_time and not outbound_snap.arrive_time:
        return None

    return_leg = None
    if is_round_trip:
        inbound = itinerary.get("inbound") or {}
        inbound_segments = inbound.get("segments") or []
        if inbound_segments:
            return_leg = snapshot_from_ignav_leg(
                inbound,
                origin_iata=dest_iata,
                dest_iata=origin_iata,
            )

    price_obj = itinerary.get("price") or {}
    amount = float(price_obj.get("amount") or 0)
    currency = str(price_obj.get("currency") or "USD")
    ignav_id = str(itinerary.get("ignav_id") or uuid.uuid4().hex[:12])
    trip_type = "round_trip" if return_leg else "one_way"

    return FlightQuote(
        id=f"ignav-{ignav_id}",
        origin_iata=outbound_snap.origin_iata,
        dest_iata=outbound_snap.dest_iata,
        airline=outbound_snap.airline,
        route_label=outbound_snap.route_label,
        depart_time=outbound_snap.depart_time,
        arrive_time=outbound_snap.arrive_time,
        duration_minutes=outbound_snap.duration_minutes,
        stops=outbound_snap.stops,
        flight_numbers=outbound_snap.flight_numbers,
        price_amount=amount,
        price_currency=currency,
        source="ignav",
        confidence="medium",
        purchase_url=purchase_url,
        bookability="reference_only",
        trip_type=trip_type,
        return_leg=return_leg,
    )


def _build_fare_payload(body: FlightSearchRequest, origin: str, dest: str) -> tuple[str, dict[str, Any]]:
    if body.return_date:
        return "/api/fares/round-trip", {
            "origin": origin,
            "destination": dest,
            "departure_date": body.date,
            "return_date": body.return_date,
            "adults": body.adults,
            "cabin_class": body.cabin,
        }
    return "/api/fares/one-way", {
        "origin": origin,
        "destination": dest,
        "departure_date": body.date,
        "adults": body.adults,
        "cabin_class": body.cabin,
    }


def fetch_booking_link(settings: Settings, ignav_id: str) -> str | None:
    key = (settings.ignav_api_key or "").strip()
    if not key:
        return None
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{IGNAV_BASE}/api/fares/booking-links",
                headers=_headers(settings),
                json={"ignav_id": ignav_id},
            )
        body: dict[str, Any] = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            return None
        for opt in body.get("booking_options") or []:
            for link in opt.get("links") or []:
                url = link.get("url")
                if url:
                    return str(url)
    except Exception:
        return None
    return None


def search_ignav(
    body: FlightSearchRequest,
    settings: Settings,
    *,
    origin_iata: str,
    dest_iata: str,
) -> tuple[list[FlightQuote], int, str | None]:
    key = (settings.ignav_api_key or "").strip()
    if not key:
        return [], 0, "IGNAV_API_KEY not configured"

    is_round_trip = bool(body.return_date)
    path, payload = _build_fare_payload(body, origin_iata, dest_iata)
    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT_SEC) as client:
            resp = client.post(f"{IGNAV_BASE}{path}", headers=_headers(settings), json=payload)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        raw: dict[str, Any] = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            err = raw.get("error") or {}
            msg = err.get("message") or resp.text[:300]
            return [], latency_ms, f"ignav: {msg}"

        offers: list[FlightQuote] = []
        trip_purchase = None
        for itin in raw.get("itineraries") or []:
            quote = normalize_ignav_itinerary(
                itin,
                origin_iata=origin_iata,
                dest_iata=dest_iata,
                purchase_url=trip_purchase,
                is_round_trip=is_round_trip,
            )
            if quote:
                offers.append(quote)

        if offers:
            cheapest = min(offers, key=lambda o: o.price_amount or float("inf"))
            ignav_id = cheapest.id.removeprefix("ignav-")
            link = fetch_booking_link(settings, ignav_id)
            if link:
                idx = offers.index(cheapest)
                offers[idx] = cheapest.model_copy(update={"purchase_url": link})

        if not offers:
            return [], latency_ms, "ignav: no itineraries in response"
        return offers, latency_ms, None
    except httpx.TimeoutException:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, f"ignav: timeout after {DEFAULT_TIMEOUT_SEC}s"
    except Exception as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, f"ignav: {e!r}"
