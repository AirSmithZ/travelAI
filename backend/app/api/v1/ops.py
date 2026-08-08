"""OPS-01: read-only API usage snapshot for /ops.html (does not gate main app)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.config import get_settings
from app.services.api_usage import get_usage_ledger
from app.services.ops_provider_accounts import clear_accounts_cache, fetch_provider_accounts

router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/usage")
def get_usage(refresh_accounts: bool = Query(False, description="bypass 60s account cache")) -> dict:
    snap = get_usage_ledger().snapshot()
    # Prefer official provider balances over local Est.$ heuristics
    accounts = fetch_provider_accounts(get_settings(), force=refresh_accounts)
    snap["accounts"] = accounts
    snap["note"] = (
        "session_* 为进程内计数；Est.$ 为不可靠启发式。"
        "账户余额/剩余额度请看 accounts（官方 API）。"
    )
    return snap


@router.post("/usage/reset")
def reset_usage() -> dict:
    get_usage_ledger().reset()
    clear_accounts_cache()
    return {"ok": True, "message": "usage ledger cleared"}