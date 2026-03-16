from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.API.chat import router as chat_router
from app.API.voice import router as voice_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(voice_router)