# app/services/session_store.py

from typing import TypedDict
import uuid


# Session data structure
class Session(TypedDict):
    session_id: str
    cart_id: str | None
    last_items: list
    last_intent: str | None


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
        return sessions[session_id]
    
    # Create new session
    new_session: Session = {
        "session_id": session_id,
        "cart_id": None,
        "last_items": [],
        "last_intent": None,
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