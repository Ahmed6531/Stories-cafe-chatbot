import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))


class IntentTypoTests(unittest.TestCase):
    def setUp(self) -> None:
        genai_stub = types.ModuleType("google.generativeai")
        google_stub = types.ModuleType("google")
        google_stub.generativeai = genai_stub
        self._module_patch = patch.dict(sys.modules, {"google": google_stub, "google.generativeai": genai_stub})
        self._module_patch.start()

    def tearDown(self) -> None:
        self._module_patch.stop()

    def test_lear_cart_normalizes_to_clear_cart(self) -> None:
        """'lear cart' is a typo — normalize_user_message must fix it to 'clear cart',
        which _layer2_deterministic then routes to clear_cart."""
        from app.utils.normalize import normalize_user_message  # noqa: E402
        self.assertEqual(normalize_user_message("lear cart"), "clear cart")

    def test_clera_my_cart_normalizes_correctly(self) -> None:
        """'clera my cart' is a typo — normalizer should return a clear-cart phrase."""
        from app.utils.normalize import normalize_user_message  # noqa: E402
        result = normalize_user_message("clera my cart")
        self.assertIn("clear", result)
        self.assertIn("cart", result)


    def test_filler_stripping_preserves_real_intent_words(self) -> None:
        from app.utils.normalize import normalize_user_message  # noqa: E402

        self.assertEqual(
            normalize_user_message("you know what just add a latte"),
            "just add a latte",
        )
        self.assertEqual(
            normalize_user_message("um uh actually um so like can i get a latte please you know"),
            "can i get a latte please",
        )


class IntentCategoryRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        genai_stub = types.ModuleType("google.generativeai")
        google_stub = types.ModuleType("google")
        google_stub.generativeai = genai_stub
        self._module_patch = patch.dict(sys.modules, {"google": google_stub, "google.generativeai": genai_stub})
        self._module_patch.start()

    def tearDown(self) -> None:
        self._module_patch.stop()

    async def test_routes_category_queries_without_llm(self) -> None:
        from unittest.mock import AsyncMock

        from app.services.intent_pipeline import resolve_intent  # noqa: E402
        from app.utils.normalize import normalize_user_message  # noqa: E402

        menu_items = [
            {"name": "Chocolate Croissant", "category": {"name": "Pastries"}},
            {"name": "Latte", "category": {"name": "Coffee"}},
            {"name": "Mint Tea", "category": {"name": "Tea"}},
        ]

        with patch("app.services.tools.fetch_menu_items", new=AsyncMock(return_value=menu_items)), \
             patch("app.services.intent_pipeline.try_interpret_message", new=AsyncMock(side_effect=AssertionError("LLM should not be called"))):
            resolved = await resolve_intent(
                normalize_user_message("actually wait what pastries do you have"),
                session={"session_id": "sess-1", "stage": None},
                cart={},
                menu=[],
            )

        self.assertEqual(resolved["intent"], "list_category_items")
        self.assertEqual(resolved["items"], [{"category": "pastries"}])
        self.assertEqual(resolved["source"], "deterministic")

    async def test_add_item_query_does_not_get_reclassified_as_category(self) -> None:
        from unittest.mock import AsyncMock

        from app.services.intent_pipeline import resolve_intent  # noqa: E402
        from app.utils.normalize import normalize_user_message  # noqa: E402

        menu_items = [
            {"name": "Latte", "category": {"name": "Coffee"}},
        ]
        llm_result = {
            "intent": "add_items",
            "items": [{"item_name": "coffee", "quantity": 1}],
            "follow_up_ref": None,
            "needs_clarification": False,
            "reason": "llm_add",
            "confidence": 0.95,
            "fallback_needed": False,
            "operations": [{"intent": "add_items", "items": [{"item_name": "coffee", "quantity": 1}]}],
        }

        with patch("app.services.tools.fetch_menu_items", new=AsyncMock(return_value=menu_items)), \
             patch("app.services.intent_pipeline.try_interpret_message", new=AsyncMock(return_value=llm_result)):
            resolved = await resolve_intent(
                normalize_user_message("add a coffee"),
                session={"session_id": "sess-2", "stage": None},
                cart={},
                menu=[],
            )

        self.assertEqual(resolved["intent"], "add_items")


if __name__ == "__main__":
    unittest.main()
