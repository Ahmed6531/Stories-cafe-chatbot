from fastapi import APIRouter, HTTPException
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message
from app.services.session_store import get_session

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    if not payload.session_id or not payload.session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")

    session = get_session(payload.session_id)
    effective_cart_id = payload.cart_id or session["cart_id"]

    response = await process_chat_message(
        session_id=session["session_id"],
        message=payload.message,
        cart_id=effective_cart_id,
        session=session,
    )

    if response.metadata.get("pipeline_stage") == "checkout_redirect":
        session["last_items"] = []
        session["last_intent"] = None
        session["cart_id"] = None
        session["stage"] = None
        session["checkout_initiated"] = False
    else:
        if response.cart_id is not None:
            session["cart_id"] = response.cart_id

        session["last_intent"] = response.intent

        requested_items = response.metadata.get("requested_items")
        if (
            response.intent in {"add_items", "update_quantity", "remove_item"}
            and isinstance(requested_items, list)
            and requested_items
        ):
            session["last_items"] = requested_items

    return response
