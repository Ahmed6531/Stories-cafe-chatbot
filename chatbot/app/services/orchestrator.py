from app.schemas.chat import ChatMessageResponse
from app.utils.normalize import normalize_user_message


def detect_intent(normalized_message: str) -> str:
    """
    Very simple MVP intent detection for now.
    We are not doing real tool calling yet.
    """
    if any(word in normalized_message for word in ["add", "get", "want", "order"]):
        return "add_item"

    if any(word in normalized_message for word in ["remove", "delete"]):
        return "remove_item"

    if any(phrase in normalized_message for phrase in ["show cart", "my cart", "what is in my cart"]):
        return "view_cart"

    if any(phrase in normalized_message for phrase in ["recommend", "suggest"]):
        return "recommendation_query"

    return "unknown"


def build_reply(intent: str, normalized_message: str) -> str:
    """
    Temporary reply builder until we connect tools and backend APIs.
    """
    if intent == "add_item":
        return f"I understood that you want to add something: '{normalized_message}'."

    if intent == "remove_item":
        return f"I understood that you want to remove something: '{normalized_message}'."

    if intent == "view_cart":
        return "I understood that you want to view your cart."

    if intent == "recommendation_query":
        return "I understood that you want recommendations."

    return f"I understood your message: '{normalized_message}'."


def process_chat_message(session_id: str, message: str) -> ChatMessageResponse:
    """
    Main orchestrator entry point.
    All text messages should flow through here.
    Later, voice transcripts will also call this same function.
    """
    normalized_message = normalize_user_message(message)
    intent = detect_intent(normalized_message)
    reply = build_reply(intent, normalized_message)

    return ChatMessageResponse(
        session_id=session_id,
        status="ok",
        reply=reply,
        intent=intent,
        cart_updated=False,
        defaults_used=[],
        suggestions=[],
        metadata={
            "normalized_message": normalized_message,
            "pipeline_stage": "orchestrator_stub",
        },
    )