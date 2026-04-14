import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.suggestions import (  # noqa: E402
    extract_recommendation_query_terms,
    filter_by_category,
)
from app.services.tools import find_menu_item_by_name  # noqa: E402
from app.utils.normalize import normalize_user_message  # noqa: E402


class RecommendationLogicTests(unittest.TestCase):
    def test_plural_token_does_not_duplicate_singular(self) -> None:
        terms = extract_recommendation_query_terms("can u suggest burgers")
        self.assertEqual(terms, ["burger"])

    def test_ice_cream_alias_does_not_include_raw_phrase_words(self) -> None:
        terms = extract_recommendation_query_terms("can u suggest ice cream")
        self.assertIn("frozen yogurt", terms)
        self.assertIn("yogurt", terms)
        self.assertNotIn("ice", terms)
        self.assertNotIn("cream", terms)

    def test_food_category_filter_matches_sandwich_and_salad(self) -> None:
        suggestions = [
            {"item_name": "Chicken Sandwich"},
            {"item_name": "Caesar Salad"},
            {"item_name": "Iced Latte"},
        ]
        menu_items_by_name = {
            "chicken sandwich": {"category": "Sandwiches", "subcategory": "Food"},
            "caesar salad": {"category": "Salads", "subcategory": "Food"},
            "iced latte": {"category": "Beverages", "subcategory": "Coffee"},
        }

        filtered = filter_by_category(
            suggestions=suggestions,
            category_filter="food",
            menu_items_by_name=menu_items_by_name,
            query_terms=["sandwich"],
        )

        self.assertEqual([item["item_name"] for item in filtered], ["Chicken Sandwich"])

    def test_normalizer_does_not_replace_matcha_with_mocha(self) -> None:
        normalized = normalize_user_message("add iced matcha")
        self.assertIn("matcha", normalized)
        self.assertNotIn("mocha", normalized)

    def test_normalizer_corrects_clear_cart_typos(self) -> None:
        normalized = normalize_user_message("cler cart")
        self.assertEqual(normalized, "clear cart")

    def test_normalizer_corrects_nevermind_typo(self) -> None:
        normalized = normalize_user_message("neverminf")
        self.assertEqual(normalized, "nevermind")

    def test_normalizer_corrects_croissant_typo(self) -> None:
        normalized = normalize_user_message("criossant")
        self.assertEqual(normalized, "croissant")


class RecommendationReplyTests(unittest.IsolatedAsyncioTestCase):
    async def test_term_fallback_uses_broader_picks_without_related_word(self) -> None:
        genai_stub = types.ModuleType("google.generativeai")
        google_stub = types.ModuleType("google")
        google_stub.generativeai = genai_stub

        with patch.dict(sys.modules, {"google": google_stub, "google.generativeai": genai_stub}):
            from app.services.orchestrator import process_chat_message

        interpreted = {
            "intent": "recommendation_query",
            "confidence": 0.95,
            "items": [],
            "follow_up_ref": None,
            "needs_clarification": False,
            "reason": "",
            "source": "llm",
            "route_to_fallback": False,
            "fallback_needed": False,
        }

        featured_items = [
            {
                "id": 101,
                "name": "Chocolate Muffin",
                "category": "Food",
                "subcategory": "Bakery",
            }
        ]

        menu_items = [
            {
                "id": 101,
                "name": "Chocolate Muffin",
                "category": "Food",
                "subcategory": "Bakery",
            },
            {
                "id": 102,
                "name": "Iced Latte",
                "category": "Beverages",
                "subcategory": "Coffee",
            },
        ]

        with patch("app.services.orchestrator.resolve_intent", new=AsyncMock(return_value=interpreted)), \
             patch("app.services.tools.fetch_featured_items", new=AsyncMock(return_value=featured_items)), \
             patch("app.services.tools.get_cart", new=AsyncMock(return_value={"cart": [], "cart_id": "cart-1"})), \
             patch("app.services.tools.fetch_menu_items", new=AsyncMock(return_value=menu_items)), \
             patch(
                 "app.services.suggestions.suggest_popular_items",
                 return_value=[{"type": "popular", "item_name": "Chocolate Muffin", "menu_item_id": 101}],
             ), \
             patch("app.services.suggestions.suggest_complementary_items", return_value=[]), \
             patch("app.services.upsell.get_upsell_suggestions", new=AsyncMock(return_value=[])), \
             patch("app.services.upsell.record_turn", return_value=None):
            response = await process_chat_message(
                session_id="rec-fallback-1",
                message="can u suggest burger",
                cart_id=None,
                session={
                    "session_id": "rec-fallback-1",
                    "cart_id": None,
                    "last_items": [],
                    "last_intent": None,
                    "stage": None,
                    "checkout_initiated": False,
                    "pending_clarification": None,
                    "history": [],
                    "guided_order_item_id": None,
                    "guided_order_item_name": None,
                    "guided_order_phase": 1,
                    "guided_order_step": 0,
                    "guided_order_groups": [],
                    "guided_order_required_groups": [],
                    "guided_order_optional_groups": [],
                    "guided_order_selections": {},
                    "guided_order_quantity": None,
                    "last_user_message": None,
                    "last_bot_response": None,
                    "last_matched_items": None,
                    "last_action_type": None,
                    "last_action_data": None,
                },
            )

        self.assertEqual(response.status, "ok")
        self.assertTrue(response.suggestions)
        self.assertIn("I couldn't find exact matches for burger", response.reply)
        self.assertIn("but here are items you might like", response.reply)
        self.assertNotIn("related items", response.reply)


class FuzzyLookupSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_does_not_map_iced_matcha_to_iced_mocha(self) -> None:
        menu_items = [
            {"id": 1, "name": "Iced Mocha", "isAvailable": True},
            {"id": 2, "name": "Iced Latte", "isAvailable": True},
        ]

        result = await find_menu_item_by_name(menu_items, "iced matcha")
        self.assertIsNone(result)

    async def test_still_maps_true_typo_cinammon_roll(self) -> None:
        menu_items = [
            {"id": 3, "name": "Cinnamon Roll", "isAvailable": True},
            {"id": 4, "name": "Chocolate Muffin", "isAvailable": True},
        ]

        result = await find_menu_item_by_name(menu_items, "cinammon roll")
        self.assertIsNotNone(result)
        self.assertEqual((result or {}).get("name"), "Cinnamon Roll")


if __name__ == "__main__":
    unittest.main()
