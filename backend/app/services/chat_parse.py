import json
import logging
from typing import Any

from pydantic import ValidationError

from app.schemas.chat import ChatParseRequest, ChatParseResponse, ChatParseSelectionIn, expected_chat_mode
from app.services.form_patch_tool import (
    LLMParseToolResult,
    form_patch_tool_schema_doc,
    process_llm_patches,
)
from app.services.llm_client import LLMClient
from app.services.streaming_json import extract_streaming_reply

logger = logging.getLogger(__name__)

_TOOL_DOC = form_patch_tool_schema_doc()

GLOBAL_SYSTEM = f"""你是旅行规划助手。用户用中文描述行程需求（global 模式，尚未生成详细行程）。

{_TOOL_DOC}

输出**仅 JSON 对象**（无 markdown 围栏）：
{{
  "reply": "给用户的简短中文回复，说明已提取哪些信息、需用户确认后才会写入并生成路线图",
  "patches": [
    {{"action": "set", "field": "destination", "value": "亚庇", "summary": "目的地：亚庇"}},
    {{"action": "append", "field": "preference_tags", "value": "潜水", "summary": "偏好：潜水"}}
  ]
}}

规则：
1. 只解析用户明确提到的字段，不要编造
2. 必须使用 update_trip_request 工具允许的 field，禁止自创字段名
3. preference_tags 每个标签单独一条 patch，action 必须为 append（禁止 set 数组）
4. free_text：用一句话概括用户完整意图；用户描述较长时必须输出
5. 具体金额预算写入 notes；budget_level 仅 economy/comfort/luxury
6. 日期格式 YYYY-MM-DD；day_count / travelers 为正整数
7. 用户说改去/换成另一城市 → action=fork_plan + fork_plan.destination
8. 禁止 add_node、add_day、update_edge、禁止输出完整 Itinerary
9. patches 可为空；reply 用中文
"""

SUPPLEMENT_SYSTEM = f"""你是旅行规划助手。用户已有详细行程（supplement 模式）。

{_TOOL_DOC}

输出**仅 JSON 对象**（无 markdown 围栏）：
{{
  "reply": "给用户的简短中文回复",
  "patches": [
    {{
      "action": "add_node",
      "field_path": "days[2].nodes",
      "new_value": {{
        "day_index": 2,
        "node": {{
          "name": "滨海湾花园",
          "category": "attraction",
          "start_time": "17:00",
          "end_time": "20:00",
          "is_optional": false
        }},
        "connect_after": "d2-n3"
      }},
      "summary": "第 2 天新增：滨海湾花园"
    }}
  ]
}}

规则：
1. add_node：new_value 含 day_index、node（至少 name）；node 仅含工具允许字段
2. 修改已有节点 → action=set，field_path 如 days[2].nodes[d2-n3].start_time，new_value 为新值
3. 调整交通 → action=update_edge，new_value 含 edge_id 与 patch（仅允许工具字段）
4. 换目的地必须用 fork_plan，禁止 set destination
5. 不要输出完整 Itinerary；禁止 TripRequest 未定义字段
6. 若提供了 selection，优先围绕该节点理解指代
7. patches 可为空；reply 用中文
"""


def _format_node_detail(node: dict[str, Any]) -> str:
    base = f"{node.get('id')}: {node.get('name')}"
    if node.get("start_time"):
        base += f" ({node.get('start_time')}-{node.get('end_time') or '?'})"
    if node.get("category"):
        base += f" [{node.get('category')}]"
    return base


def _itinerary_summary(
    itinerary: dict[str, Any] | None,
    selection: ChatParseSelectionIn | None = None,
) -> str:
    if not itinerary:
        return "(无)"

    days: list[dict[str, Any]] = itinerary.get("days", [])
    lines: list[str] = []
    priority_indices: set[int] = set()
    truncated = False

    if selection:
        idx = selection.day_index - 1
        if 0 <= idx < len(days):
            priority_indices.add(idx)

    max_other_days = 30
    max_nodes_compact = 12

    for i, day in enumerate(days):
        if i not in priority_indices:
            continue
        di = day.get("day_index", i + 1)
        nodes = day.get("nodes", [])
        edges = day.get("edges", [])
        lines.append(f"  day {di} [选中]: " + ", ".join(_format_node_detail(n) for n in nodes))
        if edges:
            lines.append(
                "    edges: "
                + ", ".join(
                    f"{e.get('id')}: {e.get('from')}->{e.get('to')}" for e in edges
                )
            )
        if selection and selection.node_id:
            for n in nodes:
                if n.get("id") == selection.node_id:
                    focus = {
                        k: n[k]
                        for k in ("id", "name", "category", "start_time", "end_time", "address")
                        if n.get(k) is not None
                    }
                    if selection.node_name:
                        focus.setdefault("name", selection.node_name)
                    lines.append(f"    focus_node: {json.dumps(focus, ensure_ascii=False)}")
        if selection and selection.edge_id:
            for e in edges:
                if e.get("id") == selection.edge_id:
                    lines.append(f"    focus_edge: {json.dumps(e, ensure_ascii=False)}")

    other_count = 0
    for i, day in enumerate(days):
        if i in priority_indices:
            continue
        if other_count >= max_other_days:
            truncated = True
            break
        di = day.get("day_index", i + 1)
        nodes = day.get("nodes", [])
        parts = [_format_node_detail(n) for n in nodes[:max_nodes_compact]]
        if len(nodes) > max_nodes_compact:
            truncated = True
            parts.append(f"…+{len(nodes) - max_nodes_compact} nodes")
        lines.append(f"  day {di}: " + ", ".join(parts))
        other_count += 1

    cross = itinerary.get("cross_day_edges") or []
    if cross:
        shown = cross[:24]
        if len(cross) > 24:
            truncated = True
        lines.append(
            f"  cross_day_edges ({len(cross)}): "
            + ", ".join(f"{e.get('id')}: {e.get('from')}->{e.get('to')}" for e in shown)
        )

    if truncated:
        lines.append("  (行程摘要已截断；选中天/节点已优先展开)")
    return "\n".join(lines) if lines else "(空行程)"


def _selection_block(selection: ChatParseSelectionIn | None) -> str:
    if not selection:
        return "(无)"
    parts = [f"day_index={selection.day_index}"]
    if selection.node_id:
        parts.append(f"node_id={selection.node_id}")
    if selection.node_name:
        parts.append(f"node_name={selection.node_name}")
    if selection.edge_id:
        parts.append(f"edge_id={selection.edge_id}")
    return ", ".join(parts)


def _build_user_payload(req: ChatParseRequest) -> str:
    history = req.chat_history[-20:]
    return (
        f"chat_mode: {req.chat_mode}\n"
        f"plan_phase: {req.plan_phase}\n"
        f"selection: {_selection_block(req.selection)}\n"
        f"trip_request: {req.trip_request.model_dump_json()}\n"
        f"itinerary_summary:\n{_itinerary_summary(req.itinerary, req.selection)}\n"
        f"chat_history: {[m.model_dump() for m in history]}\n"
        f"user_message: {req.message}"
    )


def _validate_llm_result(raw: dict, message: str, client: LLMClient, system: str) -> LLMParseToolResult:
    try:
        return LLMParseToolResult.model_validate(raw)
    except ValidationError as e:
        logger.warning("LLM JSON 校验失败，尝试修复轮: %s", e)
        fix_user = (
            f"上一次输出不符合 schema，错误：{e}\n"
            f"请重新输出合法 JSON。原始用户消息：{message}"
        )
        settings = client.settings
        fixed_raw = client.chat_json(
            system=system,
            user=fix_user,
            temperature=0.1,
            model=settings.llm_model_parse,
            max_tokens=settings.llm_max_tokens_parse,
            endpoint="parse_fix",
        )
        try:
            return LLMParseToolResult.model_validate(fixed_raw)
        except ValidationError as e2:
            raise ValueError(f"LLM 输出格式无效: {e2}") from e2


async def _validate_llm_result_async(
    raw: dict, message: str, client: LLMClient, system: str
) -> LLMParseToolResult:
    try:
        return LLMParseToolResult.model_validate(raw)
    except ValidationError as e:
        logger.warning("LLM JSON 校验失败，尝试修复轮: %s", e)
        fix_user = (
            f"上一次输出不符合 schema，错误：{e}\n"
            f"请重新输出合法 JSON。原始用户消息：{message}"
        )
        settings = client.settings
        fixed_raw = await client.chat_json_async(
            system=system,
            user=fix_user,
            temperature=0.1,
            model=settings.llm_model_parse,
            max_tokens=settings.llm_max_tokens_parse,
            endpoint="parse_fix",
        )
        try:
            return LLMParseToolResult.model_validate(fixed_raw)
        except ValidationError as e2:
            raise ValueError(f"LLM 输出格式无效: {e2}") from e2


async def _fix_truncated_json_async(
    accumulated: str,
    message: str,
    client: LLMClient,
    system: str,
    *,
    error: json.JSONDecodeError,
) -> dict[str, Any]:
    finish = client.last_call_meta.get("finish_reason")
    logger.warning("LLM 流式 JSON 不完整，尝试修复轮: %s finish_reason=%s", error, finish)
    truncated_hint = (
        "输出可能被 max_tokens 截断，请输出完整 JSON，reply 保持简洁，patches 仅保留必要项。"
        if finish == "length"
        else ""
    )
    snippet = accumulated[:3000] + ("…" if len(accumulated) > 3000 else "")
    fix_user = (
        f"上一次输出不是合法 JSON，错误：{error}\n"
        f"{truncated_hint}\n"
        f"不完整输出：\n{snippet}\n"
        f"请重新输出完整合法 JSON。原始用户消息：{message}"
    )
    settings = client.settings
    return await client.chat_json_async(
        system=system,
        user=fix_user,
        temperature=0.1,
        model=settings.llm_model_parse,
        max_tokens=settings.llm_max_tokens_parse + 500,
        endpoint="parse_fix_json",
    )


async def _finalize_parse_response(
    req: ChatParseRequest,
    reply: str,
    patches: list,
    warnings: list[str],
    dropped: int,
) -> ChatParseResponse:
    return ChatParseResponse(
        reply=reply,
        patches=patches,
        warnings=warnings,
        dropped_patch_count=dropped,
        chat_mode_used=req.chat_mode,
    )


def parse_chat(req: ChatParseRequest, client: LLMClient) -> ChatParseResponse:
    system = GLOBAL_SYSTEM if req.chat_mode == "global" else SUPPLEMENT_SYSTEM
    user_payload = _build_user_payload(req)
    settings = client.settings
    raw = client.chat_json(
        system=system,
        user=user_payload,
        model=settings.llm_model_parse,
        max_tokens=settings.llm_max_tokens_parse,
        endpoint="parse",
    )
    parsed = _validate_llm_result(raw, req.message, client, system)
    patches, warnings, dropped = process_llm_patches(
        parsed.patches, req.chat_mode, req.trip_request, req.itinerary
    )
    return ChatParseResponse(
        reply=parsed.reply,
        patches=patches,
        warnings=warnings,
        dropped_patch_count=dropped,
        chat_mode_used=req.chat_mode,
    )


async def parse_chat_async(req: ChatParseRequest, client: LLMClient) -> ChatParseResponse:
    system = GLOBAL_SYSTEM if req.chat_mode == "global" else SUPPLEMENT_SYSTEM
    user_payload = _build_user_payload(req)
    settings = client.settings
    raw = await client.chat_json_async(
        system=system,
        user=user_payload,
        model=settings.llm_model_parse,
        max_tokens=settings.llm_max_tokens_parse,
        endpoint="parse",
    )
    parsed = await _validate_llm_result_async(raw, req.message, client, system)
    patches, warnings, dropped = process_llm_patches(
        parsed.patches, req.chat_mode, req.trip_request, req.itinerary
    )
    return await _finalize_parse_response(
        req, parsed.reply, patches, warnings, dropped
    )


async def parse_chat_stream_async(req: ChatParseRequest, client: LLMClient):
    """Async generator：SSE delta（reply_preview）→ progress → result。"""

    system = GLOBAL_SYSTEM if req.chat_mode == "global" else SUPPLEMENT_SYSTEM
    user_payload = _build_user_payload(req)
    settings = client.settings

    yield {"event": "progress", "data": {"step": "llm", "status": "running"}}

    accumulated = ""
    async for delta in client.chat_json_stream_async(
        system=system,
        user=user_payload,
        model=settings.llm_model_parse,
        max_tokens=settings.llm_max_tokens_parse,
        endpoint="parse_stream",
    ):
        accumulated += delta
        reply_preview = extract_streaming_reply(accumulated)
        yield {
            "event": "delta",
            "data": {"reply_preview": reply_preview, "content": delta},
        }

    yield {"event": "progress", "data": {"step": "llm", "status": "done"}}

    from app.services.llm_client import strip_json_fences

    yield {"event": "progress", "data": {"step": "validate", "status": "running"}}
    text = strip_json_fences(accumulated)
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        yield {"event": "progress", "data": {"step": "validate", "status": "fixing"}}
        raw = await _fix_truncated_json_async(
            accumulated, req.message, client, system, error=e
        )

    try:
        parsed = LLMParseToolResult.model_validate(raw)
    except ValidationError:
        yield {"event": "progress", "data": {"step": "validate", "status": "fixing"}}
        parsed = await _validate_llm_result_async(raw, req.message, client, system)

    patches, warnings, dropped = process_llm_patches(
        parsed.patches, req.chat_mode, req.trip_request, req.itinerary
    )
    response = await _finalize_parse_response(
        req, parsed.reply, patches, warnings, dropped
    )
    yield {"event": "result", "data": response.model_dump()}


def align_chat_mode(req: ChatParseRequest) -> tuple[ChatParseRequest, list[str]]:
    warnings: list[str] = []
    expected = expected_chat_mode(req.plan_phase)
    if req.chat_mode != expected:
        warnings.append(
            f"chat_mode 已从 {req.chat_mode} 纠正为 {expected}（与 plan_phase={req.plan_phase} 一致）"
        )
        req = req.model_copy(update={"chat_mode": expected})
    return req, warnings
