from __future__ import annotations

import re
import subprocess
import time
import uuid
from datetime import datetime, timezone

from app.config import Settings
from app.schemas.flight import FlightQuote, FlightSearchRequest
from app.services.flight.city_codes import resolve_search_iata

_ROW_RE = re.compile(
    r"^\│\s*(\d+)\s*\│\s*(?:USD|CNY|EUR|SGD)?\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*(\d+)\s*\│",
    re.MULTILINE,
)
_PRICE_RE = re.compile(
    r"^\│\s*\│\s*(?:USD|CNY|EUR|SGD)\s*\│\s*([\d.]+)",
    re.MULTILINE,
)
_DURATION_RE = re.compile(r"(\d+)h\s*(\d+)m|(\d+)h|(\d+)m")


def _parse_duration_minutes(text: str) -> int:
    text = text.strip()
    match = _DURATION_RE.search(text)
    if not match:
        return 0
    if match.group(1) and match.group(2):
        return int(match.group(1)) * 60 + int(match.group(2))
    if match.group(3):
        return int(match.group(3)) * 60
    if match.group(4):
        return int(match.group(4))
    return 0


def parse_letsfg_stdout(
    stdout: str,
    *,
    origin_iata: str,
    dest_iata: str,
    currency: str,
    fetched_at: str,
) -> list[FlightQuote]:
    offers: list[FlightQuote] = []
    lines = stdout.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        match = _ROW_RE.match(line)
        if not match:
            i += 1
            continue
        idx, airline, route, depart, arrive, duration_str, stops_str = match.groups()
        price = 0.0
        if i + 1 < len(lines):
            price_match = _PRICE_RE.match(lines[i + 1])
            if price_match:
                price = float(price_match.group(1))
                i += 1
        airline = airline.strip().replace("…", "").strip()
        offers.append(
            FlightQuote(
                id=f"letsfg-{idx}-{uuid.uuid4().hex[:8]}",
                origin_iata=origin_iata,
                dest_iata=dest_iata,
                airline=airline,
                route_label=route.strip(),
                depart_time=depart.strip(),
                arrive_time=arrive.strip(),
                duration_minutes=_parse_duration_minutes(duration_str),
                stops=int(stops_str.strip()),
                price_amount=price,
                price_currency=currency,
                source="letsfg",
                confidence="medium",
                bookability="reference_only",
            )
        )
        i += 1
    return offers


def search_letsfg(
    body: FlightSearchRequest,
    settings: Settings,
) -> tuple[list[FlightQuote], int, str | None]:
    origin = resolve_search_iata(body.origin)
    dest = resolve_search_iata(body.destination)
    currency = settings.tripcom_default_currency or "CNY"
    cmd = [
        "letsfg",
        "search",
        origin,
        dest,
        body.date,
        "--mode",
        "fast",
        "--limit",
        "20",
        "--currency",
        currency,
    ]
    if body.return_date:
        cmd.extend(["--return", body.return_date])
    if body.adults != 1:
        cmd.extend(["--adults", str(body.adults)])

    fetched_at = datetime.now(timezone.utc).isoformat()
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.flight_letsfg_timeout_sec,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        if proc.returncode != 0 and not (proc.stdout or "").strip():
            return [], latency_ms, (proc.stderr or "")[:500] or f"exit {proc.returncode}"
        offers = parse_letsfg_stdout(
            proc.stdout or "",
            origin_iata=origin,
            dest_iata=dest,
            currency=currency,
            fetched_at=fetched_at,
        )
        if not offers:
            return [], latency_ms, "no offers parsed from LetsFG output"
        return offers, latency_ms, None
    except subprocess.TimeoutExpired:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, f"timeout after {settings.flight_letsfg_timeout_sec}s"
    except FileNotFoundError:
        return [], 0, "letsfg not installed (pip install letsfg)"
