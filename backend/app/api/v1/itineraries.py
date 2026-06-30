import asyncio
import logging
import time
from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.dependencies import get_llm_client
from app.schemas.itinerary import (
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    GeocodeItineraryRequest,
    GeocodeItineraryResponse,
)
from app.services.geocoding import geocode_itinerary
from app.services.itinerary_llm import generate_itinerary_async, generate_itinerary_stream_events
from app.services.llm_client import LLMClient
from app.utils.sse import sse_event, sse_ping

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/itineraries", tags=["itineraries"])

SSE_HEARTBEAT_SEC = 15


@router.post("/generate", response_model=GenerateItineraryResponse)
async def generate_itinerary_endpoint(
    body: GenerateItineraryRequest,
    client: LLMClient | None = Depends(get_llm_client),
) -> GenerateItineraryResponse:
    settings = get_settings()
    itinerary, llm_ms, geocode_ms = await generate_itinerary_async(
        body.trip_request,
        client,
        geocode=body.geocode,
        settings=settings,
    )
    return GenerateItineraryResponse(
        itinerary=itinerary,
        llm_latency_ms=llm_ms,
        geocode_latency_ms=geocode_ms,
    )


@router.post("/generate/stream")
async def generate_itinerary_stream_endpoint(
    body: GenerateItineraryRequest,
    client: LLMClient | None = Depends(get_llm_client),
) -> StreamingResponse:
    """SSE：llm delta（preview）→ llm done → result。"""

    async def event_generator():
        queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
        settings = get_settings()

        async def produce() -> None:
            try:
                if not settings.deepseek_api_key:
                    await queue.put(("error", {"detail": "LLM 未配置：请设置 DEEPSEEK_API_KEY"}))
                    return

                async for item in generate_itinerary_stream_events(
                    body.trip_request,
                    client,
                    geocode=body.geocode,
                    settings=settings,
                ):
                    await queue.put((item["event"], item["data"]))
            except Exception as e:
                logger.exception("generate/stream failed: %s", type(e).__name__)
                await queue.put(("error", {"detail": str(e)}))
            finally:
                await queue.put(None)

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(SSE_HEARTBEAT_SEC)
                await queue.put(("__ping__", {}))

        prod_task = asyncio.create_task(produce())
        hb_task = asyncio.create_task(heartbeat())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                kind, data = item
                if kind == "__ping__":
                    yield sse_ping()
                elif kind == "error":
                    yield sse_event("error", data)
                    break
                else:
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


@router.post("/geocode-nodes", response_model=GeocodeItineraryResponse)
def geocode_itinerary_nodes_endpoint(body: GeocodeItineraryRequest) -> GeocodeItineraryResponse:
    """为行程中缺失坐标的节点补全地理编码（supplement add_node 等，P86）。"""
    dest = (body.destination or "").strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination 不能为空")
    settings = get_settings()
    started = time.perf_counter()
    itinerary = geocode_itinerary(
        deepcopy(body.itinerary),
        dest,
        max_workers=settings.geocode_max_workers,
    )
    geocode_ms = int((time.perf_counter() - started) * 1000)
    return GeocodeItineraryResponse(itinerary=itinerary, geocode_latency_ms=geocode_ms)


@router.post("/geocode-nodes/stream")
async def geocode_itinerary_nodes_stream_endpoint(
    body: GeocodeItineraryRequest,
) -> StreamingResponse:
    """SSE：geocoding progress（done/total）→ result。"""

    dest = (body.destination or "").strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination 不能为空")

    async def event_generator():
        queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
        settings = get_settings()
        loop = asyncio.get_running_loop()

        def on_progress(done: int, total: int) -> None:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ("progress", {"step": "geocoding", "done": done, "total": total}),
            )

        async def produce() -> None:
            try:
                started = time.perf_counter()
                itinerary = await asyncio.to_thread(
                    geocode_itinerary,
                    deepcopy(body.itinerary),
                    dest,
                    max_workers=settings.geocode_max_workers,
                    on_progress=on_progress,
                )
                geocode_ms = int((time.perf_counter() - started) * 1000)
                await queue.put(
                    ("result", {"itinerary": itinerary, "geocode_latency_ms": geocode_ms})
                )
            except Exception as e:
                logger.exception("geocode-nodes/stream failed: %s", type(e).__name__)
                await queue.put(("error", {"detail": str(e)}))
            finally:
                await queue.put(None)

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(SSE_HEARTBEAT_SEC)
                await queue.put(("__ping__", {}))

        prod_task = asyncio.create_task(produce())
        hb_task = asyncio.create_task(heartbeat())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                kind, data = item
                if kind == "__ping__":
                    yield sse_ping()
                elif kind == "error":
                    yield sse_event("error", data)
                    break
                else:
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
