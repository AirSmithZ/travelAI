"""Shared SerpApi circuit breaker (SERP-BUDGET-01).

When any Serp call hits 429 / explicit rate limit, open the circuit so geocode,
lodging, and directions skip upstream until backoff elapses.
"""

from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_open_until_mono: float = 0.0
_DEFAULT_BACKOFF_SEC = 120.0


def clear_serp_circuit() -> None:
    """Tests / ops."""
    global _open_until_mono
    with _lock:
        _open_until_mono = 0.0


def serp_circuit_open() -> bool:
    with _lock:
        return time.monotonic() < _open_until_mono


def serp_circuit_remaining_sec() -> float:
    with _lock:
        rem = _open_until_mono - time.monotonic()
        return max(0.0, rem)


def record_serp_rate_limit(backoff_sec: float | None = None) -> None:
    """Open (or extend) the circuit after a rate-limit signal."""
    global _open_until_mono
    sec = float(backoff_sec) if backoff_sec is not None else _DEFAULT_BACKOFF_SEC
    if sec <= 0:
        sec = _DEFAULT_BACKOFF_SEC
    until = time.monotonic() + sec
    with _lock:
        if until > _open_until_mono:
            _open_until_mono = until


def serp_backoff_from_settings(settings: object | None = None) -> float:
    if settings is None:
        return _DEFAULT_BACKOFF_SEC
    try:
        return float(getattr(settings, "serp_circuit_backoff_sec", _DEFAULT_BACKOFF_SEC) or _DEFAULT_BACKOFF_SEC)
    except (TypeError, ValueError):
        return _DEFAULT_BACKOFF_SEC
