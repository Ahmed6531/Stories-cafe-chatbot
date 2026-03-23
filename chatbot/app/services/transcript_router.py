"""
TranscriptRouter

Routes a final transcript to either the LLM path or the rule-based
chatbot at :8000, based on intent classification.

LLM PATH: Not yet implemented. Stub returns a no-op result.
The LLM teammate implements _route_to_llm() and improves
_classify_intent() with real classification logic.

CHATBOT PATH: Posts to :8000/chat/message via httpx.
Same payload the frontend Navbar.sendMessage() sends today.

Integration point for voice.py (to be added later):
    After sending the final WebSocket message to the browser,
    call:
        router = TranscriptRouter()
        result = await router.route(text, session_id, cart_id)
    The result can be forwarded to the browser as a new message
    type, e.g. { "type": "reply", "text": result["reply"] }
"""

import httpx
from typing import Optional

CHATBOT_URL = "http://localhost:8000"

ORDER_KEYWORDS = [
    "add", "remove", "order", "cancel", "delete",
    "put", "take off", "get me", "i want", "i'd like",
    "أضف", "احذف", "أريد", "اطلب",  # Arabic order keywords
]


class TranscriptRouter:

    def _classify_intent(self, text: str) -> str:
        """
        Classify transcript into routing destination.
        Returns "llm" or "chatbot".

        TODO (LLM teammate): Replace with real intent classification.
        Current implementation uses keyword matching only.

        Contract (must always be satisfied):
            input:  str — final transcript text
            output: str — "llm" | "chatbot"
        """
        text_lower = text.lower()
        if any(kw in text_lower for kw in ORDER_KEYWORDS):
            return "chatbot"
        return "llm"

    async def route(
        self,
        text: str,
        session_id: str,
        cart_id: Optional[str] = None,
    ) -> dict:
        """
        Route a final transcript and return a result dict.

        Return shape:
        {
            "handled": bool,
            "route": "llm" | "chatbot",
            "reply": str | None,
            "error": str | None,
        }
        """
        intent = self._classify_intent(text)
        if intent == "llm":
            return await self._route_to_llm(text, session_id)
        return await self._route_to_chatbot(text, session_id, cart_id)

    async def _route_to_llm(
        self,
        text: str,
        session_id: str,
    ) -> dict:
        """
        TODO (LLM teammate): Implement this method.

        Expected behavior:
        - Send text to the LLM
        - Return:
          {
              "handled": True,
              "route": "llm",
              "reply": "<LLM response string>",
              "error": None,
          }

        Current behavior: logs and no-ops so routing never crashes.
        """
        print(f"[TranscriptRouter] LLM path not yet implemented. "
              f"session={session_id} text='{text}'")
        return {
            "handled": False,
            "route": "llm",
            "reply": None,
            "error": "LLM not yet integrated",
        }

    async def _route_to_chatbot(
        self,
        text: str,
        session_id: str,
        cart_id: Optional[str],
    ) -> dict:
        """
        POST transcript to :8000/chat/message.
        Same payload shape as Navbar.sendMessage() in the frontend:
            { session_id, message, cart_id }
        """
        payload = {
            "session_id": session_id,
            "message": text,
        }
        if cart_id:
            payload["cart_id"] = cart_id

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{CHATBOT_URL}/chat/message",
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "handled": True,
                    "route": "chatbot",
                    "reply": data.get("reply") or data.get("message"),
                    "error": None,
                }
        except Exception as e:
            return {
                "handled": False,
                "route": "chatbot",
                "reply": None,
                "error": str(e),
            }
