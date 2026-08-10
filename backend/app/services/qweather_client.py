"""Shared QWeather HTTP helpers (API Host + X-QW-Api-Key).

See https://dev.qweather.com/docs/configuration/api-config/
and https://dev.qweather.com/docs/configuration/api-host/
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

# Shared hosts retired in Console V4; each account has a dedicated *.qweatherapi.com host.
_LEGACY_SHARED_HOSTS = frozenset(
    {
        "devapi.qweather.com",
        "api.qweather.com",
        "geoapi.qweather.com",
    }
)


def qweather_api_key(settings: Settings) -> str:
    return (settings.qweather_api_key or "").strip()


def qweather_host(settings: Settings) -> str | None:
    """Return configured API Host origin, or None if missing / legacy shared."""
    raw = (settings.qweather_api_host or "").strip().rstrip("/")
    if not raw:
        logger.warning(
            "QWEATHER_API_HOST unset — use Console → Settings dedicated host "
            "(*.qweatherapi.com), not devapi/api.qweather.com"
        )
        return None
    host = (urlparse(raw).hostname or "").lower()
    if host in _LEGACY_SHARED_HOSTS:
        logger.warning(
            "QWEATHER_API_HOST=%s is a retired shared domain (403 Invalid Host). "
            "Replace with your dedicated host from Console → Settings "
            "(e.g. https://xxxx.yy.qweatherapi.com)",
            raw,
        )
        return None
    return raw


def qweather_auth_headers(settings: Settings) -> dict[str, str] | None:
    """Official API KEY auth: Header X-QW-Api-Key (do not also pass query key)."""
    key = qweather_api_key(settings)
    if not key:
        return None
    return {"X-QW-Api-Key": key}


def qweather_get_json(
    path: str,
    *,
    settings: Settings,
    params: dict[str, Any] | None = None,
    timeout: float = 10.0,
) -> tuple[dict[str, Any] | None, int, str | None]:
    """
    GET JSON from QWeather.

    Returns (data, latency_ms, error). error is a short code/message when failed.
    """
    host = qweather_host(settings)
    headers = qweather_auth_headers(settings)
    if not host or not headers:
        return None, 0, "unconfigured"

    url = f"{host}{path if path.startswith('/') else '/' + path}"
    # Drop legacy query `key` if callers pass it — header-only per auth docs.
    clean_params = {k: v for k, v in (params or {}).items() if k != "key"}

    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, params=clean_params or None, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        ms = int((time.perf_counter() - t0) * 1000)
    except Exception as e:
        ms = int((time.perf_counter() - t0) * 1000)
        return None, ms, str(e)[:200]

    if not isinstance(data, dict):
        return None, ms, "bad_json"
    return data, ms, None
