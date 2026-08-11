import asyncio
import logging
import time
from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.dependencies import get_llm_client
from pydantic import ValidationError

from app.schemas.itinerary import (
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    GeocodeItineraryRequest,
    GeocodeItineraryResponse,
    validate_itinerary_dict,
)
from app.services.commute import enrich_itinerary_commute
from app.services.geocoding import geocode_itinerary
from app.services.itinerary_credibility import (
    append_credibility_warnings,
    audit_commute_load,
)
from app.services.itinerary_llm import generate_itinerary_async, generate_itinerary_stream_events
from app.services.llm_client import LLMClient
from app.utils.sse import sse_event, sse_ping

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/itineraries", tags=["itineraries"])

SSE_HEARTBEAT_SEC = 15


def _post_geocode_credibility(
    itinerary: dict,
    *,
    free_text: str = "",
    notes: str = "",
) -> dict:
    """TRN-02 enrich + TRN-02b schedule realign + commute soft-audit (async geocode)."""
    from app.services.intel_anchor_enforce import realign_schedules_after_commute

    itinerary = enrich_itinerary_commute(
        itinerary,
        free_text=free_text,
        notes=notes,
        settings=get_settings(),
    )
    enriched_n = int((itinerary.get("meta") or {}).get("commute_auto_enriched") or 0)
    itinerary = realign_schedules_after_commute(itinerary, note=enriched_n > 0)
    return append_credibility_warnings(itinerary, audit_commute_load(itinerary))


def _require_confirmed_flights(body: GenerateItineraryRequest) -> None:
    """FLOW-01b: backend gate — cannot bypass frontend flight confirmation."""
    flights = (body.travel_intel.flights if body.travel_intel else None) or []
    if not flights:
        raise HTTPException(
            status_code=400,
            detail="请先确认航班后再生成玩法行程（travel_intel.flights 不能为空）",
        )


def _require_locked_hotel(body: GenerateItineraryRequest) -> None:
    """Hotel must be locked before first generate (name + coords). optimize may reuse."""
    if body.mode == "optimize":
        return
    hotels = (body.travel_intel.hotels if body.travel_intel else None) or []
    locked = False
    for h in hotels:
        if not isinstance(h, dict):
            continue
        name = (h.get("name") or "").strip()
        try:
            lat, lng = float(h.get("lat") or 0), float(h.get("lng") or 0)
        except (TypeError, ValueError):
            continue
        if name and (abs(lat) > 1e-6 or abs(lng) > 1e-6):
            locked = True
            break
    if not locked:
        raise HTTPException(
            status_code=400,
            detail="请先锁定具体酒店后再生成玩法行程（travel_intel.hotels 需含名称与坐标）",
        )


def _require_activity_first_skeleton(body: GenerateItineraryRequest) -> None:
    """STRAT-UI C: activity_first needs paste/兴趣骨架 before first generate."""
    if body.mode == "optimize":
        return
    strategy = (body.trip_request.planning_strategy or "flight_hotel_first").strip()
    if strategy != "activity_first":
        return
    tags = body.trip_request.preference_tags or []
    notes = (body.trip_request.notes or "").strip()
    free_text = (body.trip_request.free_text or "").strip()
    ue = body.user_evidence or []
    has_ue = any(
        isinstance(e, dict)
        and (str(e.get("url") or "").strip() or str(e.get("title") or "").strip())
        for e in ue
    )
    if tags or has_ue or len(notes) >= 8 or len(free_text) >= 20:
        return
    raise HTTPException(
        status_code=400,
        detail="「跟笔记走」策略需先贴链/写兴趣骨架（preference_tags、notes 或 user_evidence）",
    )


def _require_generate_mode(body: GenerateItineraryRequest) -> None:
    """FLOW-02: optimize needs current_itinerary; regenerate may omit but prefers it."""
    if body.mode == "optimize" and not body.current_itinerary:
        raise HTTPException(
            status_code=400,
            detail="optimize 模式需要 current_itinerary（现有行程骨架）",
        )


def _validated_itinerary(itinerary: dict) -> dict:
    try:
        return validate_itinerary_dict(itinerary)
    except ValidationError as e:
        logger.warning("itinerary schema validation failed: %s", e)
        raise HTTPException(status_code=422, detail="行程结构校验失败") from e


@router.post("/generate", response_model=GenerateItineraryResponse)
async def generate_itinerary_endpoint(
    body: GenerateItineraryRequest,
    client: LLMClient | None = Depends(get_llm_client),
) -> GenerateItineraryResponse:
    _require_confirmed_flights(body)
    _require_locked_hotel(body)
    _require_activity_first_skeleton(body)
    _require_generate_mode(body)
    settings = get_settings()
    travel_intel = body.travel_intel.model_dump() if body.travel_intel else None
    itinerary, llm_ms, geocode_ms = await generate_itinerary_async(
        body.trip_request,
        client,
        geocode=body.geocode,
        settings=settings,
        travel_intel=travel_intel,
        mode=body.mode,
        current_itinerary=body.current_itinerary,
        user_evidence=body.user_evidence,
    )
    return GenerateItineraryResponse(
        itinerary=_validated_itinerary(itinerary),
        llm_latency_ms=llm_ms,
        geocode_latency_ms=geocode_ms,
    )


@router.post("/generate/stream")
async def generate_itinerary_stream_endpoint(
    body: GenerateItineraryRequest,
    client: LLMClient | None = Depends(get_llm_client),
) -> StreamingResponse:
    """SSE：llm delta（preview）→ llm done → result。"""
    _require_confirmed_flights(body)
    _require_locked_hotel(body)
    _require_activity_first_skeleton(body)
    _require_generate_mode(body)

    async def event_generator():
        queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
        settings = get_settings()

        async def produce() -> None:
            try:
                if not settings.deepseek_api_key:
                    await queue.put(("error", {"detail": "LLM 未配置：请设置 DEEPSEEK_API_KEY"}))
                    return

                travel_intel = body.travel_intel.model_dump() if body.travel_intel else None
                async for item in generate_itinerary_stream_events(
                    body.trip_request,
                    client,
                    geocode=body.geocode,
                    settings=settings,
                    travel_intel=travel_intel,
                    mode=body.mode,
                    current_itinerary=body.current_itinerary,
                    user_evidence=body.user_evidence,
                ):
                    evt, data = item["event"], item["data"]
                    if evt == "result" and isinstance(data.get("itinerary"), dict):
                        try:
                            data = {**data, "itinerary": validate_itinerary_dict(data["itinerary"])}
                        except ValidationError as e:
                            await queue.put(("error", {"detail": f"行程结构校验失败: {e}"}))
                            return
                    await queue.put((evt, data))
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
    from app.services.itinerary_llm import _geocode_kwargs_from_intel

    dest = (body.destination or "").strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination 不能为空")
    settings = get_settings()
    started = time.perf_counter()
    intel = body.travel_intel.model_dump() if body.travel_intel else None
    gkw = _geocode_kwargs_from_intel(dest, intel)
    itinerary = geocode_itinerary(
        deepcopy(body.itinerary),
        dest,
        max_workers=settings.geocode_max_workers,
        **gkw,
    )
    itinerary = _post_geocode_credibility(
        itinerary,
        free_text=body.free_text or "",
        notes=body.notes or "",
    )
    geocode_ms = int((time.perf_counter() - started) * 1000)
    return GeocodeItineraryResponse(
        itinerary=_validated_itinerary(itinerary),
        geocode_latency_ms=geocode_ms,
    )


@router.post("/geocode-nodes/stream")
async def geocode_itinerary_nodes_stream_endpoint(
    body: GeocodeItineraryRequest,
) -> StreamingResponse:
    """SSE：geocoding progress（done/total）→ result。"""

    dest = (body.destination or "").strip()
    if not dest:
        raise HTTPException(status_code=400, detail="destination 不能为空")

    async def event_generator():
        from app.services.itinerary_llm import _geocode_kwargs_from_intel

        queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()
        settings = get_settings()
        loop = asyncio.get_running_loop()
        intel = body.travel_intel.model_dump() if body.travel_intel else None
        gkw = _geocode_kwargs_from_intel(dest, intel)

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
                    **gkw,
                )
                itinerary = _post_geocode_credibility(
                    itinerary,
                    free_text=body.free_text or "",
                    notes=body.notes or "",
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
