from pydantic import BaseModel
from typing import Optional


class TranscriptEvent(BaseModel):
    """Incoming event shape from the browser WebSocket start message."""
    session_id: str
    utterance_id: str
    text: str
    is_final: bool
    source: str = "voice"       # "voice" | "text"
    cart_id: Optional[str] = None
    mime_type: Optional[str] = None


class RouteResult(BaseModel):
    """Output shape of TranscriptRouter.route()."""
    handled: bool
    route: str                  # "llm" | "chatbot"
    reply: Optional[str] = None
    error: Optional[str] = None
