from fastapi import APIRouter

from app.api.v1 import chat, commute, flights, geocode, itineraries, ops, stay_zones, ugc

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(chat.router)
api_router.include_router(itineraries.router)
api_router.include_router(geocode.router)
api_router.include_router(commute.router)
api_router.include_router(flights.router)
api_router.include_router(stay_zones.router)
api_router.include_router(ugc.router)
api_router.include_router(ops.router)
