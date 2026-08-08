"""OPS-01b: pull official account/usage from provider APIs (soft-fail, cached)."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_CACHE_TTL_SEC = 60.0
_cache: dict[str, Any] = {"at": 0.0, "data": None}


def _deepseek_root(api_base: str) -> str:
    """https://api.deepseek.com/v1 → https://api.deepseek.com"""
    raw = (api_base or "https://api.deepseek.com").rstrip("/")
    if raw.endswith("/v1"):
        raw = raw[:-3]
    return raw or "https://api.deepseek.com"


def fetch_deepseek_balance(settings: Settings, *, timeout: float = 8.0) -> dict[str, Any]:
    key = (settings.deepseek_api_key or "").strip()
    if not key:
        return {"provider": "llm", "ok": False, "error": "DEEPSEEK_API_KEY not set"}
    url = f"{_deepseek_root(settings.deepseek_api_base)}/user/balance"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.info("deepseek balance fetch failed: %s", e)
        return {"provider": "llm", "ok": False, "error": str(e)[:200], "source": "GET /user/balance"}

    infos = data.get("balance_infos") if isinstance(data, dict) else None
    rows = []
    if isinstance(infos, list):
        for row in infos:
            if isinstance(row, dict):
                rows.append(
                    {
                        "currency": row.get("currency"),
                        "total_balance": row.get("total_balance"),
                        "granted_balance": row.get("granted_balance"),
                        "topped_up_balance": row.get("topped_up_balance"),
                    }
                )
    return {
        "provider": "llm",
        "ok": True,
        "source": "DeepSeek GET /user/balance",
        "is_available": bool(data.get("is_available")) if isinstance(data, dict) else None,
        "balances": rows,
        "summary": (
            f"{rows[0].get('currency')} {rows[0].get('total_balance')}"
            if rows
            else ("available" if data.get("is_available") else "unavailable")
        ),
    }


def fetch_serpapi_account(settings: Settings, *, timeout: float = 8.0) -> dict[str, Any]:
    key = (settings.serpapi_api_key or "").strip()
    if not key:
        return {"provider": "serpapi", "ok": False, "error": "SERPAPI_API_KEY not set"}
    base = (settings.serpapi_base_url or "https://serpapi.com").rstrip("/")
    url = f"{base}/account.json"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, params={"api_key": key})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.info("serpapi account fetch failed: %s", e)
        return {"provider": "serpapi", "ok": False, "error": str(e)[:200], "source": "GET /account.json"}

    if not isinstance(data, dict):
        return {"provider": "serpapi", "ok": False, "error": "bad_json"}
    left = data.get("total_searches_left")
    used = data.get("this_month_usage")
    plan = data.get("plan_name")
    return {
        "provider": "serpapi",
        "ok": True,
        "source": "SerpAPI Account API",
        "plan_name": plan,
        "searches_per_month": data.get("searches_per_month"),
        "this_month_usage": used,
        "plan_searches_left": data.get("plan_searches_left"),
        "total_searches_left": left,
        "extra_credits": data.get("extra_credits"),
        "plan_monthly_price": data.get("plan_monthly_price"),
        "plan_renewal_date": data.get("plan_renewal_date"),
        "summary": f"left {left} · used {used} · {plan or 'plan?'}",
    }


def fetch_tavily_usage(settings: Settings, *, timeout: float = 8.0) -> dict[str, Any]:
    key = (settings.tavily_api_key or "").strip()
    if not key:
        return {"provider": "tavily", "ok": False, "error": "TAVILY_API_KEY not set"}
    url = "https://api.tavily.com/usage"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, headers={"Authorization": f"Bearer {key}"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.info("tavily usage fetch failed: %s", e)
        return {"provider": "tavily", "ok": False, "error": str(e)[:200], "source": "GET /usage"}

    if not isinstance(data, dict):
        return {"provider": "tavily", "ok": False, "error": "bad_json"}
    key_info = data.get("key") if isinstance(data.get("key"), dict) else {}
    acct = data.get("account") if isinstance(data.get("account"), dict) else {}
    ku, kl = key_info.get("usage"), key_info.get("limit")
    au, al = acct.get("plan_usage"), acct.get("plan_limit")
    return {
        "provider": "tavily",
        "ok": True,
        "source": "Tavily GET /usage",
        "key_usage": ku,
        "key_limit": kl,
        "key_search_usage": key_info.get("search_usage"),
        "account_plan_usage": au,
        "account_plan_limit": al,
        "summary": f"key {ku}/{kl if kl is not None else '∞'} · plan {au}/{al if al is not None else '∞'}",
    }


def fetch_tikhub_user(settings: Settings, *, timeout: float = 8.0) -> dict[str, Any]:
    key = (settings.tikhub_api_key or "").strip()
    if not key:
        return {"provider": "tikhub", "ok": False, "error": "TIKHUB_API_KEY not set"}
    base = (settings.tikhub_api_base or "https://api.tikhub.io").rstrip("/")
    url = f"{base}/api/v1/tikhub/user/get_user_info"
    daily_url = f"{base}/api/v1/tikhub/user/get_user_daily_usage"
    headers = {"Authorization": f"Bearer {key}"}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            daily = None
            try:
                dresp = client.get(daily_url, headers=headers)
                if dresp.status_code < 400:
                    daily = dresp.json()
            except Exception:
                daily = None
    except Exception as e:
        logger.info("tikhub user fetch failed: %s", e)
        return {
            "provider": "tikhub",
            "ok": False,
            "error": str(e)[:200],
            "source": "GET /api/v1/tikhub/user/get_user_info",
        }

    if not isinstance(data, dict):
        return {"provider": "tikhub", "ok": False, "error": "bad_json"}
    user = data.get("user_data") if isinstance(data.get("user_data"), dict) else {}
    bal, free = user.get("balance"), user.get("free_credit")
    out: dict[str, Any] = {
        "provider": "tikhub",
        "ok": True,
        "source": "TikHub get_user_info",
        "balance": bal,
        "free_credit": free,
        "email": user.get("email"),
        "summary": f"balance {bal} · free_credit {free}",
    }
    if isinstance(daily, dict):
        out["daily_usage"] = daily.get("data") or daily.get("user_data") or daily
        out["source"] = "TikHub get_user_info + get_user_daily_usage"
    return out


def fetch_qweather_finance(settings: Settings, *, timeout: float = 8.0) -> dict[str, Any]:
    """Requires Console API permission on credential; soft-fails otherwise."""
    key = (settings.qweather_api_key or "").strip()
    if not key:
        return {"provider": "qweather", "ok": False, "error": "QWEATHER_API_KEY not set"}
    host = (settings.qweather_api_host or "https://devapi.qweather.com").rstrip("/")
    url = f"{host}/finance/v1/summary"
    try:
        with httpx.Client(timeout=timeout) as client:
            # Prefer header auth; also try query key (legacy)
            resp = client.get(url, headers={"X-QW-Api-Key": key}, params={"key": key})
            if resp.status_code >= 400:
                resp = client.get(url, params={"key": key})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.info("qweather finance fetch failed: %s", e)
        return {
            "provider": "qweather",
            "ok": False,
            "error": str(e)[:200],
            "source": "GET /finance/v1/summary",
            "hint": "需在和风控制台凭据中开启「财务汇总」控制台权限",
        }

    if not isinstance(data, dict):
        return {"provider": "qweather", "ok": False, "error": "bad_json"}
    # Error codes often in `code` for weather APIs; console may differ
    code = str(data.get("code") or "")
    if code and code not in ("200", ""):
        return {
            "provider": "qweather",
            "ok": False,
            "error": f"code_{code}",
            "source": "GET /finance/v1/summary",
            "hint": "需开启控制台财务权限或改用 JWT",
        }
    bal = data.get("balance")
    accrued = data.get("accruedCharges") if isinstance(data.get("accruedCharges"), dict) else {}
    return {
        "provider": "qweather",
        "ok": True,
        "source": "QWeather Console GET /finance/v1/summary",
        "currency": data.get("currency"),
        "balance": bal,
        "accrued_this_month": accrued.get("thisMonth"),
        "accrued_previous_day": accrued.get("previousDay"),
        "as_of": data.get("asOf"),
        "summary": f"{data.get('currency')} balance {bal} · month {accrued.get('thisMonth')}",
    }


def fetch_provider_accounts(
    settings: Settings | None = None,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """
    Official quotas/balances. Cached 60s. Never raises.
    Ignav: no public account API → omitted.
    """
    cfg = settings or get_settings()
    now = time.time()
    if not force and _cache["data"] is not None and (now - float(_cache["at"])) < _CACHE_TTL_SEC:
        return _cache["data"]

    accounts = [
        fetch_deepseek_balance(cfg),
        fetch_serpapi_account(cfg),
        fetch_tavily_usage(cfg),
        fetch_tikhub_user(cfg),
        fetch_qweather_finance(cfg),
    ]
    payload = {
        "fetched_at": now,
        "cache_ttl_sec": _CACHE_TTL_SEC,
        "note": (
            "以下为各厂官方账户/用量接口；本地 Est.$ 仅为会话启发式，勿当账单。"
            "和风需控制台开通财务权限；Ignav 无公开余额 API。"
        ),
        "accounts": accounts,
    }
    _cache["at"] = now
    _cache["data"] = payload
    return payload


def clear_accounts_cache() -> None:
    _cache["at"] = 0.0
    _cache["data"] = None
