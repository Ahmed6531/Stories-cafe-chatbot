from fastapi import APIRouter, Depends
from fastapi import HTTPException
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message
from app.services.session_store import get_or_create_session, set_session_cart_id

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    """
    Receives a user chat message and passes it through the orchestrator.
    Creates or retrieves a session for conversation state.
    """
    try:
        # Retrieve existing session or create a new one
        session_id, stored_cart_id = get_or_create_session(payload.session_id)
        cart_id = payload.cart_id or stored_cart_id

        # Call orchestrator to process the chat
        response = await process_chat_message(
            session_id=session_id,
            message=payload.message,
            cart_id=cart_id,
        )

        set_session_cart_id(session_id, response.cart_id)

        return response

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process message: {str(e)}"
        )
