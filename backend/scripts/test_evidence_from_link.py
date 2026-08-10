#!/usr/bin/env python3
"""Unit tests for paste-link providers + TikHub note detail normalize (no real API)."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services.ugc.link_providers import (  # noqa: E402
    extract_xhs_note_id,
    fetch_evidence_from_link,
    is_xhs_url,
    normalize_pasted_url,
)
from app.services.ugc.tikhub import (  # noqa: E402
    SOURCE_USER_PASTE_XHS,
    TikHubClient,
    _dig_note_detail,
    normalize_note_item,
)

APP_V2_DETAIL = {
    "code": 200,
    "data": {
        "code": 0,
        "success": True,
        "data": [
            {
                "note_list": [
                    {
                        "id": "690c73490000000003038445",
                        "title": "秒懂新西兰自由行，附保姆级旅行攻略",
                        "liked_count": 821,
                        "share_info": {
                            "content": "准备去新西兰旅行，90+自由行玩法，快来抄作业",
                        },
                    }
                ]
            }
        ],
    },
}


def _fake_settings(*, key: str = "test-key", tavily: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        tikhub_api_key=key,
        tikhub_api_base="https://api.tikhub.io",
        tikhub_timeout_sec=5.0,
        tikhub_max_results=8,
        tikhub_configured=bool(key.strip()),
        tavily_api_key=tavily,
        tavily_configured=bool(tavily.strip()),
        web_search_configured=bool(tavily.strip()),
    )


DETAIL_RESPONSE = {
    "code": 200,
    "data": {
        "note_id": "697c0eee000000000a03c308",
        "title": "奥克兰三日玩法",
        "desc": "Day1 Britomart + 博物馆；Day2 海湾；避开周末人潮。门票以官网为准。",
        "interact_info": {"liked_count": "3.5万"},
        "share_url": "https://www.xiaohongshu.com/explore/697c0eee000000000a03c308",
    },
}


def test_url_helpers():
    assert is_xhs_url("https://www.xiaohongshu.com/explore/abc123def4567890")
    assert is_xhs_url("http://xhslink.com/o/8GqargIxrko")
    assert is_xhs_url("http://xhslink.cn/o/8JSFii2PXbu")
    assert not is_xhs_url("https://www.douyin.com/video/1")
    blob = "分享我的笔记 https://xhslink.com/a/EZ4M9TwMA6c3 复制后打开"
    assert normalize_pasted_url(blob).startswith("https://xhslink.com/")
    assert (
        extract_xhs_note_id("https://www.xiaohongshu.com/explore/697c0eee000000000a03c308")
        == "697c0eee000000000a03c308"
    )


def test_dig_and_normalize_detail():
    note = _dig_note_detail(DETAIL_RESPONSE)
    assert note is not None
    item = normalize_note_item(note, source=SOURCE_USER_PASTE_XHS, snippet_max=1000)
    assert item is not None
    assert item.source == SOURCE_USER_PASTE_XHS
    assert item.likes == 35000
    assert "Britomart" in item.snippet
    assert len(item.snippet) <= 1000


def test_dig_app_v2_note_list():
    note = _dig_note_detail(APP_V2_DETAIL)
    assert note is not None
    assert note["id"] == "690c73490000000003038445"
    item = normalize_note_item(note, source=SOURCE_USER_PASTE_XHS, snippet_max=1000)
    assert item is not None
    assert item.note_id == "690c73490000000003038445"
    assert item.likes == 821
    assert "新西兰" in item.title
    assert "90+" in item.snippet


def test_get_note_by_share_mock():
    cfg = _fake_settings()
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = DETAIL_RESPONSE
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.get.return_value = mock_resp

    with patch("app.services.ugc.tikhub.httpx.Client", return_value=mock_client):
        hub = TikHubClient(cfg)  # type: ignore[arg-type]
        item, err = hub.get_note_by_share_or_id(
            share_text="https://xhslink.com/o/demo",
        )

    assert err is None
    assert item is not None
    assert item.source == SOURCE_USER_PASTE_XHS
    assert "get_image_note_detail" in mock_client.get.call_args.args[0]


def test_fetch_unsupported():
    item, err, prov = fetch_evidence_from_link(
        "https://example.com/post/1",
        settings=_fake_settings(),  # type: ignore[arg-type]
    )
    assert item is None and "不支持" in (err or "")


def test_fetch_tikhub_success_mock():
    cfg = _fake_settings()
    mock_item = normalize_note_item(
        DETAIL_RESPONSE["data"],
        source=SOURCE_USER_PASTE_XHS,
        snippet_max=1000,
    )
    with (
        patch(
            "app.services.ugc.link_providers._resolve_short_link_note_id",
            return_value="697c0eee000000000a03c308",
        ),
        patch(
            "app.services.ugc.link_providers.TikHubClient.get_note_by_share_or_id",
            return_value=(mock_item, None),
        ),
    ):
        item, err, prov = fetch_evidence_from_link(
            "https://www.xiaohongshu.com/explore/697c0eee000000000a03c308",
            settings=cfg,  # type: ignore[arg-type]
        )
    assert err is None and prov == "xhs_tikhub"
    assert item is not None and item.title == "奥克兰三日玩法"


def test_fetch_tavily_fallback_on_402():
    from app.services.ugc.tikhub import EvidenceItem as EI

    cfg = _fake_settings(tavily="tv-key")
    fallback = EI(
        title="秒懂新西兰自由行",
        url="http://xhslink.cn/o/8JSFii2PXbu",
        snippet="90+自由行玩法",
        source="user_paste_tavily",
        note_id="690c73490000000003038445",
    )
    with (
        patch(
            "app.services.ugc.link_providers._resolve_short_link_note_id",
            return_value="690c73490000000003038445",
        ),
        patch(
            "app.services.ugc.link_providers.TikHubClient.get_note_by_share_or_id",
            return_value=(None, "tikhub_402"),
        ),
        patch(
            "app.services.ugc.providers.tavily.extract_tavily_url",
            return_value=fallback,
        ),
    ):
        item, err, prov = fetch_evidence_from_link(
            "http://xhslink.cn/o/8JSFii2PXbu",
            settings=cfg,  # type: ignore[arg-type]
        )
    assert err is None and prov == "xhs_tavily"
    assert item is not None and "新西兰" in item.title


if __name__ == "__main__":
    test_url_helpers()
    test_dig_and_normalize_detail()
    test_dig_app_v2_note_list()
    test_get_note_by_share_mock()
    test_fetch_unsupported()
    test_fetch_tikhub_success_mock()
    test_fetch_tavily_fallback_on_402()
    print("ok")
