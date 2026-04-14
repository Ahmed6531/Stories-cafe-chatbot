from typing import Any, TypedDict
import uuid


class Session(TypedDict):
    session_id: str
    cart_id: str | None
    last_items: list[dict[str, Any]]
    last_intent: str | None
    stage: str | None
    checkout_initiated: bool
    pending_clarification: dict[str, Any] | None
    history: list[dict[str, str]]
    guided_order_item_id: int | str | None
    guided_order_item_name: str | None
    guided_order_phase: int
    guided_order_step: int
    guided_order_groups: list[dict[str, Any]]
    guided_order_required_groups: list[dict[str, Any]]
    guided_order_optional_groups: list[dict[str, Any]]
    guided_order_selections: dict[str, Any]
    guided_order_quantity: int | None
    last_user_message: str | None
    last_bot_response: str | None
    last_matched_items: list[dict[str, Any]] | None
    last_action_type: str | None
    last_action_data: dict[str, Any] | None


sessions: dict[str, Session] = {}


def get_session(session_id: str) -> Session:
    if session_id in sessions:
        session = sessions[session_id]
        session.setdefault("stage", None)
        session.setdefault("checkout_initiated", False)
        session.setdefault("pending_clarification", None)
        session.setdefault("history", [])
        session.setdefault("guided_order_item_id", None)
        session.setdefault("guided_order_item_name", None)
        session.setdefault("guided_order_phase", 1)
        session.setdefault("guided_order_step", 0)
        session.setdefault("guided_order_groups", [])
        session.setdefault("guided_order_required_groups", [])
        session.setdefault("guided_order_optional_groups", [])
        session.setdefault("guided_order_selections", {})
        session.setdefault("guided_order_quantity", None)
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
        "guided_order_item_id": None,
        "guided_order_item_name": None,
        "guided_order_phase": 1,
        "guided_order_step": 0,
        "guided_order_groups": [],
        "guided_order_required_groups": [],
        "guided_order_optional_groups": [],
        "guided_order_selections": {},
        "guided_order_quantity": None,
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

    # If caller provides a session ID that doesn't exist yet, initialize that
    # same ID so multi-turn context is preserved on the client side.
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
    matched_items: list[dict[str, Any]] | None = None,
    action_data: dict[str, Any] | None = None,
) -> None:
    """Store the last user message, bot response, and action for repeat/recovery flows."""
    session = get_session(session_id)
    session["last_user_message"] = user_message
    session["last_bot_response"] = bot_response
    session["last_action_type"] = action_type
    session["last_matched_items"] = matched_items if matched_items is not None else session.get("last_items", [])
    session["last_action_data"] = action_data or {}


def get_guided_order_item_id(session_id: str) -> int | str | None:
    session = get_session(session_id)
    return session.get("guided_order_item_id")


def set_guided_order_item_id(session_id: str, item_id: int | str | None) -> None:
    session = get_session(session_id)
    session["guided_order_item_id"] = item_id


def get_guided_order_item_name(session_id: str) -> str | None:
    session = get_session(session_id)
    return session.get("guided_order_item_name")


def set_guided_order_item_name(session_id: str, item_name: str | None) -> None:
    session = get_session(session_id)
    session["guided_order_item_name"] = item_name


def get_guided_order_phase(session_id: str) -> int:
    session = get_session(session_id)
    return int(session.get("guided_order_phase", 1) or 1)


def set_guided_order_phase(session_id: str, phase: int) -> None:
    session = get_session(session_id)
    session["guided_order_phase"] = int(phase)


def get_guided_order_step(session_id: str) -> int:
    session = get_session(session_id)
    return int(session.get("guided_order_step", 0) or 0)


def set_guided_order_step(session_id: str, step: int) -> None:
    session = get_session(session_id)
    session["guided_order_step"] = int(step)


def get_guided_order_groups(session_id: str) -> list[dict[str, Any]]:
    session = get_session(session_id)
    return list(session.get("guided_order_groups") or [])


def set_guided_order_groups(session_id: str, groups: list[dict[str, Any]]) -> None:
    session = get_session(session_id)
    session["guided_order_groups"] = list(groups or [])


def get_guided_order_required_groups(session_id: str) -> list[dict[str, Any]]:
    session = get_session(session_id)
    return list(session.get("guided_order_required_groups") or [])


def set_guided_order_required_groups(session_id: str, groups: list[dict[str, Any]]) -> None:
    session = get_session(session_id)
    session["guided_order_required_groups"] = list(groups or [])


def get_guided_order_optional_groups(session_id: str) -> list[dict[str, Any]]:
    session = get_session(session_id)
    return list(session.get("guided_order_optional_groups") or [])


def set_guided_order_optional_groups(session_id: str, groups: list[dict[str, Any]]) -> None:
    session = get_session(session_id)
    session["guided_order_optional_groups"] = list(groups or [])


def get_guided_order_selections(session_id: str) -> dict[str, Any]:
    session = get_session(session_id)
    return dict(session.get("guided_order_selections") or {})


def set_guided_order_selections(session_id: str, selections: dict[str, Any]) -> None:
    session = get_session(session_id)
    session["guided_order_selections"] = dict(selections or {})


def get_guided_order_quantity(session_id: str) -> int | None:
    session = get_session(session_id)
    quantity = session.get("guided_order_quantity")
    return int(quantity) if quantity is not None else None


def set_guided_order_quantity(session_id: str, quantity: int | None) -> None:
    session = get_session(session_id)
    session["guided_order_quantity"] = int(quantity) if quantity is not None else None


def clear_guided_order_session(session_id: str) -> None:
    session = get_session(session_id)
    session["guided_order_item_id"] = None
    session["guided_order_item_name"] = None
    session["guided_order_phase"] = 1
    session["guided_order_step"] = 0
    session["guided_order_groups"] = []
    session["guided_order_required_groups"] = []
    session["guided_order_optional_groups"] = []
    session["guided_order_selections"] = {}
    session["guided_order_quantity"] = None
