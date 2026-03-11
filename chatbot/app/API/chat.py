from fastapi import APIRouter
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    return process_chat_message(
        session_id=payload.session_id,
        message=payload.message,
    )