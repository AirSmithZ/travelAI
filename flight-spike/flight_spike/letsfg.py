from __future__ import annotations

import re
import subprocess
import uuid
from datetime import datetime, timezone

from flight_spike.models import FlightOffer, SearchRequest

# LetsFG table row: price on continuation line or same block
_ROW_RE = re.compile(
    r"^\│\s*(\d+)\s*\│\s*(?:USD|CNY|EUR|SGD)?\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*([^│]+?)\s*\│\s*(\d+)\s*\│",
    re.MULTILINE,
)
_PRICE_RE = re.compile(r"^\│\s*(?:USD|CNY|EUR|SGD)?\s*\│\s*([\d.]+)\s*\│", re.MULTILINE)
_DURATION_RE = re.compile(r"(\d+)h\s*(\d+)m|(\d+)h|(\d+)m")


def _parse_duration_minutes(text: str) -> int:
    text = text.strip()
    m = _DURATION_RE.search(text)
    if not m:
        return 0
    if m.group(1) and m.group(2):
        return int(m.group(1)) * 60 + int(m.group(2))
    if m.group(3):
        return int(m.group(3)) * 60
    if m.group(4):
        return int(m.group(4))
    return 0


def parse_letsfg_stdout(
    stdout: str,
    req: SearchRequest,
    *,
    fetched_at: str,
) -> list[FlightOffer]:
    """Parse LetsFG CLI table output into FlightOffer list."""
    offers: list[FlightOffer] = []
    lines = stdout.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        m = _ROW_RE.match(line)
        if not m:
            i += 1
            continue
        idx, airline, route, depart, arrive, duration_str, stops_str = m.groups()
        price = 0.0
        if i + 1 < len(lines):
            pm = _PRICE_RE.match(lines[i + 1])
            if pm:
                price = float(pm.group(1))
                i += 1
        airline = airline.strip().replace("…", "").strip()
        offers.append(
            FlightOffer(
                id=f"letsfg-{idx}-{uuid.uuid4().hex[:8]}",
                origin_iata=req.origin.upper(),
                dest_iata=req.destination.upper(),
                airline=airline,
                route_label=route.strip(),
                depart_time=depart.strip(),
                arrive_time=arrive.strip(),
                duration_minutes=_parse_duration_minutes(duration_str),
                stops=int(stops_str.strip()),
                price_amount=price,
                price_currency=req.currency,
                source="letsfg",
                confidence="medium",
                fetched_at=fetched_at,
            )
        )
        i += 1
    return offers


def search_letsfg(req: SearchRequest) -> tuple[list[FlightOffer], int, str | None]:
    cmd = [
        "letsfg",
        "search",
        req.origin.upper(),
        req.destination.upper(),
        req.date,
        "--mode",
        "fast",
        "--limit",
        "20",
        "--currency",
        req.currency,
    ]
    if req.return_date:
        cmd.extend(["--return", req.return_date])
    if req.adults != 1:
        cmd.extend(["--adults", str(req.adults)])

    fetched_at = datetime.now(timezone.utc).isoformat()
    import time

    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=req.letsfg_timeout_sec,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        if proc.returncode != 0 and not (proc.stdout or "").strip():
            return [], latency_ms, proc.stderr[:500] or f"exit {proc.returncode}"
        offers = parse_letsfg_stdout(proc.stdout or "", req, fetched_at=fetched_at)
        if not offers:
            return [], latency_ms, "no offers parsed from LetsFG output"
        return offers, latency_ms, None
    except subprocess.TimeoutExpired:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return [], latency_ms, f"timeout after {req.letsfg_timeout_sec}s"
    except FileNotFoundError:
        return [], 0, "letsfg not installed (pip install letsfg)"
