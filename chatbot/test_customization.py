import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.llm_interpreter import _should_use_heuristic_items
from app.services.orchestrator import (
    map_requested_item_to_selected_options,
    process_chat_message,
)


def build_drink_menu_detail() -> dict:
    return {
        "id": 8,
        "name": "Latte",
        "variants": [
            {
                "name": "Choose Size",
                "options": [
                    {"name": "Small", "isActive": True},
                    {"name": "Medium", "isActive": True},
                ],
            },
            {
                "name": "Milk",
                "options": [
                    {"name": "Full Fat", "isActive": False},
                    {"name": "Almond Milk Small", "isActive": False},
                    {"name": "Almond Milk Medium", "isActive": False},
                ],
            },
            {
                "name": "Add-ons",
                "options": [
                    {"name": "Vanilla", "isActive": False},
                    {"name": "Add Shot", "isActive": True},
                ],
            },
        ],
    }


class CustomizationMappingTests(unittest.TestCase):
    def test_rich_structured_parse_is_not_overwritten_by_weaker_heuristic(self) -> None:
        parsed_items = [
            {
                "item_name": "latte",
                "quantity": 1,
                "size": "medium",
                "options": {"milk": "almond milk", "sugar": None},
                "addons": [],
                "instructions": "",
            }
        ]
        heuristic_items = [
            {
                "item_name": "latte medium with almond milk",
                "quantity": 1,
                "size": None,
                "options": {"milk": None, "sugar": None},
                "addons": [],
                "instructions": "",
            }
        ]

        self.assertFalse(_should_use_heuristic_items(parsed_items, heuristic_items))

    def test_maps_size_and_milk_to_backend_selected_options(self) -> None:
        requested_item = {
            "item_name": "latte",
            "quantity": 1,
            "size": "medium",
            "options": {"milk": "almond milk", "sugar": None},
            "addons": [],
            "instructions": "",
        }

        selected_options, instructions = map_requested_item_to_selected_options(
            requested_item,
            build_drink_menu_detail(),
        )

        self.assertEqual(
            selected_options,
            [
                {"optionName": "Medium"},
                {"optionName": "Almond Milk Medium"},
            ],
        )
        self.assertEqual(instructions, "")

    def test_preserves_unmapped_sugar_preference_in_instructions(self) -> None:
        requested_item = {
            "item_name": "cappuccino",
            "quantity": 2,
            "size": "medium",
            "options": {"milk": None, "sugar": "no sugar"},
            "addons": [],
            "instructions": "",
        }

        selected_options, instructions = map_requested_item_to_selected_options(
            requested_item,
            build_drink_menu_detail(),
        )

        self.assertEqual(selected_options, [{"optionName": "Medium"}])
        self.assertIn("no sugar", instructions)


class AddFlowCustomizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_add_flow_keeps_unmapped_modifier_and_still_adds_item(self) -> None:
        interpreted = {
            "intent": "add_items",
            "items": [
                {
                    "item_name": "latte",
                    "quantity": 1,
                    "size": "medium",
                    "options": {"milk": "oat milk", "sugar": None},
                    "addons": [],
                    "instructions": "",
                }
            ],
            "confidence": 0.95,
            "fallback_needed": False,
        }
        matched_item = {"id": 8, "name": "Latte", "category": "Coffee"}
        add_result = {
            "cart_id": "cart123",
            "cart": [{"name": "Latte", "qty": 1}],
        }

        with patch("app.services.orchestrator.try_interpret_message", return_value=interpreted), \
             patch("app.services.tools.fetch_menu_items", new=AsyncMock(return_value=[matched_item])), \
             patch("app.services.tools.find_menu_item_by_name", new=AsyncMock(return_value=matched_item)), \
             patch("app.services.tools.fetch_menu_item_detail", new=AsyncMock(return_value=build_drink_menu_detail())), \
             patch("app.services.tools.add_item_to_cart", new=AsyncMock(return_value=add_result)) as add_to_cart_mock, \
             patch("app.services.tools.fetch_featured_items", new=AsyncMock(return_value=[])), \
             patch("app.services.suggestions.suggest_popular_items", return_value=[]), \
             patch("app.services.suggestions.suggest_complementary_items", return_value=[]):
            response = await process_chat_message(
                session_id="session-1",
                message="add latte medium with oat milk",
                cart_id=None,
                session={"session_id": "session-1", "cart_id": None, "last_items": [], "last_intent": None, "stage": None, "checkout_initiated": False},
            )

        self.assertEqual(response.status, "ok")
        self.assertTrue(response.cart_updated)
        add_to_cart_mock.assert_awaited_once()

        call_kwargs = add_to_cart_mock.await_args.kwargs
        self.assertEqual(call_kwargs["selected_options"], [{"optionName": "Medium"}])
        self.assertIn("oat milk", call_kwargs["instructions"])


if __name__ == "__main__":
    unittest.main()
