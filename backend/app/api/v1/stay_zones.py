from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas.stay_zone import StayZoneRecommendRequest, StayZoneRecommendResponse
from app.services.stay_zone.recommend import recommend_stay_zones

router = APIRouter(prefix="/stay-zones", tags=["stay-zones"])


@router.post("/recommend", response_model=StayZoneRecommendResponse)
def post_recommend_stay_zones(
    body: StayZoneRecommendRequest,
    settings: Settings = Depends(get_settings),
) -> StayZoneRecommendResponse:
    return recommend_stay_zones(body, settings)
