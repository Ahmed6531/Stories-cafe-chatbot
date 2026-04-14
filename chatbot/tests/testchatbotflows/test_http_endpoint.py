"""
Tests for the FastAPI chat endpoint in app/api/chat.py

Uses FastAPI's TestClient so no real server is needed.
All external dependencies (orchestrator, TTS) are mocked at the boundary.

Covers:
  - 400 when session_id is missing or blank
  - 200 response shape: status, reply, intent, cart_updated, cart_id, suggestions, audio_base64
  - cart_updated=True when orchestrator signals it
  - Session persistence: history grows across two requests with the same session_id
  - auth cookie header forwarded to process_chat_message
  - audio_base64 field present in response (even if None)

Does NOT retest:
  - Internal orchestrator logic (test_intent_flows.py)
  - Session store internals (test_session_store.py)
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient

from tests.testchatbotflows.conftest import fake_session
from app.services import session_store


def _flush_sessions():
    session_store.sessions.clear()


def _build_app():
    """Import the FastAPI app freshly (avoids module-level side-effects)."""
    from app.main import app
    return app


def _make_response(
    intent: str = "view_cart",
    reply: str = "Here is your cart.",
    cart_updated: bool = False,
    cart_id: str | None = "cart-test",
):
    """Build a ChatMessageResponse-compatible dict for mocking process_chat_message."""
    from app.schemas.chat import ChatMessageResponse
    return ChatMessageResponse(
        session_id="test-sid",
        status="ok",
        reply=reply,
        intent=intent,
        cart_updated=cart_updated,
        cart_id=cart_id,
        defaults_used=[],
        suggestions=[],
        metadata={"pipeline_stage": "intent_resolved"},
        audio_base64=None,
    )


ORCHESTRATOR_TARGET = "app.api.chat.process_chat_message"
TTS_TARGET = "app.api.chat.tts_service.synthesize"


class TestChatEndpointValidation(unittest.TestCase):
    def setUp(self):
        _flush_sessions()
        self.client = TestClient(_build_app(), raise_server_exceptions=False)

    def test_missing_session_id_returns_400(self):
        resp = self.client.post("/chat/message", json={"message": "hello"})
        self.assertEqual(resp.status_code, 422)  # Pydantic validation error (missing required field)

    def test_blank_session_id_returns_400(self):
        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response())),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            resp = self.client.post("/chat/message", json={
                "session_id": "   ",
                "message": "hello",
            })
        self.assertEqual(resp.status_code, 400)

    def test_empty_message_returns_422(self):
        """message has min_length=1, so empty string fails pydantic validation."""
        resp = self.client.post("/chat/message", json={
            "session_id": "sid-1",
            "message": "",
        })
        self.assertEqual(resp.status_code, 422)


class TestChatEndpointResponseShape(unittest.TestCase):
    def setUp(self):
        _flush_sessions()
        self.client = TestClient(_build_app())

    def test_valid_request_returns_200(self):
        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response())),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            resp = self.client.post("/chat/message", json={
                "session_id": "sid-shape",
                "message": "show my cart",
            })
        self.assertEqual(resp.status_code, 200)

    def test_response_has_required_fields(self):
        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response())),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            resp = self.client.post("/chat/message", json={
                "session_id": "sid-fields",
                "message": "hello",
            })
        body = resp.json()
        for field in ("status", "reply", "intent", "cart_updated", "suggestions", "audio_base64"):
            self.assertIn(field, body, f"Missing field: {field}")

    def test_cart_updated_true_when_orchestrator_signals_it(self):
        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(
                return_value=_make_response(intent="add_items", reply="Latte added!", cart_updated=True)
            )),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            resp = self.client.post("/chat/message", json={
                "session_id": "sid-cart",
                "message": "add a latte",
            })
        self.assertTrue(resp.json()["cart_updated"])

    def test_audio_base64_field_present(self):
        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response())),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            resp = self.client.post("/chat/message", json={
                "session_id": "sid-audio",
                "message": "hello",
            })
        body = resp.json()
        self.assertIn("audio_base64", body)

    def test_status_is_ok_on_success(self):
        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response())),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            resp = self.client.post("/chat/message", json={
                "session_id": "sid-status",
                "message": "hello",
            })
        self.assertEqual(resp.json()["status"], "ok")


class TestChatEndpointSessionPersistence(unittest.TestCase):
    def setUp(self):
        _flush_sessions()
        self.client = TestClient(_build_app())

    def test_history_grows_across_two_requests(self):
        sid = "sid-persist"

        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response(reply="First reply"))),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            self.client.post("/chat/message", json={"session_id": sid, "message": "hi"})

        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(return_value=_make_response(reply="Second reply"))),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            self.client.post("/chat/message", json={"session_id": sid, "message": "hello again"})

        session = session_store.sessions.get(sid)
        self.assertIsNotNone(session)
        self.assertEqual(len(session["history"]), 4)  # 2 turns × (user + bot)

    def test_cart_id_persisted_in_session(self):
        sid = "sid-cart-persist"

        with (
            patch(ORCHESTRATOR_TARGET, new=AsyncMock(
                return_value=_make_response(cart_id="cart-persisted")
            )),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            self.client.post("/chat/message", json={"session_id": sid, "message": "add latte"})

        session = session_store.sessions.get(sid)
        self.assertIsNotNone(session)
        self.assertEqual(session.get("cart_id"), "cart-persisted")


class TestChatEndpointCookieForwarding(unittest.TestCase):
    def setUp(self):
        _flush_sessions()
        self.client = TestClient(_build_app())

    def test_auth_cookie_header_forwarded_to_orchestrator(self):
        captured_kwargs = {}

        async def _capture(*args, **kwargs):
            captured_kwargs.update(kwargs)
            return _make_response()

        with (
            patch(ORCHESTRATOR_TARGET, new=_capture),
            patch(TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            self.client.post(
                "/chat/message",
                json={"session_id": "sid-cookie", "message": "repeat my order"},
                headers={"cookie": "token=abc123"},
            )

        # The orchestrator should have received the auth_cookie kwarg
        self.assertEqual(captured_kwargs.get("auth_cookie"), "token=abc123")


if __name__ == "__main__":
    unittest.main()
