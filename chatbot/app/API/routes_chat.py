from fastapi import APIRouter
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    return ChatMessageResponse(
        session_id=payload.session_id,
        reply="Chatbot service is running. Message received successfully.",
        status="ok",
    )