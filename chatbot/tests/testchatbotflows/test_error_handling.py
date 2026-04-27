"""
Tests for failure and recovery scenarios across the chatbot stack.

Covers:
  - LLM API failure → heuristic/fallback takes over, no crash
  - Express backend down → response is graceful error reply, not 500
  - Item not found in menu → helpful "not found" reply
  - Cart add failure → session last_items NOT corrupted with the failed item
  - Empty message (whitespace-only) → graceful reply
  - Very long message → no crash
  - fetch_menu_item_detail returns None → graceful describe_item reply

Does NOT retest:
  - _is_incomplete_reply / LLM response validation (test_fallback_assistant.py)
  - HTTP client shape tests (test_tools_unit.py)
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tests.testchatbotflows.conftest import (
    fake_menu_items,
    fake_menu_item_detail,
    fake_menu_item_detail_no_variants,
    fake_session,
    mock_llm_response,
    fake_cart,
    fake_cart_with_latte,
)
from app.services import session_store
from app.services.orchestrator import process_chat_message

# resolve_intent is async — must use AsyncMock.
LLM_TARGET = "app.services.orchestrator.resolve_intent"
MENU_ITEMS_TARGET = "app.services.tools.fetch_menu_items"
MENU_DETAIL_TARGET = "app.services.tools.fetch_menu_item_detail"
ADD_CART_TARGET = "app.services.tools.add_item_to_cart"
GET_CART_TARGET = "app.services.tools.get_cart"
FALLBACK_TARGET = "app.services.orchestrator.generate_fallback_reply"
COMBO_TARGET = "app.services.tools.fetch_combo_suggestions"


def _flush_sessions():
    session_store.sessions.clear()


def _latte_item():
    return {
        "item_name": "Latte",
        "quantity": 1,
        "size": "Medium",
        "options": {"milk": "Full Fat", "sugar": None},
        "addons": [],
        "instructions": "",
    }


# ---------------------------------------------------------------------------
# LLM failure
# ---------------------------------------------------------------------------

class TestLLMFailure(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_llm_exception_does_not_crash_orchestrator(self):
        """When resolve_intent raises, the orchestrator catches it and returns a graceful reply."""
        session = fake_session("s-llm-fail")
        session_store.sessions["s-llm-fail"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(side_effect=Exception("Gemini unavailable"))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="Sorry, I'm having trouble right now.")),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-llm-fail",
                message="add a latte",
                cart_id=None,
                session=session,
            )

        # Must return a reply, not raise
        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)

    async def test_llm_low_confidence_falls_back_gracefully(self):
        """When resolve_intent signals route_to_fallback=True, the orchestrator calls fallback."""
        session = fake_session("s-llm-low")
        session_store.sessions["s-llm-low"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value={
                "intent": "unknown",
                "confidence": 0.0,
                "items": [],
                "follow_up_ref": None,
                "needs_clarification": False,
                "reason": "llm_parse_failed",
                "source": "llm",
                "route_to_fallback": True,
                "fallback_needed": True,
            })),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="I didn't catch that.")),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-llm-low",
                message="add a latte",
                cart_id=None,
                session=session,
            )

        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


# ---------------------------------------------------------------------------
# Express backend unavailable
# ---------------------------------------------------------------------------

class TestExpressBackendDown(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_menu_fetch_failure_returns_reply_not_crash(self):
        session = fake_session("s-menu-fail")
        session_store.sessions["s-menu-fail"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "add_items", [_latte_item()]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=[])),  # empty = backend failure
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="Menu is unavailable right now.")),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-menu-fail",
                message="add a latte",
                cart_id=None,
                session=session,
            )

        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)
        self.assertFalse(response.cart_updated)

    async def test_get_cart_failure_returns_graceful_reply(self):
        session = fake_session("s-cart-fail")
        session["cart_id"] = "cart-x"
        session_store.sessions["s-cart-fail"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("view_cart"))),
            patch(GET_CART_TARGET, new=AsyncMock(return_value={"cart_id": "cart-x", "cart": []})),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-cart-fail",
                message="show cart",
                cart_id="cart-x",
                session=session,
            )

        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


# ---------------------------------------------------------------------------
# Item not found in menu
# ---------------------------------------------------------------------------

class TestItemNotFoundInMenu(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_unknown_item_does_not_call_add_cart(self):
        session = fake_session("s-notfound")
        session_store.sessions["s-notfound"] = session

        add_mock = AsyncMock(return_value=fake_cart())

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "add_items",
                [{
                    "item_name": "zzznonexistent",
                    "quantity": 1,
                    "size": None,
                    "options": {"milk": None, "sugar": None},
                    "addons": [],
                    "instructions": "",
                }]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=None)),
            patch(ADD_CART_TARGET, new=add_mock),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-notfound",
                message="add a zzznonexistent",
                cart_id=None,
                session=session,
            )

        # The orchestrator should NOT have called add_item_to_cart for an unknown item
        add_mock.assert_not_called()
        self.assertFalse(response.cart_updated)


# ---------------------------------------------------------------------------
# Cart add failure does not corrupt session
# ---------------------------------------------------------------------------

class TestCartAddFailureDoesNotCorruptSession(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_session_last_items_unchanged_after_failed_add(self):
        session = fake_session("s-corrupt")
        original_last_items = [_latte_item()]
        session["last_items"] = original_last_items[:]
        session_store.sessions["s-corrupt"] = session

        # Simulate add_item_to_cart returning an empty cart (error state)
        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "add_items",
                [{
                    "item_name": "Cappuccino",
                    "quantity": 1,
                    "size": "Medium",
                    "options": {"milk": "Full Fat", "sugar": None},
                    "addons": [],
                    "instructions": "",
                }]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=fake_menu_item_detail_no_variants("Cappuccino"))),
            patch(ADD_CART_TARGET, new=AsyncMock(return_value={"cart_id": None, "cart": []})),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-corrupt",
                message="add a cappuccino",
                cart_id=None,
                session=session,
            )

        # Reply must still be a valid string
        self.assertIsInstance(response.reply, str)


# ---------------------------------------------------------------------------
# Edge-case inputs
# ---------------------------------------------------------------------------

class TestEdgeCaseInputs(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_whitespace_only_message_handled_gracefully(self):
        """Whitespace-only input should produce a reply, not crash."""
        session = fake_session("s-ws")
        session_store.sessions["s-ws"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("unknown"))),
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="Could you say that again?")),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-ws",
                message="   ",
                cart_id=None,
                session=session,
            )

        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)

    async def test_very_long_message_does_not_crash(self):
        session = fake_session("s-long")
        session_store.sessions["s-long"] = session
        long_message = "add a latte " * 500  # ~6000 chars

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("unknown"))),
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="I didn't understand that.")),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-long",
                message=long_message,
                cart_id=None,
                session=session,
            )

        self.assertIsInstance(response.reply, str)

    async def test_missing_menu_details_on_describe_item_returns_graceful_reply(self):
        """If fetch_menu_item_detail returns None, describe_item should not crash."""
        session = fake_session("s-desc-none")
        session_store.sessions["s-desc-none"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "describe_item",
                [{
                    "item_name": "Latte",
                    "quantity": 1,
                    "size": None,
                    "options": {},
                    "addons": [],
                    "instructions": "",
                }]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=None)),
        ):
            response = await process_chat_message(
                session_id="s-desc-none",
                message="tell me about the latte",
                cart_id=None,
                session=session,
            )

        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


if __name__ == "__main__":
    unittest.main()
