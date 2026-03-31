from fastapi import APIRouter, Depends
from fastapi import HTTPException
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message
from app.services.session_store import get_or_create_session
from chatbot.handlers.upsell import get_upsell_suggestion

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    """
    Receives a user chat message and passes it through the orchestrator.
    Creates or retrieves a session for conversation state.
    """
    try:
        # Retrieve existing session or create a new one
        session_id, cart_id = get_or_create_session(payload.session_id)

        # Call orchestrator to process the chat
        response = await process_chat_message(
            session_id=session_id,
            message=payload.message,
            cart_id=cart_id,
        )

        return response

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process message: {str(e)}"
        )
    @router.post("/chat")
    async def chat_endpoint(request: ChatRequest):
        session = get_session(request.session_id)
    intent = classify_intent(request.message)

    if intent.type == "add_to_cart":
        backend_resp = call_backend("/cart/add", {"item": intent.item})
        if backend_resp.success:
            base_reply = f"Added {intent.item} to your cart."
            suggestion = get_upsell_suggestion(intent.item, session)
            if suggestion:
                base_reply += f" Would you like to add a {suggestion} as well?"
            return {"reply": base_reply}
        else:
            return {"reply": "Sorry, I couldn’t add that item."}
    # ... other intents unchanged