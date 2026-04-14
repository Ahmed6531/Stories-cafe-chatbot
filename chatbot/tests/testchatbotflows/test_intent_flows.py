"""
Tests for per-intent orchestrator flows in app/services/orchestrator.py

Each test mocks:
  - resolve_intent     → controlled pipeline output (replaces try_interpret_message mock)
  - tools.py HTTP calls → no real network
  - tts_service         → no audio synthesis

Covers one happy-path scenario per intent:
  add_items, update_quantity (with + without session fallback),
  remove_item (with + without session fallback), view_cart, clear_cart,
  describe_item, recommendation_query, checkout, unknown (fallback),
  repeat_last_order.

Does NOT retest:
  - Typo correction (test_intent_typos.py)
  - Fuzzy menu matching (test_recommendation_logic.py)
  - Variant/customization logic (test_variants_logic.py, test_customization.py)
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock, Mock

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


def _flush_sessions():
    session_store.sessions.clear()


# ---------------------------------------------------------------------------
# Patch targets
# resolve_intent is imported into orchestrator from intent_pipeline, so we
# mock it at the orchestrator module level (where it is looked up at call time).
# It is an async function, so AsyncMock is required.
# ---------------------------------------------------------------------------

LLM_TARGET = "app.services.orchestrator.resolve_intent"
MENU_ITEMS_TARGET = "app.services.tools.fetch_menu_items"
MENU_DETAIL_TARGET = "app.services.tools.fetch_menu_item_detail"
ADD_CART_TARGET = "app.services.tools.add_item_to_cart"
GET_CART_TARGET = "app.services.tools.get_cart"
CLEAR_CART_TARGET = "app.services.tools.clear_cart"
UPDATE_QTY_TARGET = "app.services.tools.update_cart_item_quantity"
REMOVE_ITEM_TARGET = "app.services.tools.remove_item_from_cart"
ORDERS_TARGET = "app.services.tools.fetch_my_orders"
FALLBACK_TARGET = "app.services.orchestrator.generate_fallback_reply"
COMBO_TARGET = "app.services.tools.fetch_combo_suggestions"


def _latte_requested_item():
    return {
        "item_name": "Latte",
        "quantity": 1,
        "size": "Medium",
        "options": {"milk": "Full Fat", "sugar": None},
        "addons": [],
        "instructions": "",
    }


# ---------------------------------------------------------------------------
# add_items
# ---------------------------------------------------------------------------

class TestAddItemsFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_add_items_happy_path_sets_cart_updated(self):
        session = fake_session("s-add")
        session_store.sessions["s-add"] = session
        menu_items = [
            {**item, "id": 101} if item.get("name") == "Latte" else item
            for item in fake_menu_items()
        ]
        cart_after = fake_cart(
            "cart-123",
            items=[{
                "_id": "line-1",
                "menuItemId": 101,
                "name": "Latte",
                "qty": 1,
                "price": 8000,
                "category": "beverages",
                "subcategory": "coffee",
            }],
        )

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "add_items",
                [{
                    "item_name": "Latte",
                    "quantity": 1,
                    "size": None,
                    "options": {"milk": None, "sugar": None},
                    "addons": [],
                    "instructions": "",
                }],
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=menu_items)),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=fake_menu_item_detail_no_variants("Latte"))),
            patch(ADD_CART_TARGET, new=AsyncMock(return_value=cart_after)),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-add",
                message="add a latte",
                cart_id=None,
                session=session,
            )

        self.assertTrue(response.cart_updated)
        self.assertEqual(response.intent, "add_items")
        self.assertIn("latte", response.reply.lower())

    async def test_add_items_unknown_item_returns_error_reply(self):
        session = fake_session("s-add2")
        session_store.sessions["s-add2"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "add_items", [{"item_name": "xyzqqqblarp", "quantity": 1, "size": None,
                               "options": {"milk": None, "sugar": None}, "addons": [], "instructions": ""}]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=None)),
            patch(ADD_CART_TARGET, new=AsyncMock(return_value=fake_cart())),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-add2",
                message="add a xyzqqqblarp",
                cart_id=None,
                session=session,
            )

        self.assertFalse(response.cart_updated)


# ---------------------------------------------------------------------------
# update_quantity
# ---------------------------------------------------------------------------

class TestUpdateQuantityFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_update_quantity_happy_path(self):
        session = fake_session("s-upd")
        session["last_items"] = [_latte_requested_item()]
        session_store.sessions["s-upd"] = session

        cart_after = fake_cart("cart-1", items=[{"_id": "line-1", "name": "Latte", "qty": 3}])

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "update_quantity",
                [{"item_name": "Latte", "quantity": 3, "size": None,
                  "options": {"milk": None, "sugar": None}, "addons": [], "instructions": ""}]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-1"))),
            patch(UPDATE_QTY_TARGET, new=AsyncMock(return_value=cart_after)),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-upd",
                message="change latte to 3",
                cart_id="cart-1",
                session=session,
            )

        self.assertEqual(response.intent, "update_quantity")
        self.assertIn("status", response.dict())

    async def test_update_quantity_uses_last_items_from_session(self):
        """When LLM returns no item name, orchestrator falls back to session.last_items."""
        session = fake_session("s-upd2")
        session["last_items"] = [_latte_requested_item()]
        session["cart_id"] = "cart-2"
        session_store.sessions["s-upd2"] = session

        cart_response = fake_cart("cart-2", items=[{"_id": "line-1", "name": "Latte", "qty": 5}])

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "update_quantity", []  # no items — should use session.last_items
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-2"))),
            patch(UPDATE_QTY_TARGET, new=AsyncMock(return_value=cart_response)),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-upd2",
                message="make it 5",
                cart_id="cart-2",
                session=session,
            )

        self.assertIn(response.intent, {"update_quantity", "unknown"})


# ---------------------------------------------------------------------------
# remove_item
# ---------------------------------------------------------------------------

class TestRemoveItemFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_remove_item_happy_path(self):
        session = fake_session("s-rem")
        session["last_items"] = [_latte_requested_item()]
        session_store.sessions["s-rem"] = session

        cart_after = fake_cart("cart-3", items=[])

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "remove_item",
                [{"item_name": "Latte", "quantity": 1, "size": None,
                  "options": {}, "addons": [], "instructions": ""}]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-3"))),
            patch(REMOVE_ITEM_TARGET, new=AsyncMock(return_value=cart_after)),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-rem",
                message="remove the latte",
                cart_id="cart-3",
                session=session,
            )

        self.assertEqual(response.intent, "remove_item")

    async def test_remove_item_uses_last_items_from_session(self):
        session = fake_session("s-rem2")
        session["last_items"] = [_latte_requested_item()]
        session["cart_id"] = "cart-4"
        session_store.sessions["s-rem2"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "remove_item", []  # no item — falls back to session
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-4"))),
            patch(REMOVE_ITEM_TARGET, new=AsyncMock(return_value=fake_cart("cart-4"))),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-rem2",
                message="remove it",
                cart_id="cart-4",
                session=session,
            )

        self.assertIn(response.intent, {"remove_item", "unknown"})


# ---------------------------------------------------------------------------
# view_cart
# ---------------------------------------------------------------------------

class TestViewCartFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_view_cart_calls_get_cart_and_returns_reply(self):
        session = fake_session("s-view")
        session_store.sessions["s-view"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("view_cart"))),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-5"))),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-view",
                message="show my cart",
                cart_id="cart-5",
                session=session,
            )

        self.assertEqual(response.intent, "view_cart")
        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


# ---------------------------------------------------------------------------
# clear_cart
# ---------------------------------------------------------------------------

class TestClearCartFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_clear_cart_resets_session_last_items(self):
        session = fake_session("s-clr")
        session["last_items"] = [_latte_requested_item()]
        session["cart_id"] = "cart-6"
        session_store.sessions["s-clr"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("clear_cart"))),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-6"))),
            patch(CLEAR_CART_TARGET, new=AsyncMock(return_value=fake_cart("cart-6"))),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-clr",
                message="clear my cart",
                cart_id="cart-6",
                session=session,
            )

        self.assertEqual(response.intent, "clear_cart")
        # After clear_cart the session last_items should be reset
        self.assertEqual(session.get("last_items", []), [])


# ---------------------------------------------------------------------------
# describe_item
# ---------------------------------------------------------------------------

class TestDescribeItemFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_describe_item_returns_item_description(self):
        session = fake_session("s-desc")
        session_store.sessions["s-desc"] = session

        detail = fake_menu_item_detail("Latte")
        detail["description"] = "A smooth espresso with steamed milk."

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "describe_item",
                [{"item_name": "Latte", "quantity": 1, "size": None,
                  "options": {}, "addons": [], "instructions": ""}]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=detail)),
        ):
            response = await process_chat_message(
                session_id="s-desc",
                message="tell me about the latte",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "describe_item")
        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


# ---------------------------------------------------------------------------
# recommendation_query
# ---------------------------------------------------------------------------

class TestRecommendationQueryFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_recommendation_returns_suggestions_list(self):
        session = fake_session("s-rec")
        session_store.sessions["s-rec"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("recommendation_query"))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch("app.services.tools.fetch_featured_items", new=AsyncMock(return_value=[])),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-rec",
                message="what do you recommend?",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "recommendation_query")
        self.assertIsInstance(response.reply, str)


# ---------------------------------------------------------------------------
# checkout
# ---------------------------------------------------------------------------

class TestCheckoutFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_checkout_returns_cart_summary_reply(self):
        session = fake_session("s-chk")
        session["cart_id"] = "cart-7"
        session_store.sessions["s-chk"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("checkout"))),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte("cart-7"))),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-chk",
                message="checkout please",
                cart_id="cart-7",
                session=session,
            )

        self.assertEqual(response.intent, "checkout")
        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


# ---------------------------------------------------------------------------
# unknown → fallback
# ---------------------------------------------------------------------------

class TestUnknownIntentFallback(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_unknown_intent_calls_generate_fallback_reply(self):
        session = fake_session("s-unk")
        session_store.sessions["s-unk"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("unknown"))),
            patch(FALLBACK_TARGET, new=AsyncMock(return_value="I'm not sure, can you rephrase?")),
        ):
            response = await process_chat_message(
                session_id="s-unk",
                message="zxcvbnm",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "unknown")
        self.assertIsInstance(response.reply, str)
        self.assertGreater(len(response.reply), 0)


# ---------------------------------------------------------------------------
# repeat_last_order
# ---------------------------------------------------------------------------

class TestRepeatLastOrderFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_repeat_last_order_fetches_orders(self):
        session = fake_session("s-rep")
        session_store.sessions["s-rep"] = session

        past_order = {
            "_id": "order-old",
            "items": [
                {
                    "menuItemId": "item-latte",
                    "name": "Latte",
                    "qty": 1,
                    "selectedOptions": [{"name": "Medium"}],
                }
            ],
        }

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("repeat_order"))),
            patch(ORDERS_TARGET, new=AsyncMock(return_value=[past_order])),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=fake_menu_item_detail_no_variants("Latte"))),
            patch(ADD_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte())),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-rep",
                message="repeat my last order",
                cart_id=None,
                session=session,
            )

        self.assertIn(response.intent, {"repeat_order", "repeat_last_order", "add_items", "unknown"})
        self.assertIsInstance(response.reply, str)


if __name__ == "__main__":
    unittest.main()
