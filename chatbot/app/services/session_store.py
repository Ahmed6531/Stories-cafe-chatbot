from typing import Any, TypedDict, Optional
import uuid


class Session(TypedDict):
    session_id: str
    cart_id: str | None
    last_items: list
    last_intent: str | None
    stage: str | None
    checkout_initiated: bool
    pending_clarification: dict[str, Any] | None
    history: list

    # NEW fields for context tracking
    last_user_message: str | None
    last_bot_response: str | None
    last_matched_items: list[dict] | None   # full item objects from last add/update
    last_action_type: str | None            # e.g., "add_items", "update_quantity", "describe_item"
    last_action_data: dict[str, Any] | None # extra data like item name, quantity


sessions: dict[str, Session] = {}


def get_session(session_id: str) -> Session:
    if session_id in sessions:
        session = sessions[session_id]
        session.setdefault("stage", None)
        session.setdefault("checkout_initiated", False)
        session.setdefault("pending_clarification", None)
        session.setdefault("history", [])
        # Initialize new fields if missing
        session.setdefault("last_user_message", None)
        session.setdefault("last_bot_response", None)
        session.setdefault("last_matched_items", None)
        session.setdefault("last_action_type", None)
        session.setdefault("last_action_data", None)
        return session

    new_session: Session = {
        "session_id": session_id,
        "cart_id": None,
        "last_items": [],
        "last_intent": None,
        "stage": None,
        "checkout_initiated": False,
        "pending_clarification": None,
        "history": [],
        "last_user_message": None,
        "last_bot_response": None,
        "last_matched_items": None,
        "last_action_type": None,
        "last_action_data": None,
    }
    sessions[session_id] = new_session
    return new_session


def get_or_create_session(session_id: str | None) -> tuple[str, str | None]:
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]["cart_id"]

    if session_id:
        session = get_session(session_id)
        return session_id, session["cart_id"]

    new_session_id = str(uuid.uuid4())
    session = get_session(new_session_id)
    return new_session_id, session["cart_id"]


def set_session_cart_id(session_id: str, cart_id: str | None) -> None:
    session = get_session(session_id)
    session["cart_id"] = cart_id


def get_session_stage(session_id: str) -> str | None:
    session = get_session(session_id)
    return session.get("stage")


def set_session_stage(session_id: str, stage: str | None) -> None:
    session = get_session(session_id)
    session["stage"] = stage


def get_checkout_initiated(session_id: str) -> bool:
    session = get_session(session_id)
    return bool(session.get("checkout_initiated", False))


def set_checkout_initiated(session_id: str, value: bool = True) -> None:
    session = get_session(session_id)
    session["checkout_initiated"] = bool(value)


def update_last_action(
    session_id: str,
    user_message: str,
    bot_response: str,
    action_type: str,
    matched_items: list[dict] | None = None,
    action_data: dict | None = None,
) -> None:
    """Store the last user message, bot response, and action for repeat commands."""
    session = get_session(session_id)
    session["last_user_message"] = user_message
    session["last_bot_response"] = bot_response
    session["last_action_type"] = action_type
    session["last_matched_items"] = matched_items if matched_items is not None else session.get("last_items", [])
    session["last_action_data"] = action_data or {}