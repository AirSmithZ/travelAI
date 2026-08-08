#!/usr/bin/env python3
"""SEC-04: external base URL must be https + allowlisted host."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Settings, _validate_https_allowlisted_url  # noqa: E402


def test_validate_accepts_allowlisted_https():
    assert (
        _validate_https_allowlisted_url("https://api.deepseek.com/v1")
        == "https://api.deepseek.com/v1"
    )
    assert _validate_https_allowlisted_url("https://serpapi.com") == "https://serpapi.com"
    assert (
        _validate_https_allowlisted_url("https://devapi.qweather.com")
        == "https://devapi.qweather.com"
    )
    assert (
        _validate_https_allowlisted_url("https://abc.qweather.com")
        == "https://abc.qweather.com"
    )
    assert _validate_https_allowlisted_url("") == ""


def test_validate_rejects_http_and_unknown_host():
    try:
        _validate_https_allowlisted_url("http://api.deepseek.com/v1")
        raise AssertionError("expected http reject")
    except ValueError as e:
        assert "https" in str(e)
    try:
        _validate_https_allowlisted_url("https://evil.example.com/v1")
        raise AssertionError("expected host reject")
    except ValueError as e:
        assert "allowlisted" in str(e)


def test_settings_validators_wired():
    """Confirm Settings field_validators call SEC-04 helper (not just docs)."""
    assert Settings._sec04_external_bases("https://api.tikhub.io") == "https://api.tikhub.io"
    try:
        Settings._sec04_external_bases("https://evil.example.com")
        raise AssertionError("expected reject")
    except ValueError as e:
        assert "SEC-04" in str(e)
    assert Settings._sec04_tavily_mcp("") == ""
    try:
        Settings._sec04_tavily_mcp("http://mcp.tavily.com")
        raise AssertionError("expected http reject")
    except ValueError as e:
        assert "https" in str(e)


if __name__ == "__main__":
    test_validate_accepts_allowlisted_https()
    test_validate_rejects_http_and_unknown_host()
    test_settings_validators_wired()
    print("SEC-04 allowlist OK")
