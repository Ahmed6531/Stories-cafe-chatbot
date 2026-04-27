import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.menu_utils import (
    category_matches_query,
    filter_menu_items_by_category_query,
)


def test_category_matches_dynamic_y_ies_plural():
    assert category_matches_query("pastry", "Pastries")
    assert category_matches_query("pastries", "Pastries")


def test_filter_menu_items_by_category_query_uses_live_category_names():
    menu_items = [
        {
            "name": "Cheese Croissant",
            "isAvailable": True,
            "category": {"name": "Pastries"},
        },
        {
            "name": "Green Tea",
            "isAvailable": True,
            "category": {"name": "Tea"},
        },
        {
            "name": "Hidden Roll",
            "isAvailable": False,
            "category": {"name": "Pastries"},
        },
    ]

    matched = filter_menu_items_by_category_query(menu_items, "pastry")

    assert [item["name"] for item in matched] == ["Cheese Croissant"]
