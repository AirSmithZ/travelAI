"""URL → EvidenceItem providers for user-pasted links (doc 23 MVP).

Xiaohongshu: TikHub note detail first; on 402/empty fall back to Tavily Extract
(short links like xhslink.cn work well with Tavily).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlparse

from app.config import Settings, get_settings
from app.services.ugc.tikhub import EvidenceItem, TikHubClient

logger = logging.getLogger(__name__)

_XHS_HOSTS = frozenset(
    {
        "xiaohongshu.com",
        "www.xiaohongshu.com",
        "xhslink.com",
        "www.xhslink.com",
        # App share short links often use .cn
        "xhslink.cn",
        "www.xhslink.cn",
    }
)
_NOTE_ID_RE = re.compile(
    r"(?:explore|discovery/item|item)/([a-fA-F0-9]{16,32})",
    re.IGNORECASE,
)

_TIKHUB_ERR_MSG = {
    "tikhub_402": (
        "TikHub 小红书详情接口需付费余额（不接受免费额度）。"
        "已尝试网页抽取降级；若仍失败请到 https://user.tikhub.io/users/add_credit 充值，"
        "或确认已配置 TAVILY_API_KEY。"
    ),
    "unconfigured": "未配置 TIKHUB_API_KEY",
    "timeout": "TikHub 请求超时",
}


class EvidenceLinkProvider(Protocol):
    name: str

    def can_handle(self, url: str) -> bool: ...

    def fetch(
        self,
        url: str,
        *,
        settings: Settings,
        destination: str | None = None,
    ) -> tuple[EvidenceItem, str]:
        """Returns (item, provider_tag). Raises LinkFetchError on failure."""
        ...


@dataclass
class LinkFetchError(Exception):
    message: str
    code: str = "fetch_failed"

    def __str__(self) -> str:
        return self.message


def normalize_pasted_url(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    # Allow share blobs that embed a URL
    m = re.search(r"https?://[^\s]+", text)
    if m:
        text = m.group(0).rstrip(")。,.，]")
    return text


def extract_xhs_note_id(url: str) -> str | None:
    u = normalize_pasted_url(url)
    if not u:
        return None
    m = _NOTE_ID_RE.search(u)
    return m.group(1) if m else None


def is_xhs_url(url: str) -> bool:
    u = normalize_pasted_url(url)
    if not u:
        return False
    try:
        host = (urlparse(u).hostname or "").lower()
    except Exception:
        return False
    if host in _XHS_HOSTS:
        return True
    return (
        host.endswith(".xiaohongshu.com")
        or host.endswith(".xhslink.com")
        or host.endswith(".xhslink.cn")
    )


def _resolve_short_link_note_id(url: str) -> str | None:
    """Best-effort follow redirect to pick note_id from explore/discovery URL."""
    nid = extract_xhs_note_id(url)
    if nid:
        return nid
    try:
        import httpx

        with httpx.Client(
            timeout=20.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0"},
        ) as client:
            resp = client.get(url)
            return extract_xhs_note_id(str(resp.url))
    except Exception as e:
        logger.debug("resolve short link failed: %s", e)
        return None


class XhsLinkProvider:
    """Xiaohongshu paste-link: TikHub detail → Tavily extract fallback."""

    name = "xhs"

    def can_handle(self, url: str) -> bool:
        return is_xhs_url(url)

    def fetch(
        self,
        url: str,
        *,
        settings: Settings,
        destination: str | None = None,
    ) -> tuple[EvidenceItem, str]:
        del destination
        share = normalize_pasted_url(url)
        note_id = _resolve_short_link_note_id(share)

        tikhub_err: str | None = None
        if settings.tikhub_configured:
            hub = TikHubClient(settings)
            item, tikhub_err = hub.get_note_by_share_or_id(
                note_id=note_id,
                share_text=share,
            )
            if item is not None:
                if note_id and not item.note_id:
                    item = item.model_copy(update={"note_id": note_id})
                return item, "xhs_tikhub"
        else:
            tikhub_err = "unconfigured"

        # Fallback: Tavily Extract (works on xhslink.cn short links even when TikHub 402)
        tavily_ok = bool(getattr(settings, "web_search_configured", False)) or bool(
            (getattr(settings, "tavily_api_key", "") or "").strip()
        )
        if tavily_ok:
            from app.services.ugc.providers.tavily import extract_tavily_url

            extracted = extract_tavily_url(
                share,
                settings=settings,
                note_id=note_id,
                source="user_paste_tavily",
            )
            if extracted is not None:
                if note_id and not extracted.note_id:
                    extracted = extracted.model_copy(update={"note_id": note_id})
                return extracted, "xhs_tavily"

        if tikhub_err == "tikhub_402":
            raise LinkFetchError(_TIKHUB_ERR_MSG["tikhub_402"], code="tikhub_402")
        if tikhub_err == "unconfigured" and not tavily_ok:
            raise LinkFetchError(
                "未配置 TIKHUB_API_KEY / TAVILY_API_KEY，无法检索小红书笔记",
                code="unconfigured",
            )
        hint = _TIKHUB_ERR_MSG.get(tikhub_err or "", "")
        raise LinkFetchError(
            hint
            or "未能从该链接拉取笔记内容（上游无结果、余额不足或链接无效）",
            code=tikhub_err or "empty",
        )


_PROVIDERS: list[EvidenceLinkProvider] = [XhsLinkProvider()]


def resolve_provider(url: str) -> EvidenceLinkProvider | None:
    for p in _PROVIDERS:
        if p.can_handle(url):
            return p
    return None


def fetch_evidence_from_link(
    url: str,
    *,
    settings: Settings | None = None,
    destination: str | None = None,
) -> tuple[EvidenceItem | None, str | None, str | None]:
    """
    Returns (item, error_message, provider_name).
    Soft-fail: never raises for upstream/network; LinkFetchError → error string.
    """
    cfg = settings or get_settings()
    cleaned = normalize_pasted_url(url)
    if not cleaned:
        return None, "链接不能为空", None

    provider = resolve_provider(cleaned)
    if provider is None:
        return (
            None,
            "暂不支持该链接平台（MVP 仅支持小红书 xiaohongshu.com / xhslink.com / xhslink.cn）",
            None,
        )

    try:
        item, tag = provider.fetch(cleaned, settings=cfg, destination=destination)
        return item, None, tag
    except LinkFetchError as e:
        return None, str(e), provider.name
    except Exception as e:
        logger.warning("link fetch failed provider=%s: %s", provider.name, e)
        return None, f"检索失败：{e}", provider.name
