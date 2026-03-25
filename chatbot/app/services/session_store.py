# app/services/session_store.py

from typing import Tuple

# Simple in-memory store: session_id -> cart_id
_sessions: dict[str, str] = {}


def get_or_create_session(session_id: str | None) -> Tuple[str, str | None]:
    """
    Returns a session_id and cart_id.
    If session_id is None or unknown, creates a new session.
    """
    import uuid

    if session_id:
        if session_id not in _sessions:
            _sessions[session_id] = None
        return session_id, _sessions[session_id]

    # Create a new session
    new_session_id = str(uuid.uuid4())
    cart_id = None  # can later initialize via cart API if needed
    _sessions[new_session_id] = cart_id
    return new_session_id, cart_id


def set_session_cart_id(session_id: str, cart_id: str | None) -> None:
    _sessions[session_id] = cart_id
