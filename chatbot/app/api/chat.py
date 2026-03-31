from unittest import result

from fastapi import APIRouter
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message
from app.services.tts.tts_service import tts_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    result = await process_chat_message(
        session_id=payload.session_id,
        message=payload.message,
        cart_id=payload.cart_id,
    )

    audio = await tts_service.synthesize(result.reply)
    result.audio_base64 = audio
    return result