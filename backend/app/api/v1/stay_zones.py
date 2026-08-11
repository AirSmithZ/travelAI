from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas.stay_zone import (
    StayZoneLodgingRequest,
    StayZoneLodgingResponse,
    StayZoneRecommendRequest,
    StayZoneRecommendResponse,
)
from app.services.stay_zone.lodging_search import search_lodging_near
from app.services.stay_zone.recommend import recommend_stay_zones
from app.services.stay_zone.rollinggo_client import rollinggo_configured
from app.services.stay_zone.rollinggo_lodging import search_lodging_via_rollinggo
from app.services.stay_zone.tripcom_deeplink import build_tripcom_hotel_url

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
    """HOT-RG-02 + HOT-TRIP: RollingGo → optional Serp → Trip CTA (never 503-only)."""
    check_in = (body.check_in or "").strip()
    check_out = (body.check_out or check_in).strip()
    trip_url = build_tripcom_hotel_url(
        body.city,
        check_in,
        check_out,
        area_keyword=body.label or "",
        adults=body.adults,
        max_price=body.max_price,
    )

    # 1) RollingGo first when Key present
    if rollinggo_configured(settings):
        rg = search_lodging_via_rollinggo(
            lat=body.lat,
            lng=body.lng,
            city=body.city,
            label=body.label,
            settings=settings,
            limit=body.limit,
            radius_m=body.radius_m,
            check_in=check_in,
            check_out=check_out,
            adults=body.adults,
            max_price=body.max_price,
        )
        if rg.status == "ok" and rg.candidates:
            return StayZoneLodgingResponse(
                zone_id=body.zone_id,
                candidates=rg.candidates,
                warnings=list(rg.warnings),
                status="ok",
                query=rg.query,
                trip_url=trip_url,
                mode="rollinggo",
            )
        # keep RG warnings / query for trip_first
        rg_warnings = list(rg.warnings)
        rg_query = rg.query
    else:
        rg_warnings = []
        rg_query = ""

    # 2) Optional Serp Maps lodging (default off — LODGING_ENABLE_SERP)
    serp_ok = bool(settings.lodging_enable_serp) and bool(
        (settings.serpapi_api_key or "").strip()
    )
    if serp_ok:
        result = search_lodging_near(
            lat=body.lat,
            lng=body.lng,
            city=body.city,
            label=body.label,
            settings=settings,
            limit=body.limit,
            radius_m=body.radius_m,
        )
        warnings = [*rg_warnings, *result.warnings]
        if result.status == "ok" and result.candidates:
            return StayZoneLodgingResponse(
                zone_id=body.zone_id,
                candidates=result.candidates,
                warnings=warnings,
                status="ok",
                query=result.query,
                trip_url=trip_url,
                mode="serp",
            )
        if result.status == "rate_limited" and not any("限流" in w for w in warnings):
            warnings.append("SerpApi 限流（429）；请优先用列表候选或 Trip.com，勿当作「附近无酒店」")
        elif result.status in ("provider_error", "unconfigured", "empty"):
            if result.warnings:
                pass
            elif not warnings:
                warnings.append("地图附近检索暂无结果；请用 Trip.com 或店名搜索")
        return StayZoneLodgingResponse(
            zone_id=body.zone_id,
            candidates=result.candidates,
            warnings=warnings or ["结构化搜店暂不可用；请用 Trip.com 深链"],
            status="trip_first",
            query=result.query or rg_query,
            trip_url=trip_url,
            mode="trip_first",
        )

    # 3) Trip-first CTA
    warnings = list(rg_warnings)
    if rollinggo_configured(settings):
        if not warnings:
            warnings.append("RollingGo 暂无可用候选；请用 Trip.com 按片区搜店或店名搜索")
    else:
        warnings.append(
            "未配置 RollingGo；请用 Trip.com 按片区关键词搜店，或改用店名搜索"
            + ("（Serp lodging 已关闭）" if not settings.lodging_enable_serp else "")
        )

    return StayZoneLodgingResponse(
        zone_id=body.zone_id,
        candidates=[],
        warnings=warnings,
        status="trip_first",
        query=rg_query,
        trip_url=trip_url,
        mode="trip_first",
    )
