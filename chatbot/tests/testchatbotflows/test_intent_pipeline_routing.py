import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services.intent_pipeline import resolve_intent


class TestIntentPipelineRouting(unittest.IsolatedAsyncioTestCase):
    async def test_availability_plus_add_uses_llm_multi_operation_path(self):
        llm_result = {
            "operations": [
                {
                    "intent": "describe_item",
                    "items": [{"item_query": "chocolate croissant"}],
                    "needs_clarification": False,
                    "reason": "availability check",
                },
                {
                    "intent": "add_items",
                    "items": [{
                        "item_query": "latte",
                        "quantity": 1,
                        "modifiers": [],
                        "notes": [],
                        "follow_up_ref": None,
                        "use_defaults": False,
                    }],
                    "needs_clarification": False,
                    "reason": "add item",
                },
            ],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "multi-operation request",
        }

        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ) as interpret, patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ):
            resolved = await resolve_intent(
                "do you have chocolate croissant and can i add a latte",
                {"session_id": "s-routing"},
                {},
                [],
            )

        self.assertTrue(interpret.called)
        self.assertEqual(resolved["source"], "llm")
        self.assertEqual(
            [op["intent"] for op in resolved["operations"]],
            ["describe_item", "add_items"],
        )

    async def test_llm_list_category_for_specific_item_is_repaired_to_describe(self):
        llm_result = {
            "operations": [
                {
                    "intent": "list_category_items",
                    "items": [{"item_query": "chocolate croissant"}],
                    "needs_clarification": False,
                    "reason": "availability check",
                },
                {
                    "intent": "add_items",
                    "items": [{
                        "item_query": "latte",
                        "quantity": 1,
                        "modifiers": [],
                        "notes": [],
                        "follow_up_ref": None,
                        "use_defaults": False,
                    }],
                    "needs_clarification": False,
                    "reason": "add item",
                },
            ],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "multi-operation request",
        }
        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ), patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ):
            resolved = await resolve_intent(
                "do you have chocolate croissant and i wanna add a latte",
                {"session_id": "s-routing"},
                {},
                [],
            )

        self.assertEqual(
            [op["intent"] for op in resolved["operations"]],
            ["describe_item", "add_items"],
        )

    async def test_simple_availability_uses_llm_then_validates(self):
        llm_result = {
            "operations": [
                {
                    "intent": "describe_item",
                    "items": [{"item_query": "chocolate croissant"}],
                    "needs_clarification": False,
                    "reason": "availability check",
                },
            ],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "single item availability",
        }
        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ) as interpret, patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ):
            resolved = await resolve_intent(
                "do you have chocolate croissant",
                {"session_id": "s-routing"},
                {},
                [],
            )

        self.assertTrue(interpret.called)
        self.assertEqual(resolved["source"], "llm")
        self.assertEqual(resolved["intent"], "describe_item")
        self.assertEqual(resolved["items"][0]["item_query"], "chocolate croissant")

    async def test_llm_describe_category_is_repaired_to_list_category(self):
        llm_result = {
            "operations": [
                {
                    "intent": "describe_item",
                    "items": [{"item_query": "coffee"}],
                    "needs_clarification": False,
                    "reason": "category availability",
                },
            ],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "category request",
        }
        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ), patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ):
            resolved = await resolve_intent(
                "what coffee do you have",
                {"session_id": "s-routing"},
                {},
                [],
            )

        self.assertEqual(resolved["intent"], "list_category_items")

    async def test_legacy_single_op_shape_is_repaired_too(self):
        llm_result = {
            "intent": "list_category_items",
            "items": [{"item_query": "chocolate croissant"}],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "availability check",
        }
        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ), patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ):
            resolved = await resolve_intent(
                "do you have chocolate croissant",
                {"session_id": "s-routing"},
                {},
                [],
            )

        self.assertEqual(resolved["intent"], "describe_item")

    async def test_availability_typo_misclassified_as_category_routes_to_describe(self):
        llm_result = {
            "operations": [
                {
                    "intent": "list_category_items",
                    "items": [{"item_query": "choco croisant"}],
                    "needs_clarification": False,
                    "reason": "availability check",
                },
                {
                    "intent": "add_items",
                    "items": [{"item_query": "latte", "quantity": 1}],
                    "needs_clarification": False,
                    "reason": "add item",
                },
            ],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "multi-operation request",
        }
        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ), patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ):
            resolved = await resolve_intent(
                "do you have choco croisant and add latte",
                {"session_id": "s-routing"},
                {},
                [],
            )

        self.assertEqual(
            [op["intent"] for op in resolved["operations"]],
            ["describe_item", "add_items"],
        )

    async def test_guided_modifier_only_add_is_repaired_to_guided_response(self):
        llm_result = {
            "operations": [
                {
                    "intent": "add_items",
                    "items": [{"item_query": "medium"}],
                    "needs_clarification": False,
                    "reason": "size answer",
                },
            ],
            "confidence": 0.9,
            "needs_clarification": False,
            "reason": "guided answer",
        }
        menu_signal = SimpleNamespace(
            category_names=frozenset({"pastries", "coffee"}),
            item_names=frozenset({"chocolate croissant", "latte"}),
            option_names=frozenset({"small", "medium", "large"}),
        )

        with patch(
            "app.services.intent_pipeline.try_interpret_message",
            new=AsyncMock(return_value=llm_result),
        ), patch(
            "app.services.menu_signal.get_menu_signal",
            new=AsyncMock(return_value=menu_signal),
        ), patch(
            "app.services.intent_pipeline.get_session_stage",
            return_value="guided_ordering",
        ):
            resolved = await resolve_intent(
                "medium",
                {"session_id": "s-routing", "stage": "guided_ordering"},
                {},
                [],
            )

        self.assertEqual(resolved["intent"], "guided_order_response")


if __name__ == "__main__":
    unittest.main()
