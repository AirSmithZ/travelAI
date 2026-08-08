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
    raw = search_lodging_near(
        lat=body.lat,
        lng=body.lng,
        city=body.city,
        label=body.label,
        settings=settings,
        limit=body.limit,
        radius_m=body.radius_m,
    )
    warnings: list[str] = []
    if not raw:
        warnings.append("未找到片区内 lodging 候选；可手动输入酒店名或调整片区")
    return StayZoneLodgingResponse(
        zone_id=body.zone_id,
        candidates=raw,
        warnings=warnings,
    )
