import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAI, RateLimitError

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 502, 503, 504}

_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)


def strip_json_fences(content: str) -> str:
    """剥离 markdown JSON 围栏（P88）。"""
    text = content.strip()
    match = _FENCE_RE.match(text)
    if match:
        return match.group(1).strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text


class LLMClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        if not self.settings.deepseek_api_key:
            raise ValueError("DEEPSEEK_API_KEY 未配置")
        self._client = OpenAI(
            api_key=self.settings.deepseek_api_key,
            base_url=self.settings.deepseek_api_base,
            timeout=120.0,
        )
        self._async_client = AsyncOpenAI(
            api_key=self.settings.deepseek_api_key,
            base_url=self.settings.deepseek_api_base,
            timeout=120.0,
        )
        self._active_model = self.settings.llm_model
        self._last_call_meta: dict[str, Any] = {}

    @property
    def active_model(self) -> str:
        return self._active_model

    @property
    def last_call_meta(self) -> dict[str, Any]:
        return self._last_call_meta

    def _model_chain(self, primary: str | None) -> list[str]:
        if not primary:
            return self.settings.llm_model_chain
        seen: set[str] = set()
        chain: list[str] = []
        for name in [primary, *self.settings.llm_model_fallbacks.split(",")]:
            n = name.strip()
            if n and n not in seen:
                seen.add(n)
                chain.append(n)
        return chain

    @staticmethod
    def _apply_thinking(create_kwargs: dict[str, Any], thinking: bool | None) -> None:
        """DeepSeek V4: thinking shares max_tokens with content; JSON generate should disable."""
        if thinking is None:
            return
        create_kwargs["extra_body"] = {
            **(create_kwargs.get("extra_body") or {}),
            "thinking": {"type": "enabled" if thinking else "disabled"},
        }

    @staticmethod
    def _require_message_content(content: str | None, *, finish_reason: str | None) -> str:
        """llm-api-engineering：禁止把空 content 当成 "{}" 糊弄下游。"""
        text = (content or "").strip()
        if text:
            return text
        raise ValueError(
            "LLM 返回空 content"
            f"（finish_reason={finish_reason or 'unknown'}）；"
            "可能被 max_tokens 截断或仅输出了 reasoning，请增大 LLM_MAX_TOKENS_GENERATE 后重试"
        )

    def _log_and_parse(
        self,
        content: str,
        model: str,
        latency_ms: int,
        usage: Any,
        endpoint: str,
        *,
        finish_reason: str | None = None,
    ) -> dict[str, Any]:
        self._active_model = model
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        self._last_call_meta = {
            "endpoint": endpoint,
            "model": model,
            "latency_ms": latency_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "finish_reason": finish_reason,
        }
        try:
            from app.services.api_usage import record_usage

            record_usage(
                "llm",
                endpoint or "chat_json",
                ok=True,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                meta={"model": model, "finish_reason": finish_reason},
            )
        except Exception:
            pass
        logger.info(
            "llm ok endpoint=%s model=%s latency_ms=%s prompt_tokens=%s "
            "completion_tokens=%s finish_reason=%s",
            endpoint or "-",
            model,
            latency_ms,
            prompt_tokens,
            completion_tokens,
            finish_reason,
        )
        return json.loads(strip_json_fences(content))

    async def chat_json_async(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.2,
        max_retries: int = 3,
        model: str | None = None,
        max_tokens: int | None = None,
        endpoint: str = "",
        thinking: bool | None = None,
    ) -> dict[str, Any]:
        last_err: Exception | None = None
        models = self._model_chain(model)
        create_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if max_tokens is not None:
            create_kwargs["max_tokens"] = max_tokens
        self._apply_thinking(create_kwargs, thinking)

        for m in models:
            for attempt in range(max_retries):
                try:
                    started = time.perf_counter()
                    resp = await self._async_client.chat.completions.create(
                        model=m,
                        **create_kwargs,
                    )
                    latency_ms = int((time.perf_counter() - started) * 1000)
                    choice = resp.choices[0]
                    finish_reason = getattr(choice, "finish_reason", None)
                    content = self._require_message_content(
                        choice.message.content, finish_reason=finish_reason
                    )
                    return self._log_and_parse(
                        content,
                        m,
                        latency_ms,
                        resp.usage,
                        endpoint,
                        finish_reason=finish_reason,
                    )
                except APIStatusError as e:
                    last_err = e
                    if e.status_code == 404:
                        logger.warning("model %s not found (404), trying fallback", m)
                        break
                    if e.status_code in RETRYABLE_STATUS and attempt < max_retries - 1:
                        await asyncio.sleep(2**attempt)
                        continue
                    raise
                except (RateLimitError, APIConnectionError) as e:
                    last_err = e
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2**attempt)
                        continue
                    raise
                except json.JSONDecodeError as e:
                    last_err = e
                    if attempt < max_retries - 1:
                        continue
                    raise ValueError(f"LLM 返回非 JSON: {e}") from e
                except ValueError as e:
                    last_err = e
                    if "空 content" in str(e) and attempt < max_retries - 1:
                        continue
                    raise

        raise last_err or RuntimeError(
            f"所有模型均不可用，已尝试: {', '.join(models)}"
        )

    async def chat_json_stream_async(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.2,
        max_retries: int = 3,
        model: str | None = None,
        max_tokens: int | None = None,
        endpoint: str = "",
        thinking: bool | None = None,
    ) -> AsyncIterator[str]:
        """流式返回 completion 文本 delta，结束后写入 last_call_meta。"""
        last_err: Exception | None = None
        models = self._model_chain(model)
        create_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": True,
        }
        if max_tokens is not None:
            create_kwargs["max_tokens"] = max_tokens
        self._apply_thinking(create_kwargs, thinking)

        for m in models:
            for attempt in range(max_retries):
                started = time.perf_counter()
                parts: list[str] = []
                reasoning_parts: list[str] = []
                usage = None
                try:
                    stream = await self._async_client.chat.completions.create(
                        model=m,
                        **create_kwargs,
                    )
                    finish_reason: str | None = None
                    async for chunk in stream:
                        if getattr(chunk, "usage", None):
                            usage = chunk.usage
                        if not chunk.choices:
                            continue
                        choice = chunk.choices[0]
                        if choice.finish_reason:
                            finish_reason = choice.finish_reason
                        # UX-CHAT-07: optional provider reasoning (e.g. deepseek-reasoner)
                        rc = getattr(choice.delta, "reasoning_content", None) or ""
                        if rc:
                            reasoning_parts.append(rc)
                        delta = choice.delta.content or ""
                        if delta:
                            parts.append(delta)
                            yield delta

                    latency_ms = int((time.perf_counter() - started) * 1000)
                    self._active_model = m
                    prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
                    completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
                    reasoning_text = "".join(reasoning_parts).strip()
                    content_len = sum(len(p) for p in parts)
                    self._last_call_meta = {
                        "endpoint": endpoint,
                        "model": m,
                        "latency_ms": latency_ms,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "finish_reason": finish_reason,
                        "reasoning": reasoning_text[:4000] if reasoning_text else None,
                        "content_chars": content_len,
                    }
                    if content_len == 0:
                        logger.warning(
                            "llm stream empty content endpoint=%s model=%s "
                            "finish_reason=%s completion_tokens=%s",
                            endpoint or "-",
                            m,
                            finish_reason,
                            completion_tokens,
                        )
                    try:
                        from app.services.api_usage import record_usage

                        record_usage(
                            "llm",
                            endpoint or "chat_stream",
                            ok=True,
                            latency_ms=latency_ms,
                            prompt_tokens=prompt_tokens,
                            completion_tokens=completion_tokens,
                            meta={
                                "model": m,
                                "finish_reason": finish_reason,
                                "content_chars": content_len,
                            },
                        )
                    except Exception:
                        pass
                    logger.info(
                        "llm stream ok endpoint=%s model=%s latency_ms=%s prompt_tokens=%s "
                        "completion_tokens=%s finish_reason=%s content_chars=%s",
                        endpoint or "-",
                        m,
                        latency_ms,
                        prompt_tokens,
                        completion_tokens,
                        finish_reason,
                        content_len,
                    )
                    return
                except APIStatusError as e:
                    last_err = e
                    if e.status_code == 404:
                        logger.warning("model %s not found (404), trying fallback", m)
                        break
                    if e.status_code in RETRYABLE_STATUS and attempt < max_retries - 1:
                        await asyncio.sleep(2**attempt)
                        continue
                    raise
                except (RateLimitError, APIConnectionError) as e:
                    last_err = e
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2**attempt)
                        continue
                    raise

        raise last_err or RuntimeError(
            f"所有模型均不可用，已尝试: {', '.join(models)}"
        )

    def chat_json(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.2,
        max_retries: int = 3,
        model: str | None = None,
        max_tokens: int | None = None,
        endpoint: str = "",
        thinking: bool | None = None,
    ) -> dict[str, Any]:
        last_err: Exception | None = None
        models = self._model_chain(model)
        create_kwargs: dict[str, Any] = {
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if max_tokens is not None:
            create_kwargs["max_tokens"] = max_tokens
        self._apply_thinking(create_kwargs, thinking)

        for m in models:
            for attempt in range(max_retries):
                try:
                    started = time.perf_counter()
                    resp = self._client.chat.completions.create(model=m, **create_kwargs)
                    latency_ms = int((time.perf_counter() - started) * 1000)
                    choice = resp.choices[0]
                    finish_reason = getattr(choice, "finish_reason", None)
                    content = self._require_message_content(
                        choice.message.content, finish_reason=finish_reason
                    )
                    return self._log_and_parse(
                        content,
                        m,
                        latency_ms,
                        resp.usage,
                        endpoint,
                        finish_reason=finish_reason,
                    )
                except APIStatusError as e:
                    last_err = e
                    if e.status_code == 404:
                        logger.warning("model %s not found (404), trying fallback", m)
                        break
                    if e.status_code in RETRYABLE_STATUS and attempt < max_retries - 1:
                        time.sleep(2**attempt)
                        continue
                    raise
                except (RateLimitError, APIConnectionError) as e:
                    last_err = e
                    if attempt < max_retries - 1:
                        time.sleep(2**attempt)
                        continue
                    raise
                except json.JSONDecodeError as e:
                    last_err = e
                    if attempt < max_retries - 1:
                        continue
                    raise ValueError(f"LLM 返回非 JSON: {e}") from e
                except ValueError as e:
                    last_err = e
                    if "空 content" in str(e) and attempt < max_retries - 1:
                        continue
                    raise

        raise last_err or RuntimeError(
            f"所有模型均不可用，已尝试: {', '.join(models)}"
        )
