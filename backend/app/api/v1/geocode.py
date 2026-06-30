from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query

from app.schemas.geocode import (
    GeocodeAutocompleteResponse,
    GeocodeCandidate,
    GeocodeRequest,
    GeocodeResponse,
    GeocodeReverseResponse,
)
from app.services.geocode_providers import GeocodeProviderError
from app.services.geocoding import geocode_autocomplete, geocode_place, geocode_reverse

router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("/autocomplete", response_model=GeocodeAutocompleteResponse)
def geocode_autocomplete_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    city: str = Query("", max_length=100),
    limit: int = Query(5, ge=1, le=10),
) -> GeocodeAutocompleteResponse:
    try:
        outcome = geocode_autocomplete(q, city, limit=limit)
    except GeocodeProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return GeocodeAutocompleteResponse(
        results=[GeocodeCandidate(**asdict(h)) for h in outcome.results],
        provider=outcome.provider,
        warnings=outcome.warnings,
    )


@router.post("/search", response_model=GeocodeResponse)
def geocode_search(body: GeocodeRequest) -> GeocodeResponse:
    try:
        result = geocode_place(body.query, body.destination or "")
    except GeocodeProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    if not result:
        raise HTTPException(status_code=404, detail="未找到坐标")
    return GeocodeResponse(**result)


@router.get("/reverse", response_model=GeocodeReverseResponse)
def geocode_reverse_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> GeocodeReverseResponse:
    result = geocode_reverse(lat, lng)
    if not result:
        raise HTTPException(status_code=404, detail="逆地理编码失败")
    return GeocodeReverseResponse(**result)
