import logging
from time import perf_counter

from fastapi import APIRouter, HTTPException, Request
from app.schemas.chat import ChatMessageRequest, ChatMessageResponse
from app.services.orchestrator import process_chat_message
from app.services.session_store import get_session
from app.services.tts.tts_service import tts_service

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
uvicorn_logger = logging.getLogger("uvicorn.error")


def _update_session_from_response(session: dict, response: ChatMessageResponse) -> None:
    if response.metadata.get("pipeline_stage") == "checkout_redirect":
        session["last_items"] = []
        session["last_intent"] = None
        session["cart_id"] = None
        session["stage"] = None
        session["checkout_initiated"] = False
        return

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
        return

    if response.intent == "describe_item":
        matched_item = response.metadata.get("matched_item")
        if isinstance(matched_item, dict) and (matched_item.get("name") or "").strip():
            session["last_items"] = [
                {
                    "item_name": str(matched_item.get("name")).strip(),
                    "quantity": 1,
                    "size": None,
                    "options": {"milk": None, "sugar": None},
                    "addons": [],
                    "instructions": "",
                }
            ]


@router.post("/message", response_model=ChatMessageResponse)
async def send_message(payload: ChatMessageRequest, request: Request) -> ChatMessageResponse:
    started_at = perf_counter()
    pipeline_stage = "validation"
    intent = "unknown"
    status = "failed"

    if not payload.session_id or not payload.session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")

    try:
        session = get_session(payload.session_id)
        effective_cart_id = payload.cart_id or session["cart_id"]

        response = await process_chat_message(
            session_id=session["session_id"],
            message=payload.message,
            cart_id=effective_cart_id,
            session=session,
            auth_cookie=request.headers.get("cookie"),
        )

        pipeline_stage = response.metadata.get("pipeline_stage", "unknown")
        intent = response.intent or "unknown"

        _update_session_from_response(session, response)

        # Keep last 10 turns (5 user + 5 bot) in session memory only
        history: list = session.setdefault("history", [])
        history.append({"role": "user", "text": payload.message})
        history.append({"role": "bot", "text": response.reply})
        if len(history) > 20:
            session["history"] = history[-20:]

        audio = await tts_service.synthesize(response.reply)
        response.audio_base64 = audio
        status = response.status or "ok"
        return response
    finally:
        elapsed_ms = round((perf_counter() - started_at) * 1000, 2)
        payload_log = {
            "stage": "chat_request_latency",
            "session_id": payload.session_id,
            "intent": intent,
            "pipeline_stage": pipeline_stage,
            "status": status,
            "latency_ms": elapsed_ms,
        }
        logger.info(payload_log)
        uvicorn_logger.info(payload_log)