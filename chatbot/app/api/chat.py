import logging
import os

from fastapi import APIRouter, HTTPException
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message
from app.services.session_store import clear_guided_order_session, get_session

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def _session_debug_snapshot(session: dict) -> dict:
    return {
        "session_id": session.get("session_id"),
        "cart_id": session.get("cart_id"),
        "stage": session.get("stage"),
        "last_intent": session.get("last_intent"),
        "checkout_initiated": session.get("checkout_initiated"),
        "guided_order_item_id": session.get("guided_order_item_id"),
        "guided_order_item_name": session.get("guided_order_item_name"),
        "guided_order_phase": session.get("guided_order_phase"),
        "guided_order_step": session.get("guided_order_step"),
        "guided_required_count": len(session.get("guided_order_required_groups") or []),
        "guided_optional_count": len(session.get("guided_order_optional_groups") or []),
        "guided_group_count": len(session.get("guided_order_groups") or []),
        "guided_selections": session.get("guided_order_selections") or {},
    }


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    if not payload.session_id or not payload.session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")

    session = get_session(payload.session_id)
    effective_cart_id = payload.cart_id or session["cart_id"]

    logger.info(
        {
            "stage": "chat_request_received",
            "pid": os.getpid(),
            "message": payload.message,
            "effective_cart_id": effective_cart_id,
            "session": _session_debug_snapshot(session),
        }
    )

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
        clear_guided_order_session(session["session_id"])
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

    logger.info(
        {
            "stage": "chat_request_completed",
            "pid": os.getpid(),
            "message": payload.message,
            "intent": response.intent,
            "cart_updated": response.cart_updated,
            "response_cart_id": response.cart_id,
            "pipeline_stage": response.metadata.get("pipeline_stage"),
            "fallback_reason": response.metadata.get("fallback_reason"),
            "current_group": response.metadata.get("current_group"),
            "session": _session_debug_snapshot(session),
        }
    )

    return response
