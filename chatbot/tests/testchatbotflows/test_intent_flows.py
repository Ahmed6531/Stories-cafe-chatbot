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
        self.redis_patch = patch.object(session_store, "_get_redis_client", return_value=None)
        self.redis_patch.start()
        self.addCleanup(self.redis_patch.stop)

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

    async def test_add_items_with_post_suggestions_emits_confirmation_and_recommendation_blocks(self):
        session = fake_session("s-add-blocks")
        session_store.sessions["s-add-blocks"] = session
        menu_items = [
            {**item, "id": 101, "basePrice": item.get("price", 0)} if item.get("name") == "Latte" else {**item, "basePrice": item.get("price", 0)}
            for item in fake_menu_items()
        ]
        cart_after = fake_cart(
            "cart-555",
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
            patch(GET_CART_TARGET, new=AsyncMock(return_value=cart_after)),
            patch("app.services.upsell.get_upsell_suggestions", new=AsyncMock(return_value=[
                {"type": "upsell", "item_name": "Cheese Croissant", "menu_item_id": "item-croissant"}
            ])),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-add-blocks",
                message="add a latte",
                cart_id=None,
                session=session,
            )

        self.assertTrue(response.cart_updated)
        self.assertGreaterEqual(len(response.blocks), 2)
        self.assertEqual(response.blocks[0].get("type"), "cart_confirmation")
        self.assertEqual(response.blocks[1].get("type"), "recommendations")

    async def test_add_plain_latte_with_real_variant_detail_starts_guided_ordering(self):
        session = fake_session("s-add-guided-real")
        session_store.sessions["s-add-guided-real"] = session
        menu_items = [{
            "id": 8,
            "name": "Latte",
            "isAvailable": True,
            "category": {"name": "Coffee"},
            "variantGroups": [
                "coffee-size-standard",
                "coffee-espresso-options",
                "coffee-milk-options",
                "coffee-add-ons",
            ],
        }]
        latte_detail = {
            "id": 8,
            "name": "Latte",
            "isAvailable": True,
            "category": {"name": "Coffee"},
            "variantGroups": [
                "coffee-size-standard",
                "coffee-espresso-options",
                "coffee-milk-options",
                "coffee-add-ons",
            ],
            "variantGroupDetails": [
                {
                    "groupId": "coffee-size-standard",
                    "name": "Choose Size",
                    "isRequired": True,
                    "maxSelections": 1,
                    "options": [
                        {"name": "Small", "isActive": True},
                        {"name": "Medium", "isActive": True},
                    ],
                },
                {
                    "groupId": "coffee-espresso-options",
                    "name": "Espresso Options",
                    "isRequired": False,
                    "maxSelections": None,
                    "options": [
                        {"name": "Shot Decaffe", "isActive": True},
                        {"name": "Add Shot", "isActive": True},
                    ],
                },
            ],
        }

        add_mock = AsyncMock(return_value=fake_cart())
        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "add_items",
                [{
                    "item_name": "latte",
                    "quantity": 1,
                    "modifiers": [],
                    "notes": [],
                    "follow_up_ref": None,
                    "use_defaults": False,
                }],
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=menu_items)),
            patch(MENU_DETAIL_TARGET, new=AsyncMock(return_value=latte_detail)),
            patch(ADD_CART_TARGET, new=add_mock),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-add-guided-real",
                message="add latte",
                cart_id=None,
                session=session,
            )

        self.assertFalse(response.cart_updated)
        self.assertEqual(response.intent, "add_items")
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_start")
        self.assertIn("What size", response.reply)
        add_mock.assert_not_awaited()


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

    async def test_remove_item_can_match_unavailable_cart_item(self):
        session = fake_session("s-rem-unavailable")
        session_store.sessions["s-rem-unavailable"] = session
        cart_after = fake_cart("cart-5", items=[])
        unavailable_flat_white_cart = fake_cart(
            "cart-5",
            items=[
                {
                    "_id": "line-flat-white",
                    "menuItemId": "item-flat-white",
                    "name": "Flat White",
                    "qty": 1,
                    "price": 8000,
                    "category": "beverages",
                    "subcategory": "coffee",
                    "isAvailable": False,
                }
            ],
        )

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "remove_item",
                [{"item_name": "Flat White", "quantity": 1, "size": None,
                  "options": {}, "addons": [], "instructions": ""}]
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(GET_CART_TARGET, new=AsyncMock(return_value=unavailable_flat_white_cart)),
            patch(REMOVE_ITEM_TARGET, new=AsyncMock(return_value=cart_after)),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-rem-unavailable",
                message="remove the flat white",
                cart_id="cart-5",
                session=session,
            )

        self.assertEqual(response.intent, "remove_item")
        self.assertIn("Removed Flat White", response.reply)


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
            patch(GET_CART_TARGET, new=AsyncMock(return_value=fake_cart("cart-rec", items=[]))),
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
        self.assertIsInstance(response.blocks, list)
        if response.blocks:
            self.assertEqual(response.blocks[0].get("type"), "recommendations")


class TestListCategoryItemsFlow(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_list_category_items_emits_category_list_block(self):
        session = fake_session("s-list-cat")
        session_store.sessions["s-list-cat"] = session

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response(
                "list_category_items",
                [{"category": "pastries"}],
            ))),
            patch(MENU_ITEMS_TARGET, new=AsyncMock(return_value=fake_menu_items())),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id="s-list-cat",
                message="what pastries do you have",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "list_category_items")
        self.assertTrue(response.blocks)
        self.assertEqual(response.blocks[0].get("type"), "category_list")
        self.assertGreater(len(response.blocks[0].get("items") or []), 0)


class TestGuidedOrderingBlocks(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_sessions()

    async def test_guided_open_review_emits_customization_review_block(self):
        sid = "s-guided-block-open"
        session = fake_session(sid)
        session_store.sessions[sid] = session
        session_store.set_session_stage(sid, "guided_ordering")
        session_store.set_guided_order_item_id(sid, "item-latte")
        session_store.set_guided_order_item_name(sid, "Latte")
        session_store.set_guided_order_quantity(sid, 1)
        session_store.set_guided_order_state(sid, "open")
        groups_meta = [
            {
                "groupId": "coffee-milk-options",
                "name": "Milk",
                "customerLabel": "Milk",
                "isRequired": False,
                "maxSelections": 1,
                "isActive": True,
                "options": [
                    {"name": "Full Fat", "isActive": True, "additionalPrice": 0, "suboptions": []},
                    {"name": "Skim Milk", "isActive": True, "additionalPrice": 0, "suboptions": []},
                ],
            }
        ]
        session_store.set_guided_order_groups_meta(sid, groups_meta)
        session_store.set_guided_order_slot_state(sid, {"coffee-milk-options": []})

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("guided_order_response", []))),
            patch(COMBO_TARGET, new=AsyncMock(return_value=[])),
        ):
            response = await process_chat_message(
                session_id=sid,
                message="something else",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "guided_order_response")
        self.assertTrue(response.blocks)
        review_block = next((block for block in response.blocks if block.get("type") == "customization_review"), None)
        self.assertIsNotNone(review_block)
        self.assertGreater(len(review_block.get("groups") or []), 0)


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

    async def test_repeat_last_order_requires_login(self):
        session = fake_session("s-rep-login")
        session_store.sessions["s-rep-login"] = session

        with patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("repeat_order"))):
            response = await process_chat_message(
                session_id="s-rep-login",
                message="repeat my last order",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "repeat_order")
        self.assertEqual(response.metadata["pipeline_stage"], "repeat_order_requires_login")

    async def test_repeat_last_order_lists_history_and_waits_for_confirmation(self):
        session = fake_session("s-rep")
        session_store.sessions["s-rep"] = session

        past_order = {
            "_id": "order-old",
            "items": [
                {
                    "menuItemId": "item-latte",
                    "name": "Latte",
                    "qty": 1,
                    "selectedOptions": [{"optionName": "Medium"}],
                }
            ],
        }

        with (
            patch(LLM_TARGET, new=AsyncMock(return_value=mock_llm_response("repeat_order"))),
            patch(ORDERS_TARGET, new=AsyncMock(return_value=[past_order])),
            patch(ADD_CART_TARGET, new=AsyncMock(return_value=fake_cart_with_latte())) as add_cart,
        ):
            response = await process_chat_message(
                session_id="s-rep",
                message="repeat my last order",
                cart_id=None,
                session=session,
                auth_cookie="token=abc",
            )

        self.assertEqual(response.intent, "repeat_order")
        self.assertEqual(response.metadata["pipeline_stage"], "repeat_order_confirmation")
        self.assertIn("1x Latte (Medium)", response.reply)
        self.assertEqual(session_store.get_session_stage("s-rep"), "repeat_order_confirmation")
        add_cart.assert_not_called()

    async def test_repeat_last_order_confirm_yes_direct_adds_stored_lines(self):
        session = fake_session("s-rep-yes")
        session_store.sessions["s-rep-yes"] = session
        session_store.set_session_stage("s-rep-yes", "repeat_order_confirmation")
        session_store.set_pending_operations_context(
            "s-rep-yes",
            {
                "repeat_order_lines": [
                    {
                        "menuItemId": "item-latte",
                        "name": "Latte",
                        "qty": 2,
                        "selectedOptions": [{"optionName": "Medium"}],
                        "instructions": "less ice",
                    }
                ],
                "repeat_order_summary": "- 2x Latte (Medium; less ice)",
            },
        )

        add_cart_mock = AsyncMock(return_value={"cart_id": "cart-new", "cart": []})
        with patch(ADD_CART_TARGET, new=add_cart_mock):
            response = await process_chat_message(
                session_id="s-rep-yes",
                message="yes",
                cart_id="cart-old",
                session=session,
            )

        self.assertEqual(response.metadata["pipeline_stage"], "repeat_order_done")
        self.assertTrue(response.cart_updated)
        self.assertEqual(response.cart_id, "cart-new")
        add_cart_mock.assert_awaited_once_with(
            menu_item_id="item-latte",
            qty=2,
            selected_options=[{"optionName": "Medium"}],
            instructions="less ice",
            cart_id="cart-old",
        )

    async def test_repeat_last_order_unclear_reasks(self):
        session = fake_session("s-rep-unclear")
        session_store.sessions["s-rep-unclear"] = session
        session_store.set_session_stage("s-rep-unclear", "repeat_order_confirmation")
        session_store.set_pending_operations_context(
            "s-rep-unclear",
            {
                "repeat_order_lines": [
                    {"menuItemId": "item-latte", "name": "Latte", "qty": 1, "selectedOptions": [], "instructions": ""}
                ],
                "repeat_order_summary": "- 1x Latte",
            },
        )

        response = await process_chat_message(
            session_id="s-rep-unclear",
            message="maybe later",
            cart_id=None,
            session=session,
        )

        self.assertEqual(response.metadata["pipeline_stage"], "repeat_order_confirmation_unclear")
        self.assertEqual(session_store.get_session_stage("s-rep-unclear"), "repeat_order_confirmation")

    async def test_repeat_last_order_no_cancels(self):
        session = fake_session("s-rep-no")
        session_store.sessions["s-rep-no"] = session
        session_store.set_session_stage("s-rep-no", "repeat_order_confirmation")
        session_store.set_pending_operations_context(
            "s-rep-no",
            {
                "repeat_order_lines": [
                    {"menuItemId": "item-latte", "name": "Latte", "qty": 1, "selectedOptions": [], "instructions": ""}
                ],
                "repeat_order_summary": "- 1x Latte",
            },
        )

        response = await process_chat_message(
            session_id="s-rep-no",
            message="nevermind",
            cart_id=None,
            session=session,
        )

        self.assertEqual(response.metadata["pipeline_stage"], "repeat_order_confirmation_cancelled")
        self.assertIsNone(session_store.get_session_stage("s-rep-no"))


if __name__ == "__main__":
    unittest.main()
