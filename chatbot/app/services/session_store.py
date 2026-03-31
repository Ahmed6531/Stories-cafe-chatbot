# app/services/session_store.py

from typing import TypedDict
import uuid


# Session data structure
class Session(TypedDict):
    session_id: str
    cart_id: str | None
    last_items: list
    last_intent: str | None
    stage: str | None
    checkout_initiated: bool


# Global in-memory sessions store
sessions: dict[str, Session] = {}


def get_session(session_id: str) -> Session:
    """
    Returns existing session or creates a new one.
    
    Args:
        session_id: The session identifier
        
    Returns:
        Session dictionary with all session data
    """
    if session_id in sessions:
        session = sessions[session_id]
        session.setdefault("stage", None)
        session.setdefault("checkout_initiated", False)
        return session
    
    # Create new session
    new_session: Session = {
        "session_id": session_id,
        "cart_id": None,
        "last_items": [],
        "last_intent": None,
        "stage": None,
        "checkout_initiated": False,
    }
    sessions[session_id] = new_session
    return new_session


def get_or_create_session(session_id: str | None) -> tuple[str, str | None]:
    """
    Returns a session_id and cart_id.
    If session_id is None or unknown, creates a new session.
    
    (Maintained for backward compatibility)
    """
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]["cart_id"]

    # Create a new session
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


def set_checkout_initiated(session_id: str, value: bool) -> None:
    session = get_session(session_id)
    session["checkout_initiated"] = bool(value)
