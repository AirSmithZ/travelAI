import asyncio
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import APIConnectionError, APIStatusError, RateLimitError
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.chat import ChatParseRequest, ChatParseResponse
from app.services.chat_parse import align_chat_mode, parse_chat_async, parse_chat_stream_async
from app.services.llm_client import LLMClient
from app.utils.sse import sse_event, sse_ping

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

SSE_HEARTBEAT_SEC = 15


def _prepare_parse_request(body: ChatParseRequest) -> tuple[ChatParseRequest, list[str]]:
    settings = get_settings()
    if len(body.message) > settings.chat_max_message_chars:
        raise HTTPException(status_code=400, detail="消息过长")

    history = body.chat_history[-settings.chat_history_limit :]
    req = body.model_copy(update={"chat_history": history})
    return align_chat_mode(req)


@router.post("/parse", response_model=ChatParseResponse)
async def chat_parse(body: ChatParseRequest) -> ChatParseResponse:
    settings = get_settings()
    req, mode_warnings = _prepare_parse_request(body)

    if not settings.deepseek_api_key:
        raise HTTPException(status_code=503, detail="LLM 未配置：请设置 DEEPSEEK_API_KEY")

    if body.client_request_id:
        logger.info("chat/parse client_request_id=%s plan_id=%s", body.client_request_id, body.plan_id)

    try:
        client = LLMClient(settings)
        result = await parse_chat_async(req, client)
        if mode_warnings:
            result = result.model_copy(
                update={"warnings": mode_warnings + result.warnings},
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"响应校验失败: {e}") from e
    except APIStatusError as e:
        logger.warning("chat/parse LLM API status error: %s", e.status_code)
        raise HTTPException(
            status_code=502,
            detail=f"LLM API 错误（HTTP {e.status_code}），请稍后重试",
        ) from e
    except (RateLimitError, APIConnectionError) as e:
        logger.warning("chat/parse LLM connection error: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="LLM 连接失败或限流，请稍后重试") from e
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("chat/parse failed: %s", type(e).__name__)
        raise HTTPException(
            status_code=502,
            detail=f"LLM 服务异常（{type(e).__name__}）",
        ) from e


@router.post("/parse/stream")
async def chat_parse_stream(body: ChatParseRequest) -> StreamingResponse:
    """SSE：LLM token delta（reply_preview）→ validate → result。"""

    settings = get_settings()
    try:
        req, mode_warnings = _prepare_parse_request(body)
    except HTTPException:
        raise

    if not settings.deepseek_api_key:
        raise HTTPException(status_code=503, detail="LLM 未配置：请设置 DEEPSEEK_API_KEY")

    if body.client_request_id:
        logger.info(
            "chat/parse/stream client_request_id=%s plan_id=%s",
            body.client_request_id,
            body.plan_id,
        )

    async def event_generator():
        queue: asyncio.Queue[tuple[str, dict] | str | None] = asyncio.Queue()

        async def produce() -> None:
            try:
                client = LLMClient(settings)
                async for item in parse_chat_stream_async(req, client):
                    event = item["event"]
                    data = item["data"]
                    if event == "result" and mode_warnings:
                        data = {**data, "warnings": mode_warnings + data.get("warnings", [])}
                    await queue.put((event, data))
            except ValueError as e:
                await queue.put(("error", {"detail": str(e)}))
            except ValidationError as e:
                await queue.put(("error", {"detail": f"响应校验失败: {e}"}))
            except APIStatusError as e:
                await queue.put(("error", {"detail": f"LLM API 错误（HTTP {e.status_code}）"}))
            except (RateLimitError, APIConnectionError):
                await queue.put(("error", {"detail": "LLM 连接失败或限流，请稍后重试"}))
            except Exception as e:
                logger.exception("chat/parse/stream failed: %s", type(e).__name__)
                await queue.put(("error", {"detail": f"LLM 服务异常（{type(e).__name__}）"}))
            finally:
                await queue.put(None)

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(SSE_HEARTBEAT_SEC)
                await queue.put("__ping__")

        prod_task = asyncio.create_task(produce())
        hb_task = asyncio.create_task(heartbeat())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                if item == "__ping__":
                    yield sse_ping()
                elif isinstance(item, tuple):
                    kind, data = item
                    if kind == "error":
                        yield sse_event("error", data)
                        break
                    yield sse_event(kind, data)
        finally:
            hb_task.cancel()
            prod_task.cancel()
            for t in (hb_task, prod_task):
                try:
                    await t
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
