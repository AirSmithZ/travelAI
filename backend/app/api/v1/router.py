from fastapi import APIRouter

from app.api.v1 import chat, geocode, itineraries

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(chat.router)
api_router.include_router(itineraries.router)
api_router.include_router(geocode.router)
