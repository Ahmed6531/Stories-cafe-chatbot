from fastapi import APIRouter

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/health")
async def voice_health() -> dict:
    return {"status": "ok", "message": "Voice routes placeholder ready."}