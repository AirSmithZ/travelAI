#!/usr/bin/env python3
"""P90：行程生成 token / 空 content 防护（无 live LLM）。"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402
from app.schemas.chat import TripRequestIn  # noqa: E402
from app.services.itinerary_llm import (  # noqa: E402
    ITINERARY_LLM_SYSTEM,
    _llm_to_itinerary,
    _require_itinerary_raw,
)
from app.services.llm_client import LLMClient  # noqa: E402


def test_default_generate_tokens():
    default = Settings.model_fields["llm_max_tokens_generate"].default
    assert int(default) >= 8000
    # 显式传入时不受 .env 覆盖影响
    s = Settings(
        DEEPSEEK_API_KEY="test",
        LLM_MAX_TOKENS_GENERATE=8000,
    )
    assert s.llm_max_tokens_generate == 8000
    print("default_generate_tokens OK", default)


def test_require_itinerary_raw():
    try:
        _require_itinerary_raw({})
        raise AssertionError("expected empty dict to fail")
    except ValueError as e:
        assert "为空" in str(e) or "截断" in str(e)

    try:
        _require_itinerary_raw({"days": []})
        raise AssertionError("expected missing title to fail")
    except ValueError as e:
        assert "title" in str(e)

    ok = _require_itinerary_raw({"title": "新加坡 4 日", "days": []})
    assert ok["title"] == "新加坡 4 日"
    print("require_itinerary_raw OK")


def test_empty_content_rejected():
    try:
        LLMClient._require_message_content(
            "", finish_reason="length", endpoint="parse_stream"
        )
        raise AssertionError("expected empty content to fail")
    except ValueError as e:
        assert "空 content" in str(e)
        assert "length" in str(e)
        assert "LLM_MAX_TOKENS_PARSE" in str(e)
        assert "LLM_MAX_TOKENS_GENERATE" not in str(e)

    try:
        LLMClient._require_message_content(
            "", finish_reason="length", endpoint="generate_stream"
        )
        raise AssertionError("expected empty content to fail")
    except ValueError as e:
        assert "LLM_MAX_TOKENS_GENERATE" in str(e)

    text = LLMClient._require_message_content('{"a":1}', finish_reason="stop")
    assert text.startswith("{")
    print("empty_content_rejected OK")


def test_prompt_node_budget():
    assert "4–6" in ITINERARY_LLM_SYSTEM
    assert "6–9" not in ITINERARY_LLM_SYSTEM
    assert "禁止输出空对象" in ITINERARY_LLM_SYSTEM
    print("prompt_node_budget OK")


def test_llm_to_itinerary_rejects_empty():
    tr = TripRequestIn(destination="新加坡", day_count=2)
    try:
        _llm_to_itinerary({}, tr, geocoded=False)
        raise AssertionError("expected ValidationError/ValueError")
    except ValueError as e:
        assert "为空" in str(e) or "title" in str(e)
    print("llm_to_itinerary_rejects_empty OK")


if __name__ == "__main__":
    test_default_generate_tokens()
    test_require_itinerary_raw()
    test_empty_content_rejected()
    test_prompt_node_budget()
    test_llm_to_itinerary_rejects_empty()
    print("all OK")
