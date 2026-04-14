import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.item_clarification import (  # noqa: E402
    apply_customization_response,
    apply_smart_defaults,
    collect_missing_variant_groups,
)


class VariantLogicTests(unittest.TestCase):
    def test_collect_missing_skips_single_option_group(self) -> None:
        requested_item = {
            "item_name": "tea",
            "quantity": 1,
            "size": None,
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "",
        }
        menu_detail = {
            "name": "Tea",
            "variants": [
                {
                    "name": "Tea Type",
                    "isRequired": True,
                    "options": [{"name": "Green Tea", "isActive": True}],
                },
                {
                    "name": "Sugar",
                    "isRequired": True,
                    "options": [
                        {"name": "No Sugar", "isActive": True},
                        {"name": "1 tsp", "isActive": True},
                    ],
                },
            ],
        }

        missing = collect_missing_variant_groups(requested_item, menu_detail)
        labels = [str(group.get("name", "")) for group in missing]

        self.assertNotIn("Tea Type", labels)
        self.assertIn("Sugar", labels)

    def test_collect_missing_ignores_answered_size_group(self) -> None:
        requested_item = {
            "item_name": "latte",
            "quantity": 1,
            "size": "Medium",
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "",
        }
        menu_detail = {
            "name": "Latte",
            "variants": [
                {
                    "name": "Choose Size",
                    "isRequired": True,
                    "options": [
                        {"name": "Small", "isActive": True},
                        {"name": "Medium", "isActive": True},
                    ],
                },
                {
                    "name": "Milk",
                    "isRequired": True,
                    "options": [
                        {"name": "Whole Milk", "isActive": True},
                        {"name": "Almond Milk", "isActive": True},
                    ],
                },
            ],
        }

        missing = collect_missing_variant_groups(requested_item, menu_detail)
        labels = [str(group.get("name", "")) for group in missing]

        self.assertNotIn("Choose Size", labels)
        self.assertIn("Milk", labels)

    def test_apply_customization_response_maps_size_and_addon(self) -> None:
        requested_item = {
            "item_name": "latte",
            "quantity": 1,
            "size": None,
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "",
        }
        menu_detail = {
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
                    "name": "Add-ons",
                    "options": [
                        {"name": "Vanilla", "isActive": True},
                        {"name": "Caramel", "isActive": True},
                    ],
                },
            ],
        }

        updated = apply_customization_response(
            requested_item=requested_item,
            message="medium with vanilla",
            menu_detail=menu_detail,
        )

        self.assertEqual(updated["size"], "Medium")
        self.assertIn("Vanilla", updated["addons"])

    def test_apply_smart_defaults_sets_medium_and_milk(self) -> None:
        requested_item = {
            "item_name": "cappuccino",
            "quantity": 1,
            "size": None,
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "",
        }
        menu_detail = {
            "name": "Cappuccino",
            "category": "Beverages",
            "variants": [
                {
                    "name": "Size",
                    "isRequired": True,
                    "options": [
                        {"name": "Small", "isActive": True},
                        {"name": "Medium", "isActive": True},
                        {"name": "Large", "isActive": True},
                    ],
                },
                {
                    "name": "Milk",
                    "isRequired": True,
                    "options": [
                        {"name": "Regular Milk", "isActive": True},
                        {"name": "Oat Milk", "isActive": True},
                    ],
                },
            ],
        }

        updated, applied_labels, still_required = apply_smart_defaults(requested_item, menu_detail)

        self.assertEqual(updated["size"], "Medium")
        self.assertEqual(updated["options"].get("milk"), "Regular Milk")
        self.assertIn("Medium", applied_labels)
        self.assertIn("Regular Milk", applied_labels)
        self.assertEqual(still_required, [])


if __name__ == "__main__":
    unittest.main()
