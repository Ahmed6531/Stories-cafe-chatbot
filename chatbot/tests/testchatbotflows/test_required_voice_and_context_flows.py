"""
Focused regression tests for the required voice/chatbot context flows.

These tests mock every external dependency:
  - Express tools calls
  - Gemini/LLM interpretation
  - Google STT responses
  - TTS is bypassed by testing the service layer directly
"""
import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.api import voice as voice_api
from app.schemas.chat import ChatMessageResponse
from app.services import session_store
from app.services.orchestrator import process_chat_message


LLM_TARGET = "app.services.orchestrator.try_interpret_message"
MENU_ITEMS_TARGET = "app.services.tools.fetch_menu_items"
MENU_DETAIL_TARGET = "app.services.tools.fetch_menu_item_detail"
ADD_CART_TARGET = "app.services.tools.add_item_to_cart"
GET_CART_TARGET = "app.services.tools.get_cart"
UPDATE_QTY_TARGET = "app.services.tools.update_cart_item_quantity"
FEATURED_TARGET = "app.services.tools.fetch_featured_items"
UPSELL_TARGET = "app.services.upsell.get_upsell_suggestions"
FALLBACK_TARGET = "app.services.orchestrator.generate_fallback_reply"
CHAT_ENDPOINT_ORCH_TARGET = "app.api.chat.process_chat_message"
CHAT_ENDPOINT_TTS_TARGET = "app.api.chat.tts_service.synthesize"


def _flush_sessions():
    session_store.sessions.clear()


def _session(session_id="sid-1"):
    session = session_store.get_session(session_id)
    session["cart_id"] = None
    session["last_items"] = []
    session["last_intent"] = None
    session["stage"] = None
    session["pending_clarification"] = None
    session["history"] = []
    return session


def _latte_menu():
    return [
        {
            "id": 101,
            "name": "Latte",
            "isAvailable": True,
            "category": "Beverages",
            "subcategory": "Coffee",
            "basePrice": 8000,
        }
    ]


def _latte_detail():
    return {
        "id": 101,
        "name": "Latte",
        "isAvailable": True,
        "category": "Beverages",
        "subcategory": "Coffee",
        "basePrice": 8000,
        "variants": [],
    }


def _latte_requested(quantity=1):
    return {
        "item_name": "Latte",
        "quantity": quantity,
        "size": None,
        "options": {"milk": None, "sugar": None},
        "addons": [],
        "instructions": "",
    }


def _latte_cart(cart_id="cart-1", qty=1):
    return {
        "cart_id": cart_id,
        "cart": [
            {
                "lineId": "line-latte",
                "menuItemId": 101,
                "name": "Latte",
                "qty": qty,
                "price": 8000,
                "category": "Beverages",
                "subcategory": "Coffee",
            }
        ],
    }


class TestRequiredChatbotContextFlows(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_add_one_latte_uses_heuristics_and_calls_express_add(self):
        session = _session("sid-add")
        add_mock = AsyncMock(return_value=_latte_cart("cart-add", qty=1))

        with (
            patch(LLM_TARGET, return_value=None),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=_latte_menu())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=_latte_detail())),
            patch(ADD_CART_TARGET, new=add_mock),
            patch(FEATURED_TARGET, new=AsyncMock(return_value=[])),
            patch(UPSELL_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="sid-add",
                message="add one latte",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "add_items")
        self.assertTrue(response.cart_updated)
        self.assertEqual(response.metadata["pipeline_stage"], "add_items_done")
        self.assertEqual(session["last_items"][0]["item_name"], "latte")
        add_mock.assert_awaited_once()
        self.assertEqual(add_mock.await_args.kwargs["menu_item_id"], 101)
        self.assertEqual(add_mock.await_args.kwargs["qty"], 1)

    async def test_make_it_2_uses_last_items_and_updates_existing_cart_line(self):
        session = _session("sid-update")
        session["cart_id"] = "cart-update"
        session["last_items"] = [_latte_requested(quantity=1)]
        update_mock = AsyncMock(return_value=_latte_cart("cart-update", qty=2))

        with (
            patch(LLM_TARGET, return_value=None),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=_latte_cart("cart-update", qty=1))),
            patch(UPDATE_QTY_TARGET, new=update_mock),
        ):
            response = await process_chat_message(
                session_id="sid-update",
                message="make it 2",
                cart_id="cart-update",
                session=session,
            )

        self.assertEqual(response.intent, "update_quantity")
        self.assertEqual(response.metadata["pipeline_stage"], "update_quantity_done")
        update_mock.assert_awaited_once()
        self.assertEqual(update_mock.await_args.kwargs["line_id"], "line-latte")
        self.assertEqual(update_mock.await_args.kwargs["qty"], 2)

    async def test_another_one_adds_one_more_not_previous_quantity_plus_one(self):
        session = _session("sid-another")
        session["cart_id"] = "cart-another"
        session["last_items"] = [_latte_requested(quantity=1)]
        add_mock = AsyncMock(return_value=_latte_cart("cart-another", qty=2))

        with (
            patch(LLM_TARGET, side_effect=AssertionError("repeat override should skip LLM")),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=_latte_menu())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=_latte_detail())),
            patch(ADD_CART_TARGET, new=add_mock),
            patch(FEATURED_TARGET, new=AsyncMock(return_value=[])),
            patch(UPSELL_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="sid-another",
                message="another one",
                cart_id="cart-another",
                session=session,
            )

        self.assertEqual(response.intent, "add_items")
        self.assertTrue(response.cart_updated)
        add_mock.assert_awaited_once()
        self.assertEqual(add_mock.await_args.kwargs["qty"], 1)

    async def test_invalid_input_returns_fallback_without_cart_update(self):
        session = _session("sid-invalid")

        with (
            patch(LLM_TARGET, return_value={
                "intent": "unknown",
                "items": [],
                "confidence": 0.1,
                "fallback_needed": True,
            }),
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="Can you rephrase that?")),
        ):
            response = await process_chat_message(
                session_id="sid-invalid",
                message="asdf qwer zxcv",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "unknown")
        self.assertFalse(response.cart_updated)
        self.assertEqual(response.reply, "Can you rephrase that?")
        self.assertEqual(response.metadata["pipeline_stage"], "fallback_response")

    async def test_checkout_handoff_sets_summary_then_redirect_on_confirmation(self):
        session = _session("sid-checkout")
        session["cart_id"] = "cart-checkout"

        with (
            patch(LLM_TARGET, return_value={
                "intent": "unknown",
                "items": [],
                "confidence": 0.1,
                "fallback_needed": True,
            }),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=_latte_cart("cart-checkout", qty=1))),
        ):
            summary = await process_chat_message(
                session_id="sid-checkout",
                message="checkout",
                cart_id="cart-checkout",
                session=session,
            )
            redirect = await process_chat_message(
                session_id="sid-checkout",
                message="yes",
                cart_id="cart-checkout",
                session=session,
            )

        self.assertEqual(summary.metadata["pipeline_stage"], "checkout_summary")
        self.assertEqual(redirect.intent, "confirm_checkout")
        self.assertEqual(redirect.metadata["pipeline_stage"], "checkout_redirect")
        self.assertEqual(redirect.cart_id, "cart-checkout")


class TestChatEndpointSessionUpdate(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_endpoint_persists_last_items_from_orchestrator_metadata(self):
        from fastapi.testclient import TestClient
        from app.main import app

        response = ChatMessageResponse(
            session_id="sid-http",
            status="ok",
            reply="Added 1 Latte to your cart.",
            intent="add_items",
            cart_updated=True,
            cart_id="cart-http",
            defaults_used=[],
            suggestions=[],
            metadata={
                "pipeline_stage": "add_items_done",
                "requested_items": [_latte_requested(quantity=1)],
            },
        )

        with (
            patch(CHAT_ENDPOINT_ORCH_TARGET, new=AsyncMock(return_value=response)),
            patch(CHAT_ENDPOINT_TTS_TARGET, new=AsyncMock(return_value=None)),
        ):
            client = TestClient(app)
            http_response = client.post(
                "/chat/message",
                json={"session_id": "sid-http", "message": "add one latte"},
            )

        self.assertEqual(http_response.status_code, 200)
        session = session_store.get_session("sid-http")
        self.assertEqual(session["cart_id"], "cart-http")
        self.assertEqual(session["last_items"], [_latte_requested(quantity=1)])
        self.assertEqual(session["last_intent"], "add_items")


class _FakeAlternative:
    def __init__(self, transcript):
        self.transcript = transcript


class _FakeResult:
    def __init__(self, transcript, is_final):
        self.alternatives = [_FakeAlternative(transcript)]
        self.is_final = is_final


class _FakeResponse:
    def __init__(self, transcript, is_final):
        self.results = [_FakeResult(transcript, is_final)]


class _FakeSpeechClient:
    def __init__(self, responses=None, error=None):
        self.responses = responses or []
        self.error = error

    def streaming_recognize(self, _config, requests):
        if self.error:
            raise self.error

        for _request in requests:
            for response in self.responses:
                yield response
            return


class _FakeWebSocket:
    def __init__(self, messages):
        self.messages = list(messages)
        self.sent = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def receive(self):
        if not self.messages:
            return {"type": "websocket.disconnect"}
        return self.messages.pop(0)

    async def send_json(self, payload):
        self.sent.append(payload)


def _start_message():
    return {
        "text": json.dumps({
            "type": "start",
            "session_id": "voice-session",
            "utterance_id": "utt-1",
            "mime_type": "audio/webm;codecs=opus",
        })
    }


def _stop_message():
    return {"text": json.dumps({"type": "stop", "reason": "test"})}


class TestFastApiVoiceStream(unittest.IsolatedAsyncioTestCase):
    async def test_stt_partial_and_final_transcript_are_returned(self):
        websocket = _FakeWebSocket([
            _start_message(),
            {"bytes": b"audio-bytes"},
            _stop_message(),
        ])
        fake_client = _FakeSpeechClient([
            _FakeResponse("lat", is_final=False),
            _FakeResponse("latte", is_final=True),
        ])

        with patch("app.api.voice._make_client", return_value=fake_client):
            await voice_api.voice_stream(websocket)

        self.assertTrue(websocket.accepted)
        self.assertIn({"type": "partial", "confirmed": "", "interim": "lat"}, websocket.sent)
        self.assertIn({"type": "partial", "confirmed": "latte", "interim": ""}, websocket.sent)
        self.assertEqual(websocket.sent[-1]["type"], "final")
        self.assertEqual(websocket.sent[-1]["text"], "latte")

    async def test_stt_no_speech_returns_no_speech_terminal_event(self):
        websocket = _FakeWebSocket([
            _start_message(),
            _stop_message(),
        ])

        with patch("app.api.voice._make_client", return_value=_FakeSpeechClient([])):
            await voice_api.voice_stream(websocket)

        self.assertEqual(websocket.sent[-1], {"type": "no_speech"})

    async def test_stt_error_returns_error_event(self):
        websocket = _FakeWebSocket([
            _start_message(),
            _stop_message(),
        ])

        with patch("app.api.voice._make_client", return_value=_FakeSpeechClient(error=RuntimeError("STT failed"))):
            await voice_api.voice_stream(websocket)

        self.assertEqual(websocket.sent[-1]["type"], "error")
        self.assertIn("STT failed", websocket.sent[-1]["message"])

    async def test_stt_timeout_returns_timeout_error_event(self):
        websocket = _FakeWebSocket([
            _start_message(),
            _stop_message(),
        ])
        original_wait_for = asyncio.wait_for

        async def _timeout(_awaitable, timeout):
            if hasattr(_awaitable, "cancel"):
                _awaitable.cancel()
                try:
                    await _awaitable
                except asyncio.CancelledError:
                    pass
            raise asyncio.TimeoutError

        try:
            voice_api.asyncio.wait_for = _timeout
            with patch("app.api.voice._make_client", return_value=_FakeSpeechClient([])):
                await voice_api.voice_stream(websocket)
        finally:
            voice_api.asyncio.wait_for = original_wait_for

        self.assertEqual(websocket.sent[-1]["type"], "error")
        self.assertEqual(websocket.sent[-1]["kind"], "timeout")
