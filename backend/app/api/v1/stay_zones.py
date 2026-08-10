from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.schemas.stay_zone import (
    StayZoneLodgingRequest,
    StayZoneLodgingResponse,
    StayZoneRecommendRequest,
    StayZoneRecommendResponse,
)
from app.services.stay_zone.lodging_search import search_lodging_near
from app.services.stay_zone.recommend import recommend_stay_zones

router = APIRouter(prefix="/stay-zones", tags=["stay-zones"])


@router.post("/recommend", response_model=StayZoneRecommendResponse)
def post_recommend_stay_zones(
    body: StayZoneRecommendRequest,
    settings: Settings = Depends(get_settings),
) -> StayZoneRecommendResponse:
    return recommend_stay_zones(body, settings)


@router.post("/lodging", response_model=StayZoneLodgingResponse)
def post_stay_zone_lodging(
    body: StayZoneLodgingRequest,
    settings: Settings = Depends(get_settings),
) -> StayZoneLodgingResponse:
    """HOT-02: lodging candidates near zone hub (SerpApi Maps); prices via Trip deep link only."""
    if not (settings.serpapi_api_key or "").strip():
        raise HTTPException(status_code=503, detail="SERPAPI_API_KEY 未配置，无法检索片区酒店")
    result = search_lodging_near(
        lat=body.lat,
        lng=body.lng,
        city=body.city,
        label=body.label,
        settings=settings,
        limit=body.limit,
        radius_m=body.radius_m,
    )
    warnings = list(result.warnings)
    if result.status == "rate_limited" and not warnings:
        warnings.append("SerpApi 限流（429），请稍后重试；勿与「附近无酒店」混淆")
    elif result.status == "provider_error" and not warnings:
        warnings.append("片区酒店检索上游失败，请稍后重试")
    elif result.status == "empty" and not warnings:
        warnings.append("未找到片区内 lodging 候选；可手动输入酒店名或调整片区")

    return StayZoneLodgingResponse(
        zone_id=body.zone_id,
        candidates=result.candidates,
        warnings=warnings,
        status=result.status,
        query=result.query,
    )
