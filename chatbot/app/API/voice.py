import os
from fastapi import APIRouter, HTTPException, UploadFile, File
from app.schemas.voice import VoiceTranscriptionResponse
from app.core.config import settings
from groq import Groq

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_BYTES = 25 * 1024 * 1024
ALLOWED_MIME_PREFIX = "audio/"

@router.get("/health")
async def voice_health() -> dict:
    return {"status": "ok", "message": "Voice routes ready."}

@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    if not settings.groq_api_key:
        raise HTTPException(status_code=500, detail="Missing GROQ_API_KEY")

    if not audio.content_type or not audio.content_type.startswith(ALLOWED_MIME_PREFIX):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {audio.content_type}")

    contents = await audio.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Missing or empty audio file")
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds 25 MB limit")

    filename = audio.filename or "speech.wav"
    mime_type = audio.content_type or "audio/wav"

    try:
        client = Groq(api_key=settings.groq_api_key)
        transcription = client.audio.transcriptions.create(
            model=settings.stt_model,
            file=(filename, contents, mime_type),
            language=settings.stt_language,
            response_format="json",
            prompt=(
                "latte cappuccino americano espresso mocha macchiato frap frappuccino "
                "flat white matcha chai oat milk almond milk whole milk skim milk "
                "large medium small iced hot decaf extra shot no foam vanilla caramel hazelnut"
            ),
        )
        return VoiceTranscriptionResponse(transcript=transcription.text or "", status="success")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")