import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title="Travel Planner API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

logger.info("CORS origins: %s", settings.cors_origin_list)
logger.info("LLM model chain: %s", settings.llm_model_chain)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm_configured": bool(settings.deepseek_api_key),
        "llm_model": settings.llm_model,
        "llm_model_fallbacks": settings.llm_model_chain[1:],
        "cors_origins": settings.cors_origin_list,
    }
