from fastapi import APIRouter, HTTPException, Query
from openai import APIConnectionError, APIStatusError, RateLimitError

from app.config import get_settings
from app.schemas.flight import (
    AirportSearchHit,
    AirportSearchResponse,
    FlightManualValidateRequest,
    FlightManualValidateResponse,
    FlightSearchRequest,
    FlightSearchResponse,
    FlightVerifyFromTextRequest,
    FlightVerifyFromTextResponse,
)
from app.services.flight.airport_search import search_airports
from app.services.flight.intent_parse import verify_flight_from_text
from app.services.flight.manual_validate import validate_manual_flight
from app.services.flight.search import search_flights

router = APIRouter(prefix="/flights", tags=["flights"])


@router.get("/airports", response_model=AirportSearchResponse)
def flight_airports_search(
    q: str = Query(..., min_length=1, max_length=64, description="城市 / 国家 / IATA / 别名"),
    limit: int = Query(12, ge=1, le=40),
) -> AirportSearchResponse:
    """Fuzzy airport lookup; country queries expand to that country's airports."""
    hits = search_airports(q, limit=limit)
    return AirportSearchResponse(
        query=q.strip(),
        results=[
            AirportSearchHit(
                iata=h.iata,
                name=h.name,
                city=h.city,
                country=h.country,
                name_zh=h.name_zh,
                city_zh=h.city_zh,
                country_zh=h.country_zh,
                label=h.label,
                match_type=h.match_type,  # type: ignore[arg-type]
                score=h.score,
            )
            for h in hits
        ],
    )


@router.post("/search", response_model=FlightSearchResponse)
def flight_search(body: FlightSearchRequest) -> FlightSearchResponse:
    settings = get_settings()
    try:
        return search_flights(body, settings)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("/manual-validate", response_model=FlightManualValidateResponse)
def flight_manual_validate(body: FlightManualValidateRequest) -> FlightManualValidateResponse:
    """B-FLT-04: normalize IATA + duration; soft trip_request warnings."""
    return validate_manual_flight(body)


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
