from typing import Any
from pydantic import BaseModel, Field


class ChatMessageRequest(BaseModel):
    session_id: str = Field(..., description="Frontend/chatbot session identifier")
    message: str = Field(..., min_length=1, description="User text input")


class ChatMessageResponse(BaseModel):
    session_id: str
    status: str = "ok"
    reply: str

    # foundation fields for later Sprint 3 tasks
    intent: str = "unknown"
    cart_updated: bool = False
    defaults_used: list[dict[str, Any]] = Field(default_factory=list)
    suggestions: list[dict[str, Any]] = Field(default_factory=list)

    # useful for future frontend rendering and debugging
    metadata: dict[str, Any] = Field(default_factory=dict)