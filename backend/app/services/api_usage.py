"""OPS-01: in-process API usage ledger (dev ops dashboard; never blocks callers)."""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

# Session-only heuristic (UNRELIABLE). Prefer ops_provider_accounts official APIs.
DEFAULT_UNIT_COST: dict[str, dict[str, float]] = {
    "llm": {"per_1k_prompt": 0.0, "per_1k_completion": 0.0},  # use DeepSeek /user/balance
    "tikhub": {"per_call": 0.0},
    "tavily": {"per_call": 0.0},
    "serpapi": {"per_call": 0.0},
    "qweather": {"per_call": 0.0},
    "ignav": {"per_call": 0.0},
}

_MAX_EVENTS = 200


@dataclass
class _Agg:
    calls: int = 0
    ok: int = 0
    fail: int = 0
    latency_ms_sum: int = 0
    latencies: list[int] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def add(
        self,
        *,
        ok: bool,
        latency_ms: int,
        prompt_tokens: int | None,
        completion_tokens: int | None,
    ) -> None:
        self.calls += 1
        if ok:
            self.ok += 1
        else:
            self.fail += 1
        ms = max(0, int(latency_ms or 0))
        self.latency_ms_sum += ms
        self.latencies.append(ms)
        if len(self.latencies) > 500:
            self.latencies = self.latencies[-500:]
        if prompt_tokens:
            self.prompt_tokens += int(prompt_tokens)
        if completion_tokens:
            self.completion_tokens += int(completion_tokens)


def _percentile(sorted_vals: list[int], p: float) -> int | None:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    idx = int(round((len(sorted_vals) - 1) * p))
    return sorted_vals[max(0, min(idx, len(sorted_vals) - 1))]


class ApiUsageLedger:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._started_at = time.time()
        self._by_provider: dict[str, _Agg] = {}
        self._events: deque[dict[str, Any]] = deque(maxlen=_MAX_EVENTS)

    def record(
        self,
        provider: str,
        op: str,
        *,
        ok: bool = True,
        latency_ms: int = 0,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        error: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> None:
        """Never raises — safe to call from any provider path."""
        try:
            prov = (provider or "unknown").strip().lower() or "unknown"
            operation = (op or "call").strip() or "call"
            with self._lock:
                agg = self._by_provider.setdefault(prov, _Agg())
                agg.add(
                    ok=ok,
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
                evt: dict[str, Any] = {
                    "ts": time.time(),
                    "provider": prov,
                    "op": operation,
                    "ok": ok,
                    "latency_ms": max(0, int(latency_ms or 0)),
                }
                if prompt_tokens is not None:
                    evt["prompt_tokens"] = int(prompt_tokens)
                if completion_tokens is not None:
                    evt["completion_tokens"] = int(completion_tokens)
                if error:
                    evt["error"] = str(error)[:240]
                if meta:
                    evt["meta"] = meta
                self._events.appendleft(evt)
        except Exception:
            pass

    def reset(self) -> None:
        with self._lock:
            self._by_provider.clear()
            self._events.clear()
            self._started_at = time.time()

    def snapshot(self, unit_cost: dict[str, dict[str, float]] | None = None) -> dict[str, Any]:
        costs = unit_cost or DEFAULT_UNIT_COST
        with self._lock:
            providers: list[dict[str, Any]] = []
            total_est = 0.0
            for name in sorted(self._by_provider.keys()):
                agg = self._by_provider[name]
                lats = sorted(agg.latencies)
                est = _estimate_cost(name, agg, costs)
                total_est += est
                err_rate = (agg.fail / agg.calls) if agg.calls else 0.0
                providers.append(
                    {
                        "provider": name,
                        "calls": agg.calls,
                        "ok": agg.ok,
                        "fail": agg.fail,
                        "error_rate": round(err_rate, 4),
                        "latency_p50_ms": _percentile(lats, 0.5),
                        "latency_p95_ms": _percentile(lats, 0.95),
                        "prompt_tokens": agg.prompt_tokens,
                        "completion_tokens": agg.completion_tokens,
                        "estimated_cost_usd": round(est, 6),
                    }
                )
            events = list(self._events)[:80]
            return {
                "started_at": self._started_at,
                "uptime_sec": int(time.time() - self._started_at),
                "note": "进程内会话计数；费用请看官方 accounts，勿用 Est.$",
                "providers": providers,
                "estimated_cost_usd_total": round(total_est, 6),
                "recent": events,
            }


def _estimate_cost(provider: str, agg: _Agg, costs: dict[str, dict[str, float]]) -> float:
    table = costs.get(provider) or {}
    if provider == "llm":
        pin = float(table.get("per_1k_prompt", 0.0))
        pout = float(table.get("per_1k_completion", 0.0))
        return (agg.prompt_tokens / 1000.0) * pin + (agg.completion_tokens / 1000.0) * pout
    per = float(table.get("per_call", 0.0))
    return agg.calls * per


_LEDGER = ApiUsageLedger()


def get_usage_ledger() -> ApiUsageLedger:
    return _LEDGER


def record_usage(
    provider: str,
    op: str,
    *,
    ok: bool = True,
    latency_ms: int = 0,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    error: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    _LEDGER.record(
        provider,
        op,
        ok=ok,
        latency_ms=latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        error=error,
        meta=meta,
    )
