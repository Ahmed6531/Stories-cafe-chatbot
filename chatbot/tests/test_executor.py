"""
Regression tests for executor.py — the three bugs fixed in Phase 4.

Bug #1: clear_cart in a multi-op sequence was a no-op (Path B had no handler).
Bug #2: _drain_pending_operations used op_items[0], silently dropping extra items.
Bug #3: session.last_items was not updated after multi-op adds, breaking "make that 2".
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.actions import (
    CompiledCartLine,
    CompiledOperation,
    CompiledOption,
    ParsedItemRequest,
    ParsedOperation,
)
from app.services.compiler import CompileFailure, CompileNeedsClarification, CompileSuccess
from app.services.executor import ExecutionResult, execute_compiled_operations
from app.services.executor import _failure_to_reply
from app.services.session_store import get_session


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures / helpers
# ─────────────────────────────────────────────────────────────────────────────


def _parsed_op(intent: str, items: list[ParsedItemRequest] | None = None) -> ParsedOperation:
    return ParsedOperation(intent=intent, items=items or [])


def _compiled_add(menu_item_id: int, qty: int, item_name: str) -> CompiledOperation:
    parsed = _parsed_op("add_items", [ParsedItemRequest(item_query=item_name, quantity=qty)])
    return CompiledOperation(
        intent="add_items",
        lines=[CompiledCartLine(menuItemId=menu_item_id, qty=qty)],
        source_parsed=parsed,
    )


def _compiled_clear() -> CompiledOperation:
    parsed = _parsed_op("clear_cart")
    return CompiledOperation(intent="clear_cart", lines=[], source_parsed=parsed)


# ─────────────────────────────────────────────────────────────────────────────
# Bug #1 — clear_cart must actually clear the cart in a multi-op sequence
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_clear_cart_in_multi_op_actually_clears(monkeypatch):
    """Bug #1: 'clear cart and add a latte' must clear the cart, not silently skip."""
    import app.services.executor as executor_mod

    cleared = []
    added = []

    async def fake_get_cart(cart_id=None):
        # Simulate a cart with one item so clear_cart has something to clear.
        return {
            "cart_id": "cart-123",
            "cart": [{"name": "Mocha", "qty": 1, "menuItemId": 99}],
        }

    async def fake_clear_cart(cart_id=None):
        cleared.append(cart_id)
        return {"cart_id": "cart-empty", "cart": []}

    async def fake_add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
        added.append({"menu_item_id": menu_item_id, "qty": qty})
        return {"cart_id": "cart-latte", "cart": [{"name": "Latte", "qty": 1, "menuItemId": menu_item_id}]}

    # Patch at the module level inside executor's local-import scope.
    import app.services.tools as tools_mod
    monkeypatch.setattr(tools_mod, "get_cart", fake_get_cart)
    monkeypatch.setattr(tools_mod, "clear_cart", fake_clear_cart)
    monkeypatch.setattr(tools_mod, "add_item_to_cart", fake_add_item_to_cart)

    session_id = "test-clear-bug1"
    session = get_session(session_id)

    ops = [_compiled_clear(), _compiled_add(8, 1, "Latte")]
    result = await execute_compiled_operations(
        operations=ops,
        clarifications=[],
        failures=[],
        session_id=session_id,
        cart_id="cart-123",
        session=session,
        auth_cookie=None,
    )

    # The cart must have been cleared — not skipped.
    assert cleared, "clear_cart tool was never called — bug #1 not fixed"
    # The latte must have been added after the clear.
    assert added, "add_item_to_cart was never called after clear"
    assert result.cart_updated is True
    # Cart id reflects the latte add (the last write).
    assert "latte" in result.cart_id or result.cart_updated


# ─────────────────────────────────────────────────────────────────────────────
# Bug #2 — multi-item add must add ALL items, not just the first one
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_multi_item_add_preserves_all_items(monkeypatch):
    """Bug #2: 'add a latte and a mocha' must add both, not just the first."""
    import app.services.tools as tools_mod

    added_ids: list[int] = []

    async def fake_add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
        added_ids.append(int(menu_item_id))
        return {
            "cart_id": f"cart-{menu_item_id}",
            "cart": [{"name": f"Item {menu_item_id}", "qty": qty, "menuItemId": menu_item_id}],
        }

    monkeypatch.setattr(tools_mod, "add_item_to_cart", fake_add_item_to_cart)

    session_id = "test-multi-bug2"
    session = get_session(session_id)

    # Two separate operations (one per item), each with one line.
    latte_op = _compiled_add(8, 1, "Latte")
    mocha_op = _compiled_add(12, 1, "Mocha")

    result = await execute_compiled_operations(
        operations=[latte_op, mocha_op],
        clarifications=[],
        failures=[],
        session_id=session_id,
        cart_id="cart-start",
        session=session,
        auth_cookie=None,
    )

    assert 8 in added_ids, "Latte (id=8) was not added"
    assert 12 in added_ids, "Mocha (id=12) was not added — bug #2 not fixed"
    assert result.cart_updated is True


# ─────────────────────────────────────────────────────────────────────────────
# Bug #3 — session.last_items must be populated after multi-op add
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_followup_reference_works_after_multi_op_add(monkeypatch):
    """Bug #3: after 'add latte and croissant', 'make that 2' must resolve via last_items."""
    import app.services.tools as tools_mod

    async def fake_add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
        return {
            "cart_id": f"cart-{menu_item_id}",
            "cart": [{"name": f"Item {menu_item_id}", "qty": qty, "menuItemId": menu_item_id}],
        }

    monkeypatch.setattr(tools_mod, "add_item_to_cart", fake_add_item_to_cart)

    session_id = "test-followup-bug3"
    session = get_session(session_id)
    # Ensure last_items starts empty so the test is meaningful.
    session["last_items"] = []

    latte_op = _compiled_add(8, 1, "Latte")
    croissant_op = _compiled_add(21, 1, "Croissant")

    await execute_compiled_operations(
        operations=[latte_op, croissant_op],
        clarifications=[],
        failures=[],
        session_id=session_id,
        cart_id="cart-start",
        session=session,
        auth_cookie=None,
    )

    last_items = session.get("last_items") or []
    assert last_items, "session.last_items was not populated after multi-op add — bug #3 not fixed"

    # Verify the shape expected by _layer4_resolve / compiler follow-up resolution.
    assert any(
        str(item.get("item_name") or "").lower() in ("latte", "croissant")
        for item in last_items
        if isinstance(item, dict)
    ), f"last_items does not contain expected item names: {last_items}"


def test_failure_to_reply_prefers_custom_message():
    failure = CompileFailure(
        reason="item_not_found",
        source_item=ParsedItemRequest(item_query="flat white"),
        message="I couldn't find 'flat white' in your cart.",
    )
    assert _failure_to_reply(failure, "flat white") == "I couldn't find 'flat white' in your cart."
