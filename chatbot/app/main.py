from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.chat import router as chat_router
from .api.voice import router as voice_router
from .core.config import settings

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://stories-cafe-chatbot-a.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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