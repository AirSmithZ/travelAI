from __future__ import annotations

import asyncio
import json
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.config import Settings
from app.schemas.flight import (
    FlightIntentParsed,
    FlightQuote,
    FlightSearchRequest,
    FlightSearchResponse,
    FlightVerifyFromTextRequest,
    FlightVerifyFromTextResponse,
    RankPreference,
)
from app.services.flight.search import search_flights
from app.services.llm_client import LLMClient

Preference = Literal["cheap", "fast", "balanced"]


class _FlightIntentLLMResult(BaseModel):
    reply: str
    origin: str | None = None
    destination: str | None = None
    date: str | None = None
    return_date: str | None = None
    adults: int = Field(default=1, ge=1, le=9)
    preference: Preference = "balanced"


class _FlightRecommendLLMResult(BaseModel):
    recommendation: str


def _system_prompt(today: date) -> str:
    return f"""你是航班需求解析助手。用户用中文描述机票/航班需求（验证工具，非订票）。

今天日期：{today.isoformat()}

输出**仅 JSON 对象**（无 markdown 围栏）：
{{
  "reply": "给用户的简短中文回复：说明已理解的需求；信息不全时说明还缺什么；禁止编造票价或航班号",
  "origin": "出发城市/机场（如 上海、SHA）；未知 null",
  "destination": "目的地；未知 null",
  "date": "出发日期 YYYY-MM-DD；未知 null",
  "return_date": "返程 YYYY-MM-DD 或 null",
  "adults": 1,
  "preference": "cheap|fast|balanced"
}}

规则：
1. 只提取用户明确提到的信息，不要编造
2. 禁止编造票价、航班号、舱位价格、具体起降时刻
3. 用户只给月日未给年份时，取**今天之后**最近的一次该月日
4. adults：用户说「2人/一家三口」等则填对应人数，否则 1
5. preference：便宜/省钱→cheap，最快/省时→fast，否则 balanced
6. reply 用中文；若缺出发地/目的地/出发日期，在 reply 中追问
"""


def _recommend_system() -> str:
    return """你是航班推荐助手。根据 LetsFG 参考价数据写简短中文推荐。

输出**仅 JSON 对象**（无 markdown 围栏）：
{"recommendation": "..."}

规则：
1. 只能引用输入 JSON 中 ranked offers 的航司、时间、参考价，禁止编造未出现的航班
2. 必须说明这是 LetsFG 参考价，最终价格与余位以 Trip.com 实时页面为准
3. 结合 preference 解释为何靠前推荐（便宜/省时/直飞等）
4. 若无 offers，说明无法给出参考推荐，建议去 Trip.com 查看
5. 200 字以内，中文
"""


def _build_user_payload(req: FlightVerifyFromTextRequest) -> str:
    lines = [f"用户最新消息：{req.message}"]
    if req.chat_history:
        lines.append("\n对话历史：")
        for msg in req.chat_history[-10:]:
            role = "用户" if msg.role == "user" else "助手"
            lines.append(f"{role}：{msg.content}")
    return "\n".join(lines)


def _missing_fields(parsed: _FlightIntentLLMResult) -> list[str]:
    labels = {
        "origin": "出发地",
        "destination": "目的地",
        "date": "出发日期",
    }
    missing: list[str] = []
    for field, label in labels.items():
        value = getattr(parsed, field)
        if not value or not str(value).strip():
            missing.append(label)
    return missing


def _to_search_request(parsed: _FlightIntentLLMResult) -> FlightSearchRequest:
    return FlightSearchRequest(
        origin=parsed.origin.strip(),  # type: ignore[union-attr]
        destination=parsed.destination.strip(),  # type: ignore[union-attr]
        date=parsed.date.strip(),  # type: ignore[union-attr]
        return_date=parsed.return_date.strip() if parsed.return_date else None,
        adults=parsed.adults,
        preference=parsed.preference,
        include_letsfg=True,
    )


def build_intent_parsed(parsed: _FlightIntentLLMResult) -> FlightIntentParsed:
    missing = _missing_fields(parsed)
    return FlightIntentParsed(
        origin=(parsed.origin or "").strip() or None,
        destination=(parsed.destination or "").strip() or None,
        date=(parsed.date or "").strip() or None,
        return_date=(parsed.return_date or "").strip() or None,
        adults=parsed.adults,
        preference=parsed.preference,
        missing_fields=missing,
    )


def _compact_offers(offers: list[FlightQuote]) -> list[dict]:
    rows: list[dict] = []
    for offer in offers:
        row: dict = {
            "rank": offer.rank,
            "trip_type": offer.trip_type,
            "airline": offer.airline,
            "route": offer.route_label,
            "depart": offer.depart_time,
            "arrive": offer.arrive_time,
            "duration_minutes": offer.duration_minutes,
            "stops": offer.stops,
            "price": offer.price_amount,
            "currency": offer.price_currency,
            "rank_reason": offer.rank_reason,
            "flight_numbers": offer.flight_numbers,
        }
        if offer.return_leg:
            row["return"] = {
                "airline": offer.return_leg.airline,
                "route": offer.return_leg.route_label,
                "depart": offer.return_leg.depart_time,
                "arrive": offer.return_leg.arrive_time,
                "duration_minutes": offer.return_leg.duration_minutes,
                "stops": offer.return_leg.stops,
                "flight_numbers": offer.return_leg.flight_numbers,
            }
        rows.append(row)
    return rows


async def _recommend_offers(
    client: LLMClient,
    *,
    user_message: str,
    preference: RankPreference,
    ranked: list[FlightQuote],
) -> str | None:
    if not ranked:
        return None
    payload = json.dumps(
        {
            "user_message": user_message,
            "preference": preference,
            "ranked": _compact_offers(ranked),
        },
        ensure_ascii=False,
    )
    raw = await client.chat_json_async(
        system=_recommend_system(),
        user=payload,
        temperature=0.2,
        model=client.settings.llm_model_parse,
        max_tokens=600,
        endpoint="flight_recommend",
    )
    try:
        result = _FlightRecommendLLMResult.model_validate(raw)
    except ValidationError:
        return None
    return result.recommendation.strip() or None


async def verify_flight_from_text(
    req: FlightVerifyFromTextRequest,
    settings: Settings,
) -> FlightVerifyFromTextResponse:
    client = LLMClient(settings)
    raw = await client.chat_json_async(
        system=_system_prompt(date.today()),
        user=_build_user_payload(req),
        temperature=0.1,
        model=settings.llm_model_parse,
        max_tokens=800,
        endpoint="flight_intent_parse",
    )
    try:
        llm = _FlightIntentLLMResult.model_validate(raw)
    except ValidationError as e:
        raise ValueError(f"LLM 响应格式无效: {e}") from e

    parsed = build_intent_parsed(llm)
    warnings: list[str] = []
    search: FlightSearchResponse | None = None
    recommendation: str | None = None

    if not parsed.missing_fields:
        try:
            search = await asyncio.to_thread(
                search_flights,
                _to_search_request(llm),
                settings,
            )
            if search.ranked:
                recommendation = await _recommend_offers(
                    client,
                    user_message=req.message,
                    preference=parsed.preference,
                    ranked=search.ranked,
                )
            elif search.errors.get("letsfg"):
                recommendation = (
                    "未能获取 LetsFG 参考价，暂无法在 App 内对比航班。"
                    "请打开 Trip.com 链接查看实时航班与价格。"
                )
        except ValueError as e:
            warnings.append(str(e))

    return FlightVerifyFromTextResponse(
        reply=llm.reply,
        parsed=parsed,
        search=search,
        recommendation=recommendation,
        warnings=warnings,
    )
