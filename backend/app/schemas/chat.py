from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class TripRequestIn(BaseModel):
    free_text: str = ""
    departure: Optional[str] = None
    destination: str = ""
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    day_count: Optional[int] = None
    travelers: Optional[int] = None
    budget_level: Optional[Literal["economy", "comfort", "luxury"]] = None
    # HOT-03: 每晚酒店预算上限（与 budget_level 并存；有数字时优先）
    hotel_budget_per_night: Optional[float] = Field(default=None, ge=0)
    preference_tags: list[str] = Field(default_factory=list)
    notes: Optional[str] = None
    # STRAT-UI · doc 25
    planning_strategy: Optional[
        Literal["flight_hotel_first", "interest_then_anchors", "activity_first"]
    ] = "flight_hotel_first"


class ChatMessageIn(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class ChatParseSelectionIn(BaseModel):
    """supplement 模式当前选区（设计 L13）"""

    day_index: int = Field(..., ge=1)
    node_id: Optional[str] = None
    edge_id: Optional[str] = None
    node_name: Optional[str] = None


class ChatParseRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    chat_mode: Literal["global", "supplement"]
    plan_phase: Literal["empty", "planning", "detailed"]
    plan_id: str
    trip_request: TripRequestIn
    itinerary: Optional[dict[str, Any]] = None
    chat_history: list[ChatMessageIn] = Field(default_factory=list)
    selection: Optional[ChatParseSelectionIn] = None
    client_request_id: Optional[str] = None


class ForkPlanPatch(BaseModel):
    destination: str
    inherit_fields: list[Literal["preference_tags", "travelers", "budget_level"]] = Field(
        default_factory=lambda: ["preference_tags", "travelers", "budget_level"]
    )


FIELD_LABELS: dict[str, str] = {
    "free_text": "行程描述",
    "departure": "出发地",
    "destination": "目的地",
    "date_start": "出发日期",
    "date_end": "返程日期",
    "day_count": "天数",
    "travelers": "人数",
    "budget_level": "预算",
    "hotel_budget_per_night": "每晚酒店预算",
    "preference_tags": "偏好标签",
    "notes": "备注",
    "planning_strategy": "规划策略",
}


class FormPatchOut(BaseModel):
    """对齐设计文档 §3.7 FormPatch"""

    id: str
    target: Literal["trip_request", "itinerary", "node", "day", "edge"]
    action: Literal["set", "append", "remove", "add_node", "add_day", "update_edge", "fork_plan"]
    field_path: str
    label: str
    old_value: Optional[Any] = None
    new_value: Any
    summary: str
    confidence: Optional[Literal["high", "medium", "low"]] = None
    fork_plan: Optional[ForkPlanPatch] = None


class ChatToolCallOut(BaseModel):
    """B-FLT-01: client-executed tools (e.g. search_flights). Not FormPatch."""

    name: Literal["search_flights"]
    args: dict[str, Any] = Field(default_factory=dict)


class ChatParseResponse(BaseModel):
    reply: str
    patches: list[FormPatchOut]
    warnings: list[str] = Field(default_factory=list)
    dropped_patch_count: int = 0
    chat_mode_used: Literal["global", "supplement"]
    tool_calls: list[ChatToolCallOut] = Field(default_factory=list)


def expected_chat_mode(plan_phase: Literal["empty", "planning", "detailed"]) -> Literal["global", "supplement"]:
    return "supplement" if plan_phase == "detailed" else "global"
