from dotenv import load_dotenv
load_dotenv(override=True)
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.voice import router as voice_router
from app.core.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://stories-cafe-chatbot-a.vercel.app",
        "https://www.storieschatbot.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def warm_menu_signal() -> None:
    try:
        from app.services.menu_signal import get_menu_signal

        await get_menu_signal()
        logger.info("Menu signal warmed on startup")
    except Exception:
        pass

@app.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
    }

app.include_router(chat_router)
app.include_router(voice_router)
