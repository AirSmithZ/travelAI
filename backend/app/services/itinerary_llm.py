import logging
import time
import uuid
from copy import deepcopy
from typing import Any, AsyncIterator

from pydantic import BaseModel, Field, ValidationError

from app.config import Settings, get_settings
from app.schemas.chat import TripRequestIn
from app.services.geocoding import geocode_itinerary
from app.services.itinerary_normalize import normalize_node_regions
from app.services.itinerary_generate import build_itinerary as build_mock_itinerary
from app.services.llm_client import LLMClient, strip_json_fences
from app.services.streaming_json import extract_streaming_itinerary_preview

logger = logging.getLogger(__name__)

ITINERARY_LLM_SYSTEM = """你是旅行行程规划助手。根据用户的 TripRequest 生成行程 JSON。

输出**仅 JSON 对象**（无 markdown）：
{
  "title": "新加坡 4 日游",
  "days": [
    {
      "day_index": 1,
      "label": "第 1 天 · 抵达",
      "region": "市中心",
      "nodes": [
        {
          "name": "樟宜机场",
          "category": "airport",
          "start_time": "08:00",
          "end_time": "09:00",
          "region": "樟宜区",
          "is_optional": false
        }
      ]
    }
  ]
}

规则：
1. 天数与 trip_request.day_count 一致（未指定则 3 天）
2. 每天 3–6 个节点，category: airport|hotel|restaurant|snack|attraction|landmark|transit
3. 不要输出 lat/lng（后续地理编码）
4. 中文名称与 label；节点可含 tips[]（首条作总览摘要）、cost_label 或 cost{amount,currency,per}
5. 每天输出 weather: {temp_min,temp_max,icon,description}，icon 为 sunny|cloudy|overcast|rain|storm|snow
6. 每个节点必须含 region（片区/行政区）；同一天跨区时按实际地点填写，勿全部等同 day.region
7. 仅输出 JSON
"""


class _LLMNode(BaseModel):
    name: str
    category: str = "attraction"
    start_time: str | None = None
    end_time: str | None = None
    region: str | None = None
    is_optional: bool = False
    tips: list[str] = Field(default_factory=list)
    cost_label: str | None = None
    floor: str | None = None


class _LLMWeather(BaseModel):
    temp_min: int = 24
    temp_max: int = 32
    icon: str = "cloudy"
    description: str = "多云"


class _LLMDay(BaseModel):
    day_index: int
    label: str
    region: str | None = None
    weather: _LLMWeather | None = None
    nodes: list[_LLMNode] = Field(default_factory=list)


class _LLMItinerary(BaseModel):
    title: str
    days: list[_LLMDay] = Field(default_factory=list)


def _category_ok(c: str) -> str:
    allowed = {"airport", "hotel", "restaurant", "snack", "attraction", "landmark", "transit"}
    return c if c in allowed else "attraction"


def _weather_ok(icon: str) -> str:
    allowed = {"sunny", "cloudy", "overcast", "rain", "storm", "snow"}
    i = icon.strip().lower()
    return i if i in allowed else "cloudy"


def _llm_to_itinerary(raw: dict[str, Any], trip_request: TripRequestIn, *, geocoded: bool) -> dict[str, Any]:
    parsed = _LLMItinerary.model_validate(raw)
    dest = (trip_request.destination or "").strip() or "目的地"
    days_out: list[dict[str, Any]] = []

    for i, day in enumerate(parsed.days):
        day_num = day.day_index or (i + 1)
        nodes_out: list[dict[str, Any]] = []

        for j, node in enumerate(day.nodes):
            nid = f"d{day_num}-n{j + 1}"
            node_out: dict[str, Any] = {
                "id": nid,
                "name": node.name,
                "category": _category_ok(node.category),
                "lat": 0,
                "lng": 0,
                "start_time": node.start_time,
                "end_time": node.end_time,
                "region": node.region or day.region,
                "is_optional": node.is_optional,
                "coord_confidence": "none",
            }
            if node.floor:
                node_out["floor"] = node.floor
            if node.tips:
                node_out["tips"] = node.tips
            if node.cost_label:
                node_out["cost_label"] = node.cost_label
            nodes_out.append(node_out)

        edges_out: list[dict[str, Any]] = []
        for j in range(1, len(nodes_out)):
            edges_out.append({
                "id": f"d{day_num}-e{j}",
                "from": nodes_out[j - 1]["id"],
                "to": nodes_out[j]["id"],
                "type": "primary",
                "transport_mode": "walk",
                "duration_minutes": 20,
            })

        from datetime import date, timedelta
        base = date.today()
        d = base + timedelta(days=i)
        weekdays = "周一 周二 周三 周四 周五 周六 周日".split()

        day_out: dict[str, Any] = {
            "day_index": day_num,
            "date": d.isoformat(),
            "weekday": weekdays[d.weekday()],
            "label": day.label,
            "region": day.region,
            "nodes": nodes_out,
            "edges": edges_out,
        }
        if day.weather:
            day_out["weather"] = {
                "temp_min": day.weather.temp_min,
                "temp_max": day.weather.temp_max,
                "icon": _weather_ok(day.weather.icon),
                "description": day.weather.description,
                "source": "llm",
            }
        days_out.append(day_out)

    cross_day: list[dict[str, Any]] = []
    for i in range(len(days_out) - 1):
        from_nodes = days_out[i]["nodes"]
        to_nodes = days_out[i + 1]["nodes"]
        if from_nodes and to_nodes:
            cross_day.append({
                "id": f"xd-e{i + 1}",
                "from": from_nodes[-1]["id"],
                "to": to_nodes[0]["id"],
                "type": "primary",
                "transport_mode": "taxi",
                "duration_minutes": 25,
                "label": "跨日衔接",
            })

    warnings = ["LLM 生成行程"]
    if geocoded:
        warnings.append("已自动地理编码")
    else:
        warnings.append("坐标将在后台补全")

    return normalize_node_regions({
        "id": str(uuid.uuid4()),
        "title": parsed.title or f"{dest} {len(days_out)} 日游",
        "destination": dest,
        "timezone": "Asia/Singapore",
        "days": days_out,
        "cross_day_edges": cross_day,
        "meta": {
            "generated_at": "",
            "model": "llm",
            "locale": "zh-CN",
            "warnings": warnings,
        },
    })


def _build_generate_user(trip_request: TripRequestIn) -> str:
    return (
        f"trip_request: {trip_request.model_dump_json()}\n"
        f"free_text（用户完整意图）: {trip_request.free_text or '(无)'}\n"
        f"notes（补充约束）: {trip_request.notes or '(无)'}\n"
        f"preference_tags: {', '.join(trip_request.preference_tags) or '(无)'}\n"
        f"请生成 {trip_request.day_count or 3} 天行程，节点需体现用户偏好与 notes 中的约束（如交通、住宿、玩法）。"
    )


def _finalize_llm_itinerary(
    itinerary: dict[str, Any],
    client: LLMClient,
    dest: str,
    *,
    geocode: bool,
    settings: Settings,
) -> tuple[dict[str, Any], int | None, int | None]:
    from datetime import datetime, timezone

    itinerary["meta"]["generated_at"] = datetime.now(timezone.utc).isoformat()
    itinerary["meta"]["model"] = client.active_model
    llm_latency_ms = client.last_call_meta.get("latency_ms")
    geocode_ms: int | None = None

    if geocode and dest:
        started = time.perf_counter()
        itinerary = geocode_itinerary(itinerary, dest, max_workers=settings.geocode_max_workers)
        geocode_ms = int((time.perf_counter() - started) * 1000)
        itinerary["meta"]["warnings"] = ["LLM 生成行程", "已自动地理编码"]

    return itinerary, llm_latency_ms, geocode_ms


async def generate_itinerary_async(
    trip_request: TripRequestIn,
    client: LLMClient | None,
    *,
    geocode: bool = False,
    settings: Settings | None = None,
) -> tuple[dict[str, Any], int | None, int | None]:
    cfg = settings or get_settings()
    dest = (trip_request.destination or "").strip()

    if client and dest:
        try:
            user = _build_generate_user(trip_request)
            raw = await client.chat_json_async(
                system=ITINERARY_LLM_SYSTEM,
                user=user,
                temperature=0.4,
                model=cfg.llm_model,
                max_tokens=cfg.llm_max_tokens_generate,
                endpoint="generate",
            )
            itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)
            return _finalize_llm_itinerary(itinerary, client, dest, geocode=geocode, settings=cfg)
        except (ValidationError, ValueError, Exception) as e:
            logger.warning("LLM itinerary failed, fallback mock: %s", e)

    itinerary = build_mock_itinerary(trip_request)
    if geocode and dest:
        started = time.perf_counter()
        itinerary = geocode_itinerary(deepcopy(itinerary), dest, max_workers=cfg.geocode_max_workers)
        geocode_ms = int((time.perf_counter() - started) * 1000)
        return itinerary, None, geocode_ms
    return itinerary, None, None


async def _fix_truncated_itinerary_json_async(
    accumulated: str,
    trip_request: TripRequestIn,
    client: LLMClient,
    *,
    error: Exception,
) -> dict[str, Any]:
    finish = client.last_call_meta.get("finish_reason")
    logger.warning("itinerary JSON 不完整，修复轮: %s finish_reason=%s", error, finish)
    hint = (
        "输出可能被截断，请输出完整 JSON，每天 3–6 个节点即可。"
        if finish == "length"
        else ""
    )
    snippet = accumulated[:3000] + ("…" if len(accumulated) > 3000 else "")
    fix_user = (
        f"上一次输出不是合法 JSON，错误：{error}\n{hint}\n"
        f"不完整输出：\n{snippet}\n"
        f"请重新生成。trip_request: {trip_request.model_dump_json()}"
    )
    cfg = client.settings
    return await client.chat_json_async(
        system=ITINERARY_LLM_SYSTEM,
        user=fix_user,
        temperature=0.3,
        model=cfg.llm_model,
        max_tokens=cfg.llm_max_tokens_generate + 500,
        endpoint="generate_fix_json",
    )


async def generate_itinerary_stream_events(
    trip_request: TripRequestIn,
    client: LLMClient | None,
    *,
    geocode: bool = False,
    settings: Settings | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """SSE 事件流：llm delta（preview）→ result。"""
    import json
    import time

    cfg = settings or get_settings()
    dest = (trip_request.destination or "").strip()

    if not (client and dest):
        itinerary = build_mock_itinerary(trip_request)
        if geocode and dest:
            started = time.perf_counter()
            itinerary = geocode_itinerary(
                deepcopy(itinerary), dest, max_workers=cfg.geocode_max_workers
            )
            geocode_ms = int((time.perf_counter() - started) * 1000)
            yield {
                "event": "result",
                "data": {
                    "itinerary": itinerary,
                    "llm_latency_ms": None,
                    "geocode_latency_ms": geocode_ms,
                },
            }
            return
        yield {
            "event": "result",
            "data": {"itinerary": itinerary, "llm_latency_ms": None, "geocode_latency_ms": None},
        }
        return

    user = _build_generate_user(trip_request)
    yield {"event": "progress", "data": {"step": "llm", "status": "running"}}

    accumulated = ""
    async for delta in client.chat_json_stream_async(
        system=ITINERARY_LLM_SYSTEM,
        user=user,
        temperature=0.4,
        model=cfg.llm_model,
        max_tokens=cfg.llm_max_tokens_generate,
        endpoint="generate_stream",
    ):
        accumulated += delta
        preview = extract_streaming_itinerary_preview(accumulated)
        yield {
            "event": "delta",
            "data": {"preview": preview, "content": delta},
        }

    llm_ms = client.last_call_meta.get("latency_ms")
    yield {
        "event": "progress",
        "data": {
            "step": "llm",
            "status": "done",
            "latency_ms": llm_ms,
            "prompt_tokens": client.last_call_meta.get("prompt_tokens"),
            "completion_tokens": client.last_call_meta.get("completion_tokens"),
        },
    }

    try:
        raw = json.loads(strip_json_fences(accumulated))
    except json.JSONDecodeError as e:
        yield {"event": "progress", "data": {"step": "validate", "status": "fixing"}}
        raw = await _fix_truncated_itinerary_json_async(
            accumulated, trip_request, client, error=e
        )

    try:
        itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)
    except ValidationError as e:
        yield {"event": "progress", "data": {"step": "validate", "status": "fixing"}}
        raw = await _fix_truncated_itinerary_json_async(
            accumulated, trip_request, client, error=e
        )
        itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)

    itinerary, llm_ms, geocode_ms = _finalize_llm_itinerary(
        itinerary, client, dest, geocode=geocode, settings=cfg
    )
    yield {
        "event": "result",
        "data": {
            "itinerary": itinerary,
            "llm_latency_ms": llm_ms,
            "geocode_latency_ms": geocode_ms,
        },
    }


def generate_itinerary(
    trip_request: TripRequestIn,
    client: LLMClient | None,
    *,
    geocode: bool = False,
    settings: Settings | None = None,
) -> tuple[dict[str, Any], int | None, int | None]:
    """同步包装，供测试或脚本使用。"""
    cfg = settings or get_settings()
    dest = (trip_request.destination or "").strip()

    if client and dest:
        try:
            user = _build_generate_user(trip_request)
            raw = client.chat_json(
                system=ITINERARY_LLM_SYSTEM,
                user=user,
                temperature=0.4,
                model=cfg.llm_model,
                max_tokens=cfg.llm_max_tokens_generate,
                endpoint="generate",
            )
            itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)
            return _finalize_llm_itinerary(itinerary, client, dest, geocode=geocode, settings=cfg)
        except (ValidationError, ValueError, Exception) as e:
            logger.warning("LLM itinerary failed, fallback mock: %s", e)

    itinerary = build_mock_itinerary(trip_request)
    if geocode and dest:
        started = time.perf_counter()
        itinerary = geocode_itinerary(deepcopy(itinerary), dest, max_workers=cfg.geocode_max_workers)
        geocode_ms = int((time.perf_counter() - started) * 1000)
        return itinerary, None, geocode_ms
    return itinerary, None, None
