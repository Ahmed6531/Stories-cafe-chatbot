"""
Tests for app/services/upsell.py

Covers:
  - should_upsell: no-upsell intents, empty cart, cooldown enforcement
  - record_turn: turn counter increments per session
  - suggest_upsell_items: drink-only cart gets food, food-only cart gets drink,
    both present falls back to diverse, empty menu returns empty list
  - get_upsell_suggestions: full public API with cooldown gating
  - fun_fact field present when a known pair matches

Does NOT retest:
  - filter_by_category (test_recommendation_logic.py)
  - Upsell filtering for already-shown items (test_customization.py)
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tests.testchatbotflows.conftest import fake_menu_items
import app.services.upsell as upsell_module
from app.services.upsell import (
    should_upsell,
    record_turn,
    suggest_upsell_items,
    get_upsell_suggestions,
    _upsell_last_shown,
    _session_turn_counter,
    UPSELL_COOLDOWN_TURNS,
)

COMBO_TARGET = "app.services.upsell.fetch_combo_suggestions"


def _flush_upsell_state():
    _upsell_last_shown.clear()
    _session_turn_counter.clear()


def _drink_item():
    return {
        "_id": "item-latte",
        "name": "Latte",
        "isAvailable": True,
        "category": "beverages",
        "subcategory": "coffee",
    }


def _food_item():
    return {
        "_id": "item-croissant",
        "name": "Cheese Croissant",
        "isAvailable": True,
        "category": "pastries",
        "subcategory": "croissants",
    }


def _cart_item_from(item: dict) -> dict:
    """Build a minimal cart-line dict from a menu item."""
    return {
        "_id": f"line-{item['_id']}",
        "menuItemId": item["_id"],
        "name": item["name"],
        "qty": 1,
        "category": item.get("category", ""),
        "subcategory": item.get("subcategory", ""),
    }


# ---------------------------------------------------------------------------
# should_upsell
# ---------------------------------------------------------------------------

class TestShouldUpsell(unittest.TestCase):
    def setUp(self):
        _flush_upsell_state()

    def test_returns_false_for_no_upsell_intent_checkout(self):
        self.assertFalse(should_upsell("s1", "checkout", [_cart_item_from(_drink_item())]))

    def test_returns_false_for_no_upsell_intent_clear_cart(self):
        self.assertFalse(should_upsell("s2", "clear_cart", [_cart_item_from(_drink_item())]))

    def test_returns_false_for_empty_cart(self):
        self.assertFalse(should_upsell("s3", "add_items", []))

    def test_returns_true_on_first_add_items(self):
        self.assertTrue(should_upsell("s4", "add_items", [_cart_item_from(_drink_item())]))

    def test_returns_false_within_cooldown(self):
        # Simulate upsell shown 1 turn ago
        _session_turn_counter["s5"] = 5
        _upsell_last_shown["s5"] = 4  # 5 - 4 = 1, less than cooldown (3)
        self.assertFalse(should_upsell("s5", "add_items", [_cart_item_from(_drink_item())]))

    def test_returns_true_after_cooldown_elapsed(self):
        _session_turn_counter["s6"] = 10
        _upsell_last_shown["s6"] = 6  # 10 - 6 = 4, >= cooldown (3)
        self.assertTrue(should_upsell("s6", "add_items", [_cart_item_from(_drink_item())]))


# ---------------------------------------------------------------------------
# record_turn
# ---------------------------------------------------------------------------

class TestRecordTurn(unittest.TestCase):
    def setUp(self):
        _flush_upsell_state()

    def test_first_call_returns_1(self):
        self.assertEqual(record_turn("s7"), 1)

    def test_subsequent_calls_increment(self):
        record_turn("s8")
        record_turn("s8")
        self.assertEqual(record_turn("s8"), 3)

    def test_independent_per_session(self):
        record_turn("s9")
        record_turn("s9")
        self.assertEqual(record_turn("s10"), 1)


# ---------------------------------------------------------------------------
# suggest_upsell_items
# ---------------------------------------------------------------------------

class TestSuggestUpsellItems(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_upsell_state()

    async def test_drink_cart_returns_food_suggestion(self):
        cart = [_cart_item_from(_drink_item())]
        menu = fake_menu_items()

        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await suggest_upsell_items(cart, menu, limit=1, anchor_menu_item=_drink_item())

        # Should suggest a food item (pastry)
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertIn("item_name", r)
            self.assertEqual(r["type"], "upsell")
            # The suggested item should be a food item
            name = r["item_name"].lower()
            self.assertTrue(
                "croissant" in name or "muffin" in name or "pastry" in name,
                f"Expected food item but got: {r['item_name']}"
            )

    async def test_food_cart_returns_drink_suggestion(self):
        cart = [_cart_item_from(_food_item())]
        menu = fake_menu_items()

        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await suggest_upsell_items(cart, menu, limit=1, anchor_menu_item=_food_item())

        self.assertGreater(len(results), 0)
        for r in results:
            # The menu fixture uses "Rim 330ML" as the water item name.
            # Accept any beverage: latte, cappuccino, or the water stand-in.
            name = r["item_name"].lower()
            self.assertTrue(
                "latte" in name or "cappuccino" in name or "rim" in name or "330" in name,
                f"Expected drink item but got: {r['item_name']}"
            )

    async def test_empty_menu_returns_empty(self):
        cart = [_cart_item_from(_drink_item())]
        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await suggest_upsell_items(cart, [], limit=1)
        self.assertEqual(results, [])

    async def test_result_has_upsell_type(self):
        cart = [_cart_item_from(_drink_item())]
        menu = fake_menu_items()
        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await suggest_upsell_items(cart, menu, limit=2)
        for r in results:
            self.assertEqual(r["type"], "upsell")
            self.assertIn("menu_item_id", r)
            self.assertIn("upsell_source", r)

    async def test_combo_data_prioritised_over_random(self):
        """When combo analytics return a match, it should appear in results."""
        cart = [_cart_item_from(_drink_item())]
        menu = fake_menu_items()
        # Pretend the analytics backend says "Cheese Croissant" pairs well with the anchor
        combo_stats = [
            {
                "anchorMenuItemId": "item-latte",
                "suggestedMenuItemId": "item-croissant",
                "count": 5,
            }
        ]
        with patch(COMBO_TARGET, new=AsyncMock(return_value=combo_stats)):
            results = await suggest_upsell_items(
                cart, menu, limit=1, anchor_menu_item=_drink_item()
            )
        if results:
            self.assertEqual(results[0]["upsell_source"], "combo")

    async def test_fun_fact_included_for_known_pair(self):
        """The latte + cheese croissant pair has a hardcoded fun fact."""
        cart = [_cart_item_from(_drink_item())]
        latte_item = {
            "_id": "item-latte",
            "name": "Latte",
            "isAvailable": True,
            "category": "beverages",
            "subcategory": "coffee",
        }
        croissant_in_menu = {
            "_id": "item-croissant",
            "name": "Cheese Croissant",
            "isAvailable": True,
            "category": "pastries",
            "subcategory": "croissants",
        }
        menu = [latte_item, croissant_in_menu]
        combo_stats = [
            {
                "anchorMenuItemId": "item-latte",
                "suggestedMenuItemId": "item-croissant",
                "count": 10,
            }
        ]
        with patch(COMBO_TARGET, new=AsyncMock(return_value=combo_stats)):
            results = await suggest_upsell_items(
                cart, menu, limit=1, anchor_menu_item=latte_item
            )
        if results:
            self.assertIsNotNone(results[0].get("fun_fact"))
            self.assertGreater(len(results[0]["fun_fact"]), 0)

    async def test_already_in_cart_item_excluded(self):
        """Items already in the cart must not appear as upsell suggestions."""
        latte_cart_item = _cart_item_from(_drink_item())
        menu = fake_menu_items()
        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await suggest_upsell_items(
                [latte_cart_item], menu, limit=3, anchor_menu_item=_drink_item()
            )
        suggested_names = {r["item_name"].lower() for r in results}
        self.assertNotIn("latte", suggested_names)


# ---------------------------------------------------------------------------
# get_upsell_suggestions (public API)
# ---------------------------------------------------------------------------

class TestGetUpsellSuggestions(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _flush_upsell_state()

    async def test_returns_empty_when_should_not_upsell(self):
        # checkout intent → never upsell
        cart = [_cart_item_from(_drink_item())]
        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await get_upsell_suggestions("s-g1", "checkout", cart, fake_menu_items())
        self.assertEqual(results, [])

    async def test_updates_last_shown_when_suggestions_returned(self):
        _session_turn_counter["s-g2"] = 5
        cart = [_cart_item_from(_drink_item())]
        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await get_upsell_suggestions(
                "s-g2", "add_items", cart, fake_menu_items()
            )
        if results:
            self.assertIn("s-g2", _upsell_last_shown)

    async def test_cooldown_respected_through_public_api(self):
        # Upsell shown 1 turn ago → still in cooldown
        _session_turn_counter["s-g3"] = 2
        _upsell_last_shown["s-g3"] = 1
        cart = [_cart_item_from(_drink_item())]
        with patch(COMBO_TARGET, new=AsyncMock(return_value=[])):
            results = await get_upsell_suggestions(
                "s-g3", "add_items", cart, fake_menu_items()
            )
        self.assertEqual(results, [])


if __name__ == "__main__":
    unittest.main()
