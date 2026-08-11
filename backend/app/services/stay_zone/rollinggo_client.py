"""RollingGo MCP JSON-RPC client (HOT-RG-02).

Same endpoint/auth as Cursor MCP; Key only from Settings / env.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

_RPC_ID = 1


def rollinggo_configured(settings: Settings) -> bool:
    return bool((settings.rollinggo_mcp_api_key or "").strip())


def mcp_tools_call(
    settings: Settings,
    *,
    name: str,
    arguments: dict[str, Any],
    timeout_sec: float | None = None,
) -> dict[str, Any]:
    """Call MCP tools/call; return parsed tool payload (structuredContent or text JSON).

    Raises httpx.HTTPError / ValueError on transport or protocol failure.
    """
    key = (settings.rollinggo_mcp_api_key or "").strip()
    if not key:
        raise ValueError("ROLLINGGO_MCP_API_KEY 未配置")
    url = (settings.rollinggo_mcp_url or "https://mcp.rollinggo.cn/mcp").strip().rstrip("/")
    timeout = timeout_sec if timeout_sec is not None else float(settings.rollinggo_mcp_timeout_sec or 45)
    payload = {
        "jsonrpc": "2.0",
        "id": _RPC_ID,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
        )
        resp.raise_for_status()
        body = resp.json()
    if not isinstance(body, dict):
        raise ValueError("RollingGo MCP 返回非对象")
    if body.get("error"):
        err = body["error"]
        raise ValueError(str(err.get("message") or err)[:240])
    result = body.get("result")
    if not isinstance(result, dict):
        raise ValueError("RollingGo MCP result 缺失")
    if result.get("isError"):
        # Still may contain useful text
        content = result.get("content") or []
        msg = ""
        if isinstance(content, list) and content:
            msg = str((content[0] or {}).get("text") or "")[:240]
        raise ValueError(msg or "RollingGo tools/call isError")
    structured = result.get("structuredContent")
    if isinstance(structured, dict) and structured:
        return structured
    content = result.get("content") or []
    if isinstance(content, list):
        for chunk in content:
            if not isinstance(chunk, dict):
                continue
            text = chunk.get("text")
            if not text:
                continue
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as e:
                raise ValueError(f"RollingGo 结果非 JSON: {e}") from e
            if isinstance(parsed, dict):
                return parsed
    raise ValueError("RollingGo 无 structuredContent / JSON text")


def search_hotels_mcp(
    settings: Settings,
    *,
    origin_query: str,
    place: str,
    place_type: str,
    size: int = 8,
    check_in_date: str = "",
    stay_nights: int = 1,
    adult_count: int = 2,
    max_price_per_night: float | None = None,
    distance_in_meter: int | None = None,
    country_code: str | None = None,
) -> dict[str, Any]:
    args: dict[str, Any] = {
        "originQuery": origin_query.strip(),
        "place": place.strip(),
        "placeType": place_type.strip(),
        "size": max(1, min(int(size), 20)),
    }
    check_in: dict[str, Any] = {}
    if (check_in_date or "").strip():
        check_in["checkInDate"] = check_in_date.strip()[:10]
    if stay_nights and stay_nights > 0:
        check_in["stayNights"] = int(min(stay_nights, 28))
    if adult_count and adult_count > 0:
        check_in["adultCount"] = int(adult_count)
    if check_in:
        args["checkInParam"] = check_in
    if country_code:
        args["countryCode"] = country_code.strip().upper()
    filt: dict[str, Any] = {}
    if distance_in_meter and distance_in_meter > 0:
        filt["distanceInMeter"] = int(distance_in_meter)
    if filt:
        args["filterOptions"] = filt
    tags: dict[str, Any] = {}
    if max_price_per_night is not None and max_price_per_night > 0:
        tags["maxPricePerNight"] = float(max_price_per_night)
    if tags:
        args["hotelTags"] = tags
    return mcp_tools_call(settings, name="searchHotels", arguments=args)
