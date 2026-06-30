from pydantic import BaseModel, Field


class GeocodeRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    destination: str = ""


class GeocodeResponse(BaseModel):
    lat: float
    lng: float
    address: str = ""
    coord_confidence: str = "medium"
    coord_source: str = "nominatim"


class GeocodeCandidate(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    place_id: str = ""
    coord_source: str = "nominatim"


class GeocodeAutocompleteResponse(BaseModel):
    results: list[GeocodeCandidate]
    provider: str | None = None
    warnings: list[str] = Field(default_factory=list)


class GeocodeReverseResponse(BaseModel):
    name: str = ""
    address: str = ""
    lat: float
    lng: float
    coord_source: str = "nominatim_reverse"
