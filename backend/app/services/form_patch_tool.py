"""
FormPatch 工具：LLM 输出 → 白名单校验 → 类型规范化 → FormPatchOut。

仅允许 TripRequest / Itinerary 已定义字段进入 patch，未知字段一律丢弃。
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.chat import FIELD_LABELS, ForkPlanPatch, FormPatchOut, TripRequestIn

# ── TripRequest 白名单（与 TripRequestIn / 前端 TripRequest 对齐）──

TRIP_REQUEST_FIELDS: frozenset[str] = frozenset(FIELD_LABELS.keys())

BUDGET_LEVELS: frozenset[str] = frozenset({"economy", "comfort", "luxury"})

PLANNING_STRATEGIES: frozenset[str] = frozenset(
    {"flight_hotel_first", "interest_then_anchors", "activity_first"}
)

NODE_CATEGORIES: frozenset[str] = frozenset(
    {"airport", "hotel", "restaurant", "snack", "attraction", "landmark", "transit"}
)

NODE_SETTABLE_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "category",
        "start_time",
        "end_time",
        "is_optional",
        "region",
        "floor",
        "tips",
        "tags",
        "cost_label",
        "cost",
        "scene_group",
        "duration_minutes",
        "address",
    }
)

DAY_WEATHER_FIELDS: frozenset[str] = frozenset(
    {"temp_min", "temp_max", "icon", "description"}
)

WEATHER_ICONS: frozenset[str] = frozenset(
    {"sunny", "cloudy", "overcast", "rain", "storm", "snow"}
)

COST_PER_VALUES: frozenset[str] = frozenset({"person", "total", "group"})

EDGE_PATCHABLE_FIELDS: frozenset[str] = frozenset(
    {
        "transport_mode",
        "duration_minutes",
        "distance_meters",
        "label",
        "depart_time",
        "arrive_time",
        "type",
    }
)

TRANSPORT_MODES: frozenset[str] = frozenset(
    {"walk", "subway", "bus", "taxi", "flight", "ferry"}
)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")
NODE_PATH_RE = re.compile(r"^days\[(\d+)\]\.nodes\[([^\]]+)\](?:\.(.+))?$")
EDGE_PATH_RE = re.compile(r"^days\[(\d+)\]\.edges\[([^\]]+)\]$")
WEATHER_PATH_RE = re.compile(r"^days\[(\d+)\]\.weather(?:\.(.+))?$")


class LLMPatchItem(BaseModel):
    """LLM 原始 patch 项（宽松接收）"""

    action: str
    field: str | None = None
    field_path: str | None = None
    value: Any = None
    new_value: Any = None
    summary: str = ""
    confidence: str | None = None
    fork_plan: dict[str, Any] | None = None


class LLMParseToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class LLMParseToolResult(BaseModel):
    reply: str
    patches: list[LLMPatchItem] = Field(default_factory=list)
    tool_calls: list[LLMParseToolCall] = Field(default_factory=list)


def form_patch_tool_schema_doc() -> str:
    """注入 system prompt：明确工具可用字段。"""
    return (
        "【update_trip_request 工具】仅允许 field："
        + ", ".join(sorted(TRIP_REQUEST_FIELDS))
        + "。preference_tags 必须用 action=append 且每次一个标签。"
        " budget_level 仅 economy/comfort/luxury。"
        " 禁止返回 TripRequest 以外的字段名。"
        "\n【update_itinerary 工具】supplement 模式：add_node / update_edge / 节点 set。"
        f" add_node.node 仅允许：{', '.join(sorted(NODE_SETTABLE_FIELDS))}。"
        f" update_edge.patch 仅允许：{', '.join(sorted(EDGE_PATCHABLE_FIELDS))}。"
        "\n【search_flights 工具】用户明确要求搜机票/查价时，可另输出 tool_calls："
        '[{"name":"search_flights","args":{"origin":"PVG","destination":"SIN","date":"2026-10-16",'
        '"return_date":null,"adults":1,"preference":"balanced"}}]。'
        " origin/destination 优先 IATA 三字码；date 为 YYYY-MM-DD。"
        " **禁止在 reply 或 patches 中编造票价、航班号或时刻**；真实报价由后端 Ignav 返回。"
        " 缺 OD 或日期时不要发 tool_calls，只在 reply 追问。"
        " 发 search_flights 时仍须同步输出 departure/destination/date_start/(date_end)/travelers 的 patches。"
    )


def describe_dropped_patch(raw: LLMPatchItem, chat_mode: str) -> str:
    action = raw.action
    field_path = raw.field_path or raw.field or ""
    if chat_mode == "global" and action in ("add_node", "add_day"):
        return f"global 模式不支持 {action}，已忽略"
    if chat_mode == "global" and field_path and field_path not in TRIP_REQUEST_FIELDS:
        return f"字段 {field_path} 不在 TripRequest 结构中，已忽略"
    if action == "fork_plan" and not (raw.fork_plan or {}).get("destination") and not raw.value:
        return "fork_plan 缺少 destination，已忽略"
    return f"patch 未通过 schema 校验（action={action}, field={field_path or '-'}），已忽略"


def _coerce_positive_int(value: Any) -> int | None:
    try:
        n = int(value)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def coerce_trip_request_value(field: str, action: str, value: Any) -> Any | None:
    """规范化 TripRequest 字段值；无法规范化则返回 None（丢弃 patch）。"""
    if field not in TRIP_REQUEST_FIELDS:
        return None

    if action == "append":
        if field != "preference_tags":
            return None
        return _coerce_string(value)

    if action == "remove":
        if field != "preference_tags":
            return None
        return _coerce_string(value)

    if action != "set":
        return None

    if field in ("day_count", "travelers"):
        return _coerce_positive_int(value)

    if field == "hotel_budget_per_night":
        if value is None or value == "":
            return None
        try:
            n = float(value)
        except (TypeError, ValueError):
            return None
        return n if n >= 0 else None

    if field == "budget_level":
        if value is None:
            return None
        level = str(value).strip().lower()
        return level if level in BUDGET_LEVELS else None

    if field == "planning_strategy":
        if value is None:
            return None
        s = str(value).strip().lower()
        return s if s in PLANNING_STRATEGIES else None

    if field in ("date_start", "date_end"):
        s = _coerce_string(value)
        if not s or not DATE_RE.match(s):
            return None
        return s

    if field == "preference_tags":
        if isinstance(value, list):
            tags = [_coerce_string(v) for v in value]
            return [t for t in tags if t]
        return None

    return _coerce_string(value) if field != "free_text" else str(value) if value is not None else ""


def _coerce_node_cost(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    out: dict[str, Any] = {}
    if value.get("amount") is not None:
        try:
            out["amount"] = float(value["amount"])
        except (TypeError, ValueError):
            pass
    if value.get("currency") is not None:
        c = _coerce_string(value["currency"])
        if c:
            out["currency"] = c.upper()
    if value.get("per") is not None:
        p = str(value["per"]).strip()
        if p in COST_PER_VALUES:
            out["per"] = p
    if value.get("note") is not None:
        note = _coerce_string(value["note"])
        if note:
            out["note"] = note
    return out if out else None


def sanitize_node_partial(node: dict[str, Any]) -> dict[str, Any] | None:
    name = _coerce_string(node.get("name"))
    if not name:
        return None
    out: dict[str, Any] = {"name": name}
    for key in NODE_SETTABLE_FIELDS:
        if key == "name":
            continue
        if key not in node or node[key] is None:
            continue
        val = node[key]
        if key == "category":
            cat = str(val).strip().lower()
            if cat in NODE_CATEGORIES:
                out["category"] = cat
        elif key == "is_optional":
            out["is_optional"] = bool(val)
        elif key in ("start_time", "end_time"):
            s = _coerce_string(val)
            if s and TIME_RE.match(s):
                out[key] = s
        elif key == "tips" and isinstance(val, list):
            out["tips"] = [str(t).strip() for t in val if str(t).strip()]
        elif key == "tags" and isinstance(val, list):
            out["tags"] = [str(t).strip() for t in val if str(t).strip()]
        elif key == "cost":
            cost = _coerce_node_cost(val)
            if cost:
                out["cost"] = cost
        elif key == "cost_label":
            s = _coerce_string(val)
            if s:
                out["cost_label"] = s
        else:
            s = _coerce_string(val)
            if s:
                out[key] = s
    if "is_optional" not in out:
        out["is_optional"] = False
    return out


def sanitize_add_node_payload(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    day_index = _coerce_positive_int(value.get("day_index", 1))
    if not day_index:
        return None
    node_raw = value.get("node")
    if not isinstance(node_raw, dict):
        return None
    node = sanitize_node_partial(node_raw)
    if not node:
        return None
    out: dict[str, Any] = {"day_index": day_index, "node": node}
    for opt in ("connect_after", "insert_before"):
        s = _coerce_string(value.get(opt))
        if s:
            out[opt] = s
    if value.get("position") in ("start", "end"):
        out["position"] = value["position"]
    return out


def sanitize_update_edge_payload(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    edge_id = _coerce_string(value.get("edge_id"))
    edge_patch = value.get("patch")
    if not edge_id or not isinstance(edge_patch, dict):
        return None
    patch_out: dict[str, Any] = {}
    for key, val in edge_patch.items():
        if key not in EDGE_PATCHABLE_FIELDS:
            continue
        if key == "transport_mode":
            mode = str(val).strip().lower()
            if mode in TRANSPORT_MODES:
                patch_out["transport_mode"] = mode
        elif key == "duration_minutes":
            n = _coerce_positive_int(val)
            if n:
                patch_out["duration_minutes"] = n
        elif key == "distance_meters":
            n = _coerce_positive_int(val)
            if n:
                patch_out["distance_meters"] = n
        elif key == "type" and val in ("primary", "alternative"):
            patch_out["type"] = val
        else:
            s = _coerce_string(val)
            if s:
                patch_out[key] = s
    if not patch_out:
        return None
    result: dict[str, Any] = {"edge_id": edge_id, "patch": patch_out}
    day_index = _coerce_positive_int(value.get("day_index"))
    if day_index:
        result["day_index"] = day_index
    return result


def resolve_old_value(
    *,
    field_path: str,
    target: str,
    action: str,
    trip_request: TripRequestIn,
    itinerary: dict[str, Any] | None,
    new_value: Any,
) -> Any:
    if action == "fork_plan" or (field_path == "destination" and action in ("set", "append", "remove")):
        return trip_request.destination or None

    if target == "trip_request" and field_path in TRIP_REQUEST_FIELDS:
        current = trip_request.model_dump().get(field_path)
        if field_path == "preference_tags" and action == "append":
            return list(trip_request.preference_tags)
        return current

    if not itinerary:
        return None

    node_match = NODE_PATH_RE.match(field_path)
    if node_match and target == "node":
        day_idx = int(node_match.group(1)) - 1
        node_id = node_match.group(2)
        sub_field = node_match.group(3)
        days = itinerary.get("days", [])
        if 0 <= day_idx < len(days):
            for node in days[day_idx].get("nodes", []):
                if node.get("id") == node_id:
                    if sub_field:
                        return node.get(sub_field)
                    return {"name": node.get("name"), "id": node_id}

    edge_match = EDGE_PATH_RE.match(field_path)
    if edge_match and target == "edge" and action == "update_edge":
        day_idx = int(edge_match.group(1)) - 1
        edge_id = edge_match.group(2)
        days = itinerary.get("days", [])
        if 0 <= day_idx < len(days):
            for edge in days[day_idx].get("edges", []):
                if edge.get("id") == edge_id:
                    if isinstance(new_value, dict) and new_value.get("patch"):
                        patch_keys = new_value["patch"].keys()
                        return {k: edge.get(k) for k in patch_keys if k in edge}
                    return edge

    if field_path.startswith("cross_day_edges") and isinstance(new_value, dict):
        edge_id = new_value.get("edge_id")
        for edge in itinerary.get("cross_day_edges") or []:
            if edge.get("id") == edge_id:
                patch = new_value.get("patch") or {}
                return {k: edge.get(k) for k in patch.keys() if k in edge}

    return None


def normalize_patch_from_llm(
    raw: LLMPatchItem,
    chat_mode: Literal["global", "supplement"],
    trip_request: TripRequestIn,
    itinerary: dict[str, Any] | None,
) -> FormPatchOut | None:
    """LLM patch → 白名单校验 + 类型规范化 → FormPatchOut；无效返回 None。"""
    action = raw.action
    if chat_mode == "global" and action in ("add_node", "add_day", "update_edge"):
        return None

    field_path = raw.field_path or raw.field or ""
    raw_value = raw.new_value if raw.new_value is not None else raw.value
    confidence = raw.confidence if raw.confidence in ("high", "medium", "low") else None

    patch: FormPatchOut | None = None

    if action == "fork_plan":
        dest = (raw.fork_plan or {}).get("destination") or raw_value
        dest_str = _coerce_string(dest)
        if not dest_str:
            return None
        patch = FormPatchOut(
            id=str(uuid.uuid4()),
            target="trip_request",
            action="fork_plan",
            field_path="destination",
            label=FIELD_LABELS["destination"],
            new_value=dest_str,
            summary=raw.summary or f"换目的地：{dest_str}",
            confidence=confidence,  # type: ignore[arg-type]
            fork_plan=ForkPlanPatch(
                destination=dest_str,
                inherit_fields=(raw.fork_plan or {}).get(
                    "inherit_fields",
                    ["preference_tags", "travelers", "budget_level"],
                ),
            ),
        )

    elif action == "add_node":
        if chat_mode != "supplement":
            return None
        sanitized = sanitize_add_node_payload(raw_value)
        if not sanitized:
            return None
        day_index = sanitized["day_index"]
        node_name = sanitized["node"]["name"]
        fp = field_path if field_path.startswith("days[") else f"days[{day_index}].nodes"
        patch = FormPatchOut(
            id=str(uuid.uuid4()),
            target="node",
            action="add_node",
            field_path=fp,
            label=node_name,
            new_value=sanitized,
            summary=raw.summary or f"新增节点：{node_name}",
            confidence=confidence,  # type: ignore[arg-type]
        )

    elif action == "update_edge":
        if chat_mode != "supplement":
            return None
        sanitized = sanitize_update_edge_payload(raw_value)
        if not sanitized:
            return None
        edge_id = sanitized["edge_id"]
        fp = field_path or f"days[1].edges[{edge_id}]"
        label = str(sanitized["patch"].get("label") or raw.summary or f"连线 {edge_id}")
        patch = FormPatchOut(
            id=str(uuid.uuid4()),
            target="edge",  # type: ignore[arg-type]
            action="update_edge",  # type: ignore[arg-type]
            field_path=fp,
            label=label,
            new_value=sanitized,
            summary=raw.summary or label,
            confidence=confidence,  # type: ignore[arg-type]
        )

    elif action in ("set", "append", "remove"):
        if not field_path:
            return None

        if chat_mode == "supplement" and field_path == "destination":
            dest_str = _coerce_string(raw_value)
            if not dest_str:
                return None
            patch = FormPatchOut(
                id=str(uuid.uuid4()),
                target="trip_request",
                action="fork_plan",
                field_path="destination",
                label=FIELD_LABELS["destination"],
                new_value=dest_str,
                summary=raw.summary or f"换目的地：{dest_str}",
                confidence=confidence,  # type: ignore[arg-type]
                fork_plan=ForkPlanPatch(destination=dest_str),
            )

        elif chat_mode == "global":
            if field_path not in TRIP_REQUEST_FIELDS:
                return None
            coerced = coerce_trip_request_value(field_path, action, raw_value)
            if coerced is None and action == "set" and field_path != "free_text":
                return None
            if coerced is None and action in ("append", "remove"):
                return None
            patch = FormPatchOut(
                id=str(uuid.uuid4()),
                target="trip_request",
                action=action,  # type: ignore[arg-type]
                field_path=field_path,
                label=FIELD_LABELS.get(field_path, field_path),
                new_value=coerced if coerced is not None else "",
                summary=raw.summary or f"修改 {field_path}",
                confidence=confidence,  # type: ignore[arg-type]
            )

        elif chat_mode == "supplement":
            node_match = NODE_PATH_RE.match(field_path)
            if node_match and action == "set":
                sub_field = node_match.group(3)
                if not sub_field or sub_field not in NODE_SETTABLE_FIELDS:
                    return None
                if sub_field == "category":
                    coerced = str(raw_value).strip().lower()
                    if coerced not in NODE_CATEGORIES:
                        return None
                elif sub_field in ("start_time", "end_time"):
                    coerced = _coerce_string(raw_value)
                    if not coerced or not TIME_RE.match(coerced):
                        return None
                elif sub_field == "is_optional":
                    coerced = bool(raw_value)
                elif sub_field in ("tips", "tags"):
                    if not isinstance(raw_value, list):
                        return None
                    coerced = [str(t).strip() for t in raw_value if str(t).strip()]
                elif sub_field == "cost":
                    coerced = _coerce_node_cost(raw_value)
                    if not coerced:
                        return None
                elif sub_field == "cost_label":
                    coerced = _coerce_string(raw_value) or ""
                else:
                    coerced = _coerce_string(raw_value)
                    if not coerced and sub_field != "cost_label":
                        return None
                patch = FormPatchOut(
                    id=str(uuid.uuid4()),
                    target="node",
                    action="set",
                    field_path=field_path,
                    label=sub_field,
                    new_value=coerced,
                    summary=raw.summary or f"修改 {field_path}",
                    confidence=confidence,  # type: ignore[arg-type]
                )
            elif action == "set":
                weather_match = WEATHER_PATH_RE.match(field_path)
                if weather_match:
                    sub_field = weather_match.group(2)
                    if not sub_field or sub_field not in DAY_WEATHER_FIELDS:
                        return None
                    if sub_field in ("temp_min", "temp_max"):
                        try:
                            coerced = int(raw_value)
                        except (TypeError, ValueError):
                            return None
                    elif sub_field == "icon":
                        coerced = str(raw_value).strip().lower()
                        if coerced not in WEATHER_ICONS:
                            return None
                    else:
                        coerced = _coerce_string(raw_value)
                        if not coerced:
                            return None
                    patch = FormPatchOut(
                        id=str(uuid.uuid4()),
                        target="day",
                        action="set",
                        field_path=field_path,
                        label=sub_field,
                        new_value=coerced,
                        summary=raw.summary or f"修改 {field_path}",
                        confidence=confidence,  # type: ignore[arg-type]
                    )
                else:
                    return None
            else:
                return None

    if patch is None:
        return None

    old_value = resolve_old_value(
        field_path=patch.field_path,
        target=patch.target,
        action=patch.action,
        trip_request=trip_request,
        itinerary=itinerary,
        new_value=patch.new_value,
    )
    if old_value is not None:
        patch = patch.model_copy(update={"old_value": old_value})
    return patch


def expand_preference_tag_patches(raw: FormPatchOut) -> list[FormPatchOut]:
    if (
        raw.action == "set"
        and raw.field_path == "preference_tags"
        and isinstance(raw.new_value, list)
    ):
        return [
            FormPatchOut(
                id=str(uuid.uuid4()),
                target="trip_request",
                action="append",
                field_path="preference_tags",
                label=FIELD_LABELS["preference_tags"],
                old_value=raw.old_value,
                new_value=str(tag),
                summary=f"偏好：{tag}",
                confidence=raw.confidence,
            )
            for tag in raw.new_value
            if tag
        ]
    return [raw]


def process_llm_patches(
    items: list[LLMPatchItem],
    chat_mode: Literal["global", "supplement"],
    trip_request: TripRequestIn,
    itinerary: dict[str, Any] | None,
) -> tuple[list[FormPatchOut], list[str], int]:
    patches: list[FormPatchOut] = []
    warnings: list[str] = []
    dropped = 0

    for item in items:
        norm = normalize_patch_from_llm(item, chat_mode, trip_request, itinerary)
        if norm is None:
            dropped += 1
            warnings.append(describe_dropped_patch(item, chat_mode))
            continue
        patches.extend(expand_preference_tag_patches(norm))

    if dropped and not patches and items:
        warnings.append(
            f"LLM 返回 {len(items)} 条 patch 均未通过 schema 校验，请补充说明或换一种表述"
        )
    elif dropped:
        warnings.append(f"已忽略 {dropped} 条不在数据结构内的 patch")

    return patches, warnings, dropped
