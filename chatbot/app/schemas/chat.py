from typing import Any
from pydantic import BaseModel, Field


class ChatMessageRequest(BaseModel):
    session_id: str = Field(..., description="Frontend/chatbot session identifier")
    message: str = Field(..., min_length=1, description="User text input")
    cart_id: str | None = Field(default=None, description="Existing cart identifier")


class ChatMessageResponse(BaseModel):
    session_id: str
    status: str = "ok"
    reply: str

    intent: str = "unknown"
    cart_updated: bool = False
    cart_id: str | None = None
    # Can contain human-readable default labels (e.g. "Medium", "Full Fat")
    # and/or structured entries when needed.
    defaults_used: list[Any] = Field(default_factory=list)
    suggestions: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)