#!/usr/bin/env python3
"""WS-09 Phase 0: bench Evidence providers → isomorphic EvidenceItem[] (doc 21).

Usage:
  PYTHONPATH=backend python backend/scripts/bench_evidence_providers.py \\
    --cases backend/fixtures/evidence_bench_cases.yaml \\
    --providers tikhub,tavily,tavily_authority \\
    --out .tmp/evidence_bench/
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from app.config import get_settings  # noqa: E402
from app.services.ugc.filter_evidence import filter_evidence_items  # noqa: E402
from app.services.ugc.tikhub import (  # noqa: E402
    EvidenceItem,
    build_evidence_pack,
    evidence_queries,
)


def _load_cases(path: Path) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return list(data.get("cases") or [])


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _urls(items: list[EvidenceItem]) -> set[str]:
    return {i.url for i in items if i.url}


def _domain_share(items: list[EvidenceItem]) -> dict[str, float]:
    if not items:
        return {}
    counts: dict[str, int] = {}
    for i in items:
        host = urlparse(i.url).netloc.lower() or "unknown"
        counts[host] = counts.get(host, 0) + 1
    n = len(items)
    return {k: round(v / n, 3) for k, v in sorted(counts.items(), key=lambda x: -x[1])[:8]}


def _gold_hit(items: list[EvidenceItem], gold: list[str]) -> float:
    if not gold:
        return 0.0
    blob = " ".join(f"{i.title} {i.snippet}" for i in items)
    hits = sum(1 for g in gold if g and g in blob)
    return round(hits / len(gold), 3)


def _run_provider(
    provider: str,
    destination: str,
    day_count: int,
    settings: Any,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    error: str | None = None
    items: list[EvidenceItem] = []
    try:
        if provider == "tikhub":
            items = build_evidence_pack(destination, day_count, settings=settings)
        elif provider == "tavily":
            from app.services.ugc.providers.tavily import search_tavily

            q = evidence_queries(destination, day_count)[0]
            items = search_tavily(q, settings=settings, source="tavily")
            items = filter_evidence_items(items, destination=destination)
        elif provider == "tavily_authority":
            from app.services.ugc.providers.tavily import search_tavily_authority

            items = search_tavily_authority(destination, settings=settings)
        elif provider == "agent_reach_xhs":
            error = "CLI provider stub — use --allow-cli only for local research; not implemented"
        else:
            error = f"unknown provider {provider}"
    except Exception as e:
        error = f"{type(e).__name__}: {e}"
    latency_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "latency_ms": latency_ms,
        "error": error,
        "items": [i.model_dump(exclude_none=True) for i in items],
        "_items": items,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Bench evidence providers")
    ap.add_argument(
        "--cases",
        type=Path,
        default=BACKEND / "fixtures" / "evidence_bench_cases.yaml",
    )
    ap.add_argument(
        "--providers",
        default="tikhub,tavily,tavily_authority",
        help="Comma-separated provider ids",
    )
    ap.add_argument("--out", type=Path, default=ROOT / ".tmp" / "evidence_bench")
    ap.add_argument("--allow-cli", action="store_true", help="Allow agent_reach_xhs stub")
    args = ap.parse_args()

    providers = [p.strip() for p in args.providers.split(",") if p.strip()]
    if "agent_reach_xhs" in providers and not args.allow_cli:
        print("agent_reach_xhs requires --allow-cli", file=sys.stderr)
        return 2

    settings = get_settings()
    cases = _load_cases(args.cases)
    args.out.mkdir(parents=True, exist_ok=True)

    summary_rows: list[str] = []
    for case in cases:
        case_id = case["id"]
        dest = case["destination"]
        days = int(case.get("day_count") or 3)
        gold = list(case.get("gold_pois") or [])
        queries = evidence_queries(dest, days)
        provider_out: dict[str, Any] = {}
        url_sets: dict[str, set[str]] = {}

        for pid in providers:
            raw = _run_provider(pid, dest, days, settings)
            items: list[EvidenceItem] = raw.pop("_items")
            provider_out[pid] = raw
            url_sets[pid] = _urls(items)

        jaccard: dict[str, float] = {}
        keys = list(url_sets.keys())
        for i, a in enumerate(keys):
            for b in keys[i + 1 :]:
                jaccard[f"{a}_{b}"] = round(_jaccard(url_sets[a], url_sets[b]), 3)

        gold_poi_hit = {
            pid: _gold_hit(
                [EvidenceItem.model_validate(x) for x in provider_out[pid]["items"]],
                gold,
            )
            for pid in providers
            if not provider_out[pid].get("error")
        }

        payload = {
            "case_id": case_id,
            "destination": dest,
            "day_count": days,
            "queries": queries,
            "providers": {
                k: {kk: vv for kk, vv in v.items() if kk != "_items"}
                for k, v in provider_out.items()
            },
            "metrics": {
                "jaccard": jaccard,
                "domain_share": {
                    pid: _domain_share(
                        [EvidenceItem.model_validate(x) for x in provider_out[pid]["items"]]
                    )
                    for pid in providers
                },
                "gold_poi_hit": gold_poi_hit,
            },
        }
        out_path = args.out / f"{case_id}.json"
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        hits = " ".join(f"{k}={v}" for k, v in gold_poi_hit.items())
        summary_rows.append(f"{case_id}: gold_hit {hits}")
        print(f"wrote {out_path}")

    print("---")
    for row in summary_rows:
        print(row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
