#!/usr/bin/env python3
"""Search flights and rank by price/time preference (no booking)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from flight_spike.models import SearchRequest  # noqa: E402
from flight_spike.pipeline import search_and_rank  # noqa: E402


def _print_human(result) -> None:
    print(f"\n航线: {result.request.origin} → {result.request.destination}  {result.request.date}")
    print(f"偏好: {result.request.preference}")
    print(f"Deep Link: {result.deeplink}")
    print(f"数据源: {', '.join(result.sources_used)}")
    if result.latency_ms:
        print(f"延迟: {result.latency_ms}")
    if result.errors:
        print(f"错误: {result.errors}")
    print()
    if not result.ranked:
        print("（无结构化报价，请打开 Deep Link 自行比价）\n")
        return
    print("性价比推荐 Top", len(result.ranked))
    print("-" * 72)
    for o in result.ranked:
        print(
            f"#{o.rank}  {o.airline:12}  {o.price_currency} {o.price_amount:8.2f}  "
            f"{o.duration_minutes:4}min  {o.stops}停  "
            f"{o.depart_time}→{o.arrive_time}  [{o.source}]"
        )
        print(f"     {o.route_label}  — {o.rank_reason}  (score={o.score})")
    print()


def main() -> int:
    p = argparse.ArgumentParser(description="Flight search + value ranking (no booking)")
    p.add_argument("origin", help="IATA origin, e.g. PVG")
    p.add_argument("destination", help="IATA destination, e.g. SIN")
    p.add_argument("date", help="YYYY-MM-DD")
    p.add_argument(
        "--preference",
        choices=["cheap", "fast", "balanced"],
        default="balanced",
        help="Ranking preference",
    )
    p.add_argument("--return", dest="return_date", default=None, help="Return date YYYY-MM-DD")
    p.add_argument("--adults", type=int, default=1)
    p.add_argument("--currency", default="CNY")
    p.add_argument("--top", type=int, default=5)
    p.add_argument("--no-letsfg", action="store_true", help="Deep link only, skip LetsFG")
    p.add_argument("--no-duffel", action="store_true", help="Skip Duffel even if token set")
    p.add_argument("--letsfg-timeout", type=int, default=300)
    p.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Write JSON result to file",
    )
    p.add_argument("--json-only", action="store_true", help="Print JSON only, no table")
    args = p.parse_args()

    req = SearchRequest(
        origin=args.origin.upper(),
        destination=args.destination.upper(),
        date=args.date,
        return_date=args.return_date,
        adults=args.adults,
        currency=args.currency,
        preference=args.preference,
        letsfg_timeout_sec=args.letsfg_timeout,
        include_letsfg=not args.no_letsfg,
        include_duffel=not args.no_duffel,
    )

    result = search_and_rank(req, top_n=args.top)
    payload = result.to_dict()

    out_path = args.output
    if out_path is None:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        out_dir = ROOT / "output" / day
        out_dir.mkdir(parents=True, exist_ok=True)
        slug = f"{req.origin}-{req.destination}-{req.date}-{req.preference}"
        out_path = out_dir / f"search_rank_{slug}.json"

    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.json_only:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _print_human(result)
        print(f"JSON 已写入: {out_path}")

    return 0 if (result.ranked or result.deeplink) else 1


if __name__ == "__main__":
    sys.exit(main())
