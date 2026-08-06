#!/usr/bin/env python3
"""Mock httpx tests for TikHub normalize + EvidencePack (no real API)."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.ugc.tikhub import (
    TikHubClient,
    build_evidence_pack,
    evidence_queries,
    normalize_note_item,
    normalize_search_response,
    parse_likes,
)


def _fake_settings(*, key: str = "", max_results: int = 8) -> SimpleNamespace:
    """Avoid pydantic Settings loading real .env keys into tests."""
    return SimpleNamespace(
        tikhub_api_key=key,
        tikhub_api_base="https://api.tikhub.io",
        tikhub_timeout_sec=5.0,
        tikhub_max_results=max_results,
        tikhub_configured=bool(key.strip()),
    )

SAMPLE_RESPONSE = {
    "code": 200,
    "data": {
        "items": [
            {
                "id": "note-a",
                "model_type": "note",
                "note": {
                    "note_id": "697c0eee000000000a03c308",
                    "display_title": "<em>新加坡</em> 4日自由行",
                    "desc": "滨海湾 + 圣淘沙必去，避开周末人潮",
                    "interact_info": {"liked_count": "1.2万"},
                },
            },
            {
                "model_type": "note",
                "note": {
                    "note_id": "697c0eee000000000a03c309",
                    "title": "Singapore itinerary tips",
                    "desc": "Gardens by the Bay at night",
                    "interact_info": {"liked_count": 320},
                },
            },
            {
                # duplicate note_id should be dropped
                "note": {
                    "note_id": "697c0eee000000000a03c308",
                    "display_title": "dup",
                    "desc": "dup",
                },
            },
        ],
        "has_more": False,
    },
}


def test_parse_likes():
    assert parse_likes("1.2万") == 12000
    assert parse_likes(320) == 320
    assert parse_likes("1,234") == 1234
    assert parse_likes(None) is None
    assert parse_likes("n/a") is None


def test_normalize_note_item():
    item = normalize_note_item(SAMPLE_RESPONSE["data"]["items"][0], query="新加坡 自由行 4天")
    assert item is not None
    assert item.title == "新加坡 4日自由行"
    assert item.likes == 12000
    assert item.source == "tikhub_xhs"
    assert "697c0eee000000000a03c308" in item.url
    assert "滨海湾" in item.snippet


def test_normalize_search_response_dedupe():
    items = normalize_search_response(SAMPLE_RESPONSE, query="q", max_results=10)
    assert len(items) == 2
    assert items[0].note_id == "697c0eee000000000a03c308"
    assert items[1].likes == 320


def test_evidence_queries():
    qs = evidence_queries("新加坡", 4)
    assert qs == ["新加坡 自由行 4天", "新加坡 itinerary"]
    assert evidence_queries("  ", None) == []


def test_build_evidence_pack_noop_when_unconfigured():
    cfg = _fake_settings(key="")
    assert build_evidence_pack("新加坡", 4, settings=cfg) == []  # type: ignore[arg-type]


def test_build_evidence_pack_with_mock_httpx():
    cfg = _fake_settings(key="test-key-not-real", max_results=5)
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = SAMPLE_RESPONSE

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.get.return_value = mock_resp

    with patch("app.services.ugc.tikhub.httpx.Client", return_value=mock_client):
        pack = build_evidence_pack("新加坡", 4, settings=cfg)  # type: ignore[arg-type]

    assert 1 <= len(pack) <= 5
    assert all(i.source == "tikhub_xhs" for i in pack)
    assert mock_client.get.call_count == 2  # two queries
    first_call = mock_client.get.call_args_list[0]
    assert "/api/v1/xiaohongshu/app_v2/search_notes" in first_call.args[0]
    assert first_call.kwargs["headers"]["Authorization"] == "Bearer test-key-not-real"
    assert first_call.kwargs["params"]["sort_type"] == "popularity_descending"


def test_client_search_notes_empty_without_key():
    client = TikHubClient(_fake_settings(key=""))  # type: ignore[arg-type]
    assert client.search_notes("新加坡") == {}


if __name__ == "__main__":
    test_parse_likes()
    test_normalize_note_item()
    test_normalize_search_response_dedupe()
    test_evidence_queries()
    test_build_evidence_pack_noop_when_unconfigured()
    test_build_evidence_pack_with_mock_httpx()
    test_client_search_notes_empty_without_key()
    print("ok")
