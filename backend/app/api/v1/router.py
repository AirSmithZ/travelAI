from fastapi import APIRouter

from app.api.v1 import chat, flights, geocode, itineraries, stay_zones

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(chat.router)
api_router.include_router(itineraries.router)
api_router.include_router(geocode.router)
api_router.include_router(flights.router)
api_router.include_router(stay_zones.router)
