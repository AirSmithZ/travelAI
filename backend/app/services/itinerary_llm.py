import json
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
8. 若 user 消息含「已确认机酒硬约束」：必须遵守；不得编造或改写航班时刻/机场；Day1 活动不早于抵达；住宿贴近已确认酒店或片区
9. 若 user 消息含「参考公开笔记」：优先安排多条笔记共同提到的 POI；冲突时以机酒硬约束为准；禁止编造点赞数；无 URL 不得写具体出处；票价/酒店价不得从笔记摘要写入
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


def _parse_trip_start_date(trip_request: TripRequestIn):
    """DATA-01: prefer TripRequest.date_start; never silently use today when start is set."""
    from datetime import date, datetime, timedelta

    raw = (trip_request.date_start or "").strip()
    if raw:
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
            try:
                return datetime.strptime(raw[:10], fmt).date()
            except ValueError:
                continue
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            logger.warning("invalid date_start=%r, falling back to today", raw)
    return date.today()


def _timezone_for_destination(destination: str) -> str:
    """DATA-02 light: coarse city→tz map (full mapping remains DATA-02)."""
    d = (destination or "").strip().lower()
    if any(k in d for k in ("新加坡", "singapore", "sin")):
        return "Asia/Singapore"
    if any(k in d for k in ("东京", "大阪", "京都", "日本", "tokyo", "osaka", "japan")):
        return "Asia/Tokyo"
    if any(k in d for k in ("曼谷", "清迈", "泰国", "bangkok", "thailand")):
        return "Asia/Bangkok"
    if any(k in d for k in ("首尔", "韩国", "seoul", "korea")):
        return "Asia/Seoul"
    if any(k in d for k in ("上海", "北京", "深圳", "广州", "杭州", "成都", "中国")):
        return "Asia/Shanghai"
    return "UTC"


def _llm_to_itinerary(raw: dict[str, Any], trip_request: TripRequestIn, *, geocoded: bool) -> dict[str, Any]:
    from datetime import timedelta

    parsed = _LLMItinerary.model_validate(raw)
    dest = (trip_request.destination or "").strip() or "目的地"
    days_out: list[dict[str, Any]] = []
    base = _parse_trip_start_date(trip_request)
    weekdays = "周一 周二 周三 周四 周五 周六 周日".split()

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

        d = base + timedelta(days=i)

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
        "timezone": _timezone_for_destination(dest),
        "days": days_out,
        "cross_day_edges": cross_day,
        "meta": {
            "generated_at": "",
            "model": "llm",
            "locale": "zh-CN",
            "warnings": warnings,
        },
    })


def _compact_flight(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "sequence": f.get("sequence"),
        "role": f.get("role"),
        "origin_iata": f.get("origin_iata"),
        "dest_iata": f.get("dest_iata"),
        "depart_at": f.get("depart_at"),
        "arrive_at": f.get("arrive_at"),
        "airline": f.get("airline"),
        "flight_numbers": f.get("flight_numbers"),
        "is_anchor": f.get("is_anchor", True),
    }


def _compact_hotel(h: dict[str, Any]) -> dict[str, Any]:
    return {
        "sequence": h.get("sequence"),
        "name": h.get("name"),
        "city": h.get("city"),
        "check_in": h.get("check_in"),
        "check_out": h.get("check_out"),
        "is_primary": h.get("is_primary"),
        "zone_id": h.get("zone_id"),
        "address": h.get("address"),
        "lat": h.get("lat"),
        "lng": h.get("lng"),
    }


def _compact_zone(z: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": z.get("id"),
        "label": z.get("label"),
        "city": z.get("city"),
        "status": z.get("status"),
        "check_in": z.get("check_in"),
        "check_out": z.get("check_out"),
        "covers_day_indices": z.get("covers_day_indices"),
        "anchor_hints": z.get("anchor_hints"),
        "rationale": z.get("rationale"),
        "geometry": z.get("geometry"),
    }


def _format_travel_intel_block(travel_intel: dict[str, Any] | None) -> str:
    if not travel_intel:
        return ""

    flights = [_compact_flight(f) for f in (travel_intel.get("flights") or []) if isinstance(f, dict)]
    hotels = [_compact_hotel(h) for h in (travel_intel.get("hotels") or []) if isinstance(h, dict)]
    zones_raw = travel_intel.get("recommended_stay_zones") or []
    zones = [
        _compact_zone(z)
        for z in zones_raw
        if isinstance(z, dict) and z.get("status") in (None, "proposed", "confirmed")
    ]
    confirmed_zones = [z for z in zones if z.get("status") == "confirmed"] or zones

    if not flights and not hotels and not confirmed_zones:
        return ""

    lines = [
        "",
        "===== 已确认机酒硬约束（HARD CONSTRAINTS，必须遵守）=====",
        "1. 不得编造或修改下列航班时刻/机场/航司；Day1 首个节点须衔接抵达（airport 或入境），活动不早于 arrive_at。",
        "2. 每日晚宿须靠近已确认酒店或住宿片区（region/名称体现片区）；勿另起无关住宿中心。",
        "3. 回程/城际航班日须预留去机场时间；跨日航班衔接可用 transit/airport 节点。",
        "4. 仅在下列锚点之上排 POI 与市内交通。",
    ]
    if flights:
        lines.append(f"confirmed_flights: {json.dumps(flights, ensure_ascii=False)}")
    if hotels:
        lines.append(f"confirmed_hotels: {json.dumps(hotels, ensure_ascii=False)}")
    if confirmed_zones:
        lines.append(f"recommended_stay_zones: {json.dumps(confirmed_zones, ensure_ascii=False)}")
    lines.append("===== END HARD CONSTRAINTS =====")
    return "\n".join(lines)


def _travel_intel_as_dict(travel_intel: Any) -> dict[str, Any] | None:
    if travel_intel is None:
        return None
    if isinstance(travel_intel, dict):
        return travel_intel
    if hasattr(travel_intel, "model_dump"):
        return travel_intel.model_dump()
    return None


def _format_evidence_block(evidence: list[dict[str, Any]] | None) -> str:
    """WS-04 minimal: inject public-note evidence for POI corroboration (not fares)."""
    if not evidence:
        return ""
    compact: list[dict[str, Any]] = []
    for e in evidence[:12]:
        if not isinstance(e, dict):
            continue
        row: dict[str, Any] = {
            "title": e.get("title"),
            "url": e.get("url"),
            "snippet": (e.get("snippet") or e.get("content") or "")[:240],
            "source": e.get("source") or "tikhub_xhs",
        }
        if e.get("likes") is not None:
            row["likes"] = e.get("likes")
        if e.get("query"):
            row["query"] = e.get("query")
        if row.get("title") or row.get("url"):
            compact.append(row)
    if not compact:
        return ""
    return (
        "\n\n===== 参考公开笔记（印证，非票价）=====\n"
        "优先安排下列笔记中反复出现的 POI；与机酒硬约束冲突时以机酒为准；"
        "勿编造赞数/出处；勿把摘要里的价格写入行程。\n"
        f"{json.dumps(compact, ensure_ascii=False)}\n"
        "===== END EVIDENCE ====="
    )


def _attach_evidence_meta(
    itinerary: dict[str, Any],
    evidence: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    if not evidence:
        return itinerary
    meta = itinerary.setdefault("meta", {})
    meta["evidence"] = evidence
    warnings = list(meta.get("warnings") or [])
    note = f"已注入 {len(evidence)} 条公开笔记印证"
    if note not in warnings:
        warnings.append(note)
    meta["warnings"] = warnings
    return itinerary


def _build_generate_user(
    trip_request: TripRequestIn,
    travel_intel: dict[str, Any] | None = None,
    evidence: list[dict[str, Any]] | None = None,
) -> str:
    intel_block = _format_travel_intel_block(travel_intel)
    evidence_block = _format_evidence_block(evidence)
    return (
        f"trip_request: {trip_request.model_dump_json()}\n"
        f"free_text（用户完整意图）: {trip_request.free_text or '(无)'}\n"
        f"notes（补充约束）: {trip_request.notes or '(无)'}\n"
        f"preference_tags: {', '.join(trip_request.preference_tags) or '(无)'}\n"
        f"请生成 {trip_request.day_count or 3} 天行程，节点需体现用户偏好与 notes 中的约束（如交通、住宿、玩法）。"
        f"{intel_block}"
        f"{evidence_block}"
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
        # Preserve geocode fence / failure warnings and evidence notes (GEO-02 · WS-04)
        prior = [
            w
            for w in (itinerary.get("meta") or {}).get("warnings") or []
            if isinstance(w, str)
            and w not in ("LLM 生成行程", "已自动地理编码", "坐标将在后台补全")
        ]
        itinerary["meta"]["warnings"] = ["LLM 生成行程", "已自动地理编码", *prior]

    return itinerary, llm_latency_ms, geocode_ms


async def generate_itinerary_async(
    trip_request: TripRequestIn,
    client: LLMClient | None,
    *,
    geocode: bool = False,
    settings: Settings | None = None,
    travel_intel: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], int | None, int | None]:
    from app.services.ugc.evidence_pack import fetch_evidence_pack

    cfg = settings or get_settings()
    dest = (trip_request.destination or "").strip()
    intel = _travel_intel_as_dict(travel_intel)
    evidence: list[dict[str, Any]] = []
    if dest:
        evidence = await fetch_evidence_pack(
            dest, trip_request.day_count, settings=cfg
        )

    if client and dest:
        try:
            user = _build_generate_user(trip_request, intel, evidence)
            raw = await client.chat_json_async(
                system=ITINERARY_LLM_SYSTEM,
                user=user,
                temperature=0.4,
                model=cfg.llm_model,
                max_tokens=cfg.llm_max_tokens_generate,
                endpoint="generate",
            )
            itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)
            itinerary = _attach_evidence_meta(itinerary, evidence)
            return _finalize_llm_itinerary(itinerary, client, dest, geocode=geocode, settings=cfg)
        except (ValidationError, ValueError) as e:
            # llm-api-engineering: do not silently degrade structured output to mock
            logger.warning("LLM itinerary validation failed: %s", e)
            raise
        except Exception as e:
            logger.exception("LLM itinerary failed: %s", type(e).__name__)
            raise

    # No LLM client / empty destination → deterministic mock (dev / tests)
    itinerary = build_mock_itinerary(trip_request)
    itinerary = _attach_evidence_meta(itinerary, evidence)
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
    travel_intel: dict[str, Any] | None = None,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    finish = client.last_call_meta.get("finish_reason")
    logger.warning("itinerary JSON 不完整，修复轮: %s finish_reason=%s", error, finish)
    hint = (
        "输出可能被截断，请输出完整 JSON，每天 3–6 个节点即可。"
        if finish == "length"
        else ""
    )
    snippet = accumulated[:3000] + ("…" if len(accumulated) > 3000 else "")
    intel_block = _format_travel_intel_block(travel_intel)
    evidence_block = _format_evidence_block(evidence)
    fix_user = (
        f"上一次输出不是合法 JSON，错误：{error}\n{hint}\n"
        f"不完整输出：\n{snippet}\n"
        f"请重新生成。trip_request: {trip_request.model_dump_json()}"
        f"{intel_block}"
        f"{evidence_block}"
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
    travel_intel: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """SSE 事件流：llm delta（preview）→ result。"""
    from app.services.ugc.evidence_pack import fetch_evidence_pack

    cfg = settings or get_settings()
    dest = (trip_request.destination or "").strip()
    intel = _travel_intel_as_dict(travel_intel)
    evidence: list[dict[str, Any]] = []
    if dest:
        yield {"event": "progress", "data": {"step": "evidence", "status": "running"}}
        evidence = await fetch_evidence_pack(
            dest, trip_request.day_count, settings=cfg
        )
        yield {
            "event": "progress",
            "data": {
                "step": "evidence",
                "status": "done",
                "count": len(evidence),
            },
        }

    if not (client and dest):
        itinerary = build_mock_itinerary(trip_request)
        itinerary = _attach_evidence_meta(itinerary, evidence)
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

    user = _build_generate_user(trip_request, intel, evidence)
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
            accumulated,
            trip_request,
            client,
            error=e,
            travel_intel=intel,
            evidence=evidence,
        )

    try:
        itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)
    except ValidationError as e:
        yield {"event": "progress", "data": {"step": "validate", "status": "fixing"}}
        raw = await _fix_truncated_itinerary_json_async(
            accumulated,
            trip_request,
            client,
            error=e,
            travel_intel=intel,
            evidence=evidence,
        )
        itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)

    itinerary = _attach_evidence_meta(itinerary, evidence)
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
    travel_intel: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], int | None, int | None]:
    """同步包装，供测试或脚本使用。"""
    from app.services.ugc.evidence_pack import fetch_evidence_pack_sync

    cfg = settings or get_settings()
    dest = (trip_request.destination or "").strip()
    intel = _travel_intel_as_dict(travel_intel)
    evidence: list[dict[str, Any]] = []
    if dest:
        evidence = fetch_evidence_pack_sync(
            dest, trip_request.day_count, settings=cfg
        )

    if client and dest:
        try:
            user = _build_generate_user(trip_request, intel, evidence)
            raw = client.chat_json(
                system=ITINERARY_LLM_SYSTEM,
                user=user,
                temperature=0.4,
                model=cfg.llm_model,
                max_tokens=cfg.llm_max_tokens_generate,
                endpoint="generate",
            )
            itinerary = _llm_to_itinerary(raw, trip_request, geocoded=geocode)
            itinerary = _attach_evidence_meta(itinerary, evidence)
            return _finalize_llm_itinerary(itinerary, client, dest, geocode=geocode, settings=cfg)
        except (ValidationError, ValueError) as e:
            logger.warning("LLM itinerary validation failed: %s", e)
            raise
        except Exception as e:
            logger.exception("LLM itinerary failed: %s", type(e).__name__)
            raise

    itinerary = build_mock_itinerary(trip_request)
    itinerary = _attach_evidence_meta(itinerary, evidence)
    if geocode and dest:
        started = time.perf_counter()
        itinerary = geocode_itinerary(deepcopy(itinerary), dest, max_workers=cfg.geocode_max_workers)
        geocode_ms = int((time.perf_counter() - started) * 1000)
        return itinerary, None, geocode_ms
    return itinerary, None, None
