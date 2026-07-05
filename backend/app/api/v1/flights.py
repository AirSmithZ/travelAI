from fastapi import APIRouter, HTTPException
from openai import APIConnectionError, APIStatusError, RateLimitError

from app.config import get_settings
from app.schemas.flight import (
    FlightSearchRequest,
    FlightSearchResponse,
    FlightVerifyFromTextRequest,
    FlightVerifyFromTextResponse,
)
from app.services.flight.intent_parse import verify_flight_from_text
from app.services.flight.search import search_flights

router = APIRouter(prefix="/flights", tags=["flights"])


@router.post("/search", response_model=FlightSearchResponse)
def flight_search(body: FlightSearchRequest) -> FlightSearchResponse:
    settings = get_settings()
    try:
        return search_flights(body, settings)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("/verify-from-text", response_model=FlightVerifyFromTextResponse)
async def flight_verify_from_text(
    body: FlightVerifyFromTextRequest,
) -> FlightVerifyFromTextResponse:
    """开发验证：LLM 解析自然语言航班需求，信息齐全时调用 search。"""
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise HTTPException(status_code=503, detail="LLM 未配置：请设置 DEEPSEEK_API_KEY")

    try:
        return await verify_flight_from_text(body, settings)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except APIStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"LLM API 错误（HTTP {e.status_code}），请稍后重试",
        ) from e
    except (RateLimitError, APIConnectionError) as e:
        raise HTTPException(status_code=502, detail="LLM 连接失败或限流，请稍后重试") from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM 服务异常（{type(e).__name__}）") from e
