from fastapi import FastAPI
from app.api.chat import router as chat_router
from app.api.voice import router as voice_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)


@app.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
    }


app.include_router(chat_router)
app.include_router(voice_router)