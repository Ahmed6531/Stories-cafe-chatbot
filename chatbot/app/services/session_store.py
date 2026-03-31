# app/services/session_store.py

from typing import Tuple

# In-memory store: session_id -> {"cart_id", "last_pipeline_stage", "checkout_initiated"}
_sessions: dict[str, dict] = {}

_DEFAULT_SESSION: dict = {"cart_id": None, "last_pipeline_stage": None, "checkout_initiated": False}


def _ensure(session_id: str) -> dict:
    if session_id not in _sessions:
        _sessions[session_id] = dict(_DEFAULT_SESSION)
    return _sessions[session_id]


def get_or_create_session(session_id: str | None) -> Tuple[str, str | None]:
    """
    Returns a session_id and cart_id.
    If session_id is None or unknown, creates a new session.
    """
    import uuid

    if session_id:
        return session_id, _ensure(session_id)["cart_id"]

    new_session_id = str(uuid.uuid4())
    _sessions[new_session_id] = dict(_DEFAULT_SESSION)
    return new_session_id, None


def set_session_cart_id(session_id: str, cart_id: str | None) -> None:
    _ensure(session_id)["cart_id"] = cart_id


def get_session_stage(session_id: str) -> str | None:
    return _sessions.get(session_id, {}).get("last_pipeline_stage")


def set_session_stage(session_id: str, stage: str | None) -> None:
    _ensure(session_id)["last_pipeline_stage"] = stage


def get_checkout_initiated(session_id: str) -> bool:
    return _sessions.get(session_id, {}).get("checkout_initiated", False)


def set_checkout_initiated(session_id: str) -> None:
    _ensure(session_id)["checkout_initiated"] = True
