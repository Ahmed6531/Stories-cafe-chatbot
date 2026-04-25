import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.llm_interpreter import _should_use_heuristic_items


def test_add_item_heuristic_does_not_downgrade_valid_quantity():
    parsed_items = [{"item_name": "caramel frap", "quantity": 2}]
    heuristic_items = [{"item_name": "caramel frap", "quantity": 1}]

    assert _should_use_heuristic_items(parsed_items, heuristic_items) is False


def test_add_item_heuristic_still_replaces_different_item_parse():
    parsed_items = [{"item_name": "caramel", "quantity": 1}]
    heuristic_items = [{"item_name": "caramel frap", "quantity": 1}]

    assert _should_use_heuristic_items(parsed_items, heuristic_items) is True
