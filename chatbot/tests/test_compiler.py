import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.actions import ParsedItemRequest, ParsedOperation
from app.services.compiler import (
    CompileFailure,
    CompileNeedsClarification,
    CompileSuccess,
    compile_operation,
)
from app.services.compiler_test_helpers import fake_menu_item, fake_variant_group


def _latte_with_size_and_milk() -> list[dict]:
    return [
        fake_menu_item(
            8,
            "Latte",
            variant_groups=[
                fake_variant_group("size", "Size", [("Small", None), ("Medium", None), ("Large", None)]),
                fake_variant_group("milk", "Milk Type", [("Full Fat", None), ("Oat Milk", None)]),
            ],
        )
    ]


@pytest.mark.asyncio
async def test_plain_add_compiles_to_line():
    results = await compile_operation(
        ParsedOperation(intent="add_items", items=[ParsedItemRequest(item_query="latte", quantity=1)]),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    assert len(results) == 1
    result = results[0]
    assert isinstance(result, CompileSuccess)
    assert result.operation.lines[0].menu_item_id == 8
    assert result.operation.lines[0].selected_options == []


@pytest.mark.asyncio
async def test_add_with_resolved_modifiers_compiles_options():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="latte", quantity=1, modifiers=["medium", "oat milk"])],
        ),
        {"last_items": []},
        menu_items=_latte_with_size_and_milk(),
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    line = result.operation.lines[0]
    assert [(option.option_name, option.group_id) for option in line.selected_options] == [
        ("Medium", "size"),
        ("Oat Milk", "milk"),
    ]


@pytest.mark.asyncio
async def test_add_with_unmatched_modifier_preserves_line_and_fragment():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="latte", quantity=1, modifiers=["caramel"])],
        ),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    line = result.operation.lines[0]
    assert line.unmatched_modifiers == ["caramel"]
    assert line.instructions == ""


@pytest.mark.asyncio
async def test_add_with_negation_note_becomes_instruction_not_unmatched():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="latte", quantity=1, notes=["no whip"])],
        ),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    line = result.operation.lines[0]
    assert line.instructions == "no whip"
    assert "no whip" not in line.unmatched_modifiers


@pytest.mark.asyncio
async def test_add_with_negation_modifier_becomes_instruction_not_unmatched():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="latte", quantity=1, modifiers=["without whip"])],
        ),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    line = result.operation.lines[0]
    assert line.instructions == "without whip"
    assert "without whip" not in line.unmatched_modifiers


@pytest.mark.asyncio
async def test_follow_up_reference_uses_session_history():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="", quantity=2, follow_up_ref="that one")],
        ),
        {"last_items": [{"item_name": "latte", "menu_item_id": 8}]},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    assert result.operation.lines[0].menu_item_id == 8
    assert result.operation.lines[0].qty == 2


@pytest.mark.asyncio
async def test_follow_up_reference_without_session_needs_clarification():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="", quantity=2, follow_up_ref="that one")],
        ),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileNeedsClarification)
    assert result.reason == "follow_up_unresolvable"


@pytest.mark.asyncio
async def test_item_not_found_returns_failure():
    results = await compile_operation(
        ParsedOperation(intent="add_items", items=[ParsedItemRequest(item_query="zebra juice", quantity=1)]),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileFailure)
    assert result.reason == "item_not_found"


@pytest.mark.asyncio
async def test_clear_cart_returns_empty_success():
    results = await compile_operation(
        ParsedOperation(intent="clear_cart"),
        {"last_items": []},
        menu_items=[fake_menu_item(8, "Latte")],
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    assert result.operation.lines == []


@pytest.mark.asyncio
async def test_remove_item_uses_cart_key_shape_from_tools_result():
    results = await compile_operation(
        ParsedOperation(intent="remove_item", items=[ParsedItemRequest(item_query="flat white")]),
        {"last_items": []},
        cart={
            "cart_id": "cart-1",
            "cart": [
                {
                    "_id": "line-flat-white",
                    "menuItemId": 22,
                    "name": "Flat White",
                    "qty": 1,
                    "isAvailable": False,
                }
            ],
        },
        menu_items=[fake_menu_item(22, "Flat White")],
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    assert result.operation.cart_line_id == "line-flat-white"
    assert result.operation.lines[0].menu_item_id == 22


@pytest.mark.asyncio
async def test_wire_format_parity():
    results = await compile_operation(
        ParsedOperation(
            intent="add_items",
            items=[ParsedItemRequest(item_query="latte", quantity=1, modifiers=["medium", "oat milk"])],
        ),
        {"last_items": []},
        menu_items=_latte_with_size_and_milk(),
    )
    result = results[0]
    assert isinstance(result, CompileSuccess)
    assert result.operation.lines[0].to_wire_payload() == {
        "menuItemId": 8,
        "qty": 1,
        "selectedOptions": [
            {"optionName": "Medium", "suboptionName": None, "groupId": "size"},
            {"optionName": "Oat Milk", "suboptionName": None, "groupId": "milk"},
        ],
        "instructions": "",
    }
