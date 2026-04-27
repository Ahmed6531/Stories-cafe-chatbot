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
from app.services.executor import ExecutionResult, OpExecutionOutcome, execute_compiled_operations
from app.services.executor import _failure_to_reply
from app.services.session_store import get_session


@pytest.fixture(autouse=True)
def isolate_executor_add_side_effects(monkeypatch):
    """Keep executor unit tests away from recommendation/upsell/network side effects."""
    import app.services.executor as executor_mod
    import app.services.suggestions as suggestions_mod
    import app.services.tools as tools_mod
    import app.services.upsell as upsell_mod

    async def fake_get_cart(cart_id=None):
        return {"cart_id": cart_id, "cart": []}

    async def fake_fetch_menu_items():
        return []

    async def fake_fetch_menu_item_detail(menu_item_id):
        return None

    async def fake_get_upsell_suggestions(**kwargs):
        return []

    monkeypatch.setattr(tools_mod, "get_cart", fake_get_cart)
    monkeypatch.setattr(tools_mod, "fetch_menu_items", fake_fetch_menu_items)
    monkeypatch.setattr(tools_mod, "fetch_menu_item_detail", fake_fetch_menu_item_detail)
    monkeypatch.setattr(upsell_mod, "get_size_upgrade_suggestion", lambda *args, **kwargs: None)
    monkeypatch.setattr(upsell_mod, "get_upsell_suggestions", fake_get_upsell_suggestions)
    monkeypatch.setattr(suggestions_mod, "suggest_complementary_items", lambda *args, **kwargs: [])
    monkeypatch.setattr(executor_mod, "_schedule_combo_observation", lambda **kwargs: None)


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


def _compiled_add_with_options(
    menu_item_id: int,
    qty: int,
    item_name: str,
    options: list[CompiledOption],
) -> CompiledOperation:
    parsed = _parsed_op("add_items", [ParsedItemRequest(item_query=item_name, quantity=qty)])
    return CompiledOperation(
        intent="add_items",
        lines=[
            CompiledCartLine(
                menuItemId=menu_item_id,
                qty=qty,
                selectedOptions=options,
            )
        ],
        source_parsed=parsed,
    )


def _compiled_clear() -> CompiledOperation:
    parsed = _parsed_op("clear_cart")
    return CompiledOperation(intent="clear_cart", lines=[], source_parsed=parsed)


def _compiled_remove_all(item_name: str) -> CompiledOperation:
    parsed = _parsed_op("remove_item", [ParsedItemRequest(item_query=item_name, quantity=None)])
    return CompiledOperation(intent="remove_item", lines=[], source_parsed=parsed)


def _compiled_info(intent: str, item_query: str = "") -> CompiledOperation:
    parsed = _parsed_op(intent, [ParsedItemRequest(item_query=item_query)] if item_query else [])
    return CompiledOperation(intent=intent, lines=[], source_parsed=parsed)


def _missing_required_latte() -> CompileNeedsClarification:
    return CompileNeedsClarification(
        reason="missing_required_group",
        missing_groups=[{"name": "Size"}],
        source_item=ParsedItemRequest(item_query="Latte", quantity=1),
        matched_menu_item={"id": 8, "name": "Latte"},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("info_intent", "info_reply"),
    [
        ("describe_item", "Chocolate Croissant — flaky and buttery."),
        ("list_category_items", "Here's what we have in Pastries:\n- Chocolate Croissant"),
        ("list_categories", "Here's what we serve:\n- Pastries\n- Coffee"),
        ("view_cart", "Here's your cart:\n- 1x Mocha"),
        ("recommendation_query", "Here are some picks you might like:\n- Latte"),
    ],
)
async def test_info_ops_after_missing_required_render_before_guided_prompt(
    monkeypatch,
    info_intent,
    info_reply,
):
    import app.services.executor as executor_mod

    captured_remaining: list[list[str]] = []

    async def fake_setup_guided_ordering(clarification, ctx, remaining_ops):
        captured_remaining.append([op.intent for op in remaining_ops])
        return "What size would you like for your Latte?"

    async def fake_info_handler(op, ctx):
        return OpExecutionOutcome(reply_fragment=info_reply)

    monkeypatch.setattr(executor_mod, "_setup_guided_ordering", fake_setup_guided_ordering)
    monkeypatch.setitem(executor_mod._HANDLERS, info_intent, fake_info_handler)

    session_id = f"test-info-before-guided-{info_intent}"
    session = get_session(session_id)
    result = await execute_compiled_operations(
        compile_results=[
            _missing_required_latte(),
            CompileSuccess(operation=_compiled_info(info_intent, "pastries")),
        ],
        session_id=session_id,
        cart_id="cart-start",
        session=session,
        auth_cookie=None,
    )

    assert result.metadata["pipeline_stage"] == "guided_ordering_start"
    assert info_reply in result.reply
    assert "What size would you like for your Latte?" in result.reply
    assert result.reply.index(info_reply) < result.reply.index("What size")
    assert captured_remaining == [[]]


@pytest.mark.asyncio
async def test_active_ops_after_missing_required_are_still_queued(monkeypatch):
    import app.services.executor as executor_mod

    captured_remaining: list[list[str]] = []

    async def fake_setup_guided_ordering(clarification, ctx, remaining_ops):
        captured_remaining.append([op.intent for op in remaining_ops])
        return "What size would you like for your Latte?"

    monkeypatch.setattr(executor_mod, "_setup_guided_ordering", fake_setup_guided_ordering)

    session_id = "test-active-queued-after-guided"
    session = get_session(session_id)
    result = await execute_compiled_operations(
        compile_results=[
            _missing_required_latte(),
            CompileSuccess(operation=_compiled_add(12, 1, "Mocha")),
        ],
        session_id=session_id,
        cart_id="cart-start",
        session=session,
        auth_cookie=None,
    )

    assert result.metadata["pipeline_stage"] == "guided_ordering_start"
    assert captured_remaining == [["add_items"]]


# ─────────────────────────────────────────────────────────────────────────────
# Bug #1 — clear_cart must actually clear the cart in a multi-op sequence
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_active_ops_after_ambiguous_item_still_execute(monkeypatch):
    import app.services.tools as tools_mod

    added_ids: list[int] = []

    async def fake_add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
        added_ids.append(int(menu_item_id))
        return {
            "cart_id": f"cart-{menu_item_id}",
            "cart": [{"name": "Cinnamon Rolls", "qty": qty, "menuItemId": menu_item_id}],
        }

    async def fake_get_cart(cart_id=None):
        return {"cart_id": cart_id, "cart": []}

    async def fake_fetch_menu_items():
        return []

    monkeypatch.setattr(tools_mod, "add_item_to_cart", fake_add_item_to_cart)
    monkeypatch.setattr(tools_mod, "get_cart", fake_get_cart)
    monkeypatch.setattr(tools_mod, "fetch_menu_items", fake_fetch_menu_items)

    session_id = "test-active-after-ambiguous"
    session = get_session(session_id)
    ambiguous_croissant = CompileNeedsClarification(
        reason="ambiguous_item",
        candidates=[
            {"item_name": "Cheese Croissant", "menu_item_id": 27},
            {"item_name": "Chocolate Croissant", "menu_item_id": 26},
        ],
        source_item=ParsedItemRequest(item_query="croissant", quantity=None),
    )

    result = await execute_compiled_operations(
        compile_results=[
            ambiguous_croissant,
            CompileSuccess(operation=_compiled_add(28, 1, "Cinnamon Rolls")),
        ],
        session_id=session_id,
        cart_id="cart-start",
        session=session,
        auth_cookie=None,
    )

    assert added_ids == [28]
    assert "Added Cinnamon Rolls to your cart." in result.reply
    assert "Which croissant would you like: Cheese Croissant or Chocolate Croissant?" in result.reply
    assert result.cart_updated is True
    assert result.needs_followup is True
    assert result.metadata["pipeline_stage"] == "add_item_needs_menu_choice"


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


@pytest.mark.asyncio
async def test_add_reply_includes_suboption_labels(monkeypatch):
    import app.services.tools as tools_mod

    async def fake_add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
        return {
            "cart_id": "cart-labneh",
            "cart": [{"name": "Labneh", "qty": qty, "menuItemId": menu_item_id}],
        }

    async def fake_get_cart(cart_id=None):
        return {"cart_id": cart_id, "cart": []}

    async def fake_fetch_menu_items():
        return []

    monkeypatch.setattr(tools_mod, "add_item_to_cart", fake_add_item_to_cart)
    monkeypatch.setattr(tools_mod, "get_cart", fake_get_cart)
    monkeypatch.setattr(tools_mod, "fetch_menu_items", fake_fetch_menu_items)

    session_id = "test-add-suboption-label"
    session = get_session(session_id)
    op = _compiled_add_with_options(
        14,
        1,
        "Labneh",
        [
            CompiledOption(optionName="Brown Bread", groupId="sandwich-bread-options"),
            CompiledOption(optionName="Pepper", suboptionName="Extra", groupId="sandwich-toppings"),
        ],
    )

    result = await execute_compiled_operations(
        operations=[op],
        clarifications=[],
        failures=[],
        session_id=session_id,
        cart_id="cart-start",
        session=session,
        auth_cookie=None,
    )

    assert result.reply == "Added Labneh (Brown Bread, Extra Pepper) to your cart."


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


def test_remove_all_survives_llm_typo_correction():
    from app.services.orchestrator import _resolved_to_parsed_request

    parsed = _resolved_to_parsed_request(
        {
            "intent": "remove_item",
            "operations": [
                {
                    "intent": "remove_item",
                    "items": [
                        {
                            "item_query": "cappuccino",
                            "quantity": None,
                            "modifiers": [],
                            "notes": [],
                        }
                    ],
                }
            ],
        },
        "remove_item",
        {},
        "remove all cappucino in my cart and add 2 greek salads with cutlery",
    )

    assert parsed.operations[0].items[0].item_query == "all cappuccino"


@pytest.mark.asyncio
async def test_remove_all_removes_every_matching_cart_line(monkeypatch):
    import app.services.tools as tools_mod

    removed_lines: list[str] = []

    async def fake_get_cart(cart_id=None):
        return {
            "cart_id": cart_id,
            "cart": [
                {"lineId": "cookie-warmed", "name": "Cookie", "qty": 1, "menuItemId": 31},
                {"lineId": "cookie-plain", "name": "Cookie", "qty": 1, "menuItemId": 31},
                {"lineId": "latte", "name": "Latte", "qty": 1, "menuItemId": 8},
            ],
        }

    async def fake_remove_item_from_cart(line_id, cart_id):
        removed_lines.append(line_id)
        return {"cart_id": cart_id, "cart": []}

    monkeypatch.setattr(tools_mod, "get_cart", fake_get_cart)
    monkeypatch.setattr(tools_mod, "remove_item_from_cart", fake_remove_item_from_cart)

    session_id = "test-remove-all"
    session = get_session(session_id)

    result = await execute_compiled_operations(
        operations=[_compiled_remove_all("all cookies")],
        clarifications=[],
        failures=[],
        session_id=session_id,
        cart_id="cart-cookie",
        session=session,
        auth_cookie=None,
    )

    assert result.reply == "Removed all 2 Cookie from your cart."
    assert result.cart_updated is True
    assert removed_lines == ["cookie-warmed", "cookie-plain"]


@pytest.mark.asyncio
async def test_update_item_preserves_live_quantity_after_quantity_update(monkeypatch):
    import app.services.tools as tools_mod

    updated_payloads: list[dict] = []

    async def fake_get_cart(cart_id=None):
        return {
            "cart_id": cart_id,
            "cart": [
                {
                    "lineId": "labneh-line",
                    "name": "Labneh",
                    "qty": 2,
                    "menuItemId": 14,
                }
            ],
        }

    async def fake_update_cart_item(line_id, qty, selected_options, instructions, cart_id):
        updated_payloads.append(
            {
                "line_id": line_id,
                "qty": qty,
                "selected_options": selected_options,
                "instructions": instructions,
                "cart_id": cart_id,
            }
        )
        return {"cart_id": cart_id, "cart": []}

    monkeypatch.setattr(tools_mod, "get_cart", fake_get_cart)
    monkeypatch.setattr(tools_mod, "update_cart_item", fake_update_cart_item)

    op = CompiledOperation(
        intent="update_item",
        cart_line_id="labneh-line",
        source_parsed=_parsed_op(
            "update_item",
            [ParsedItemRequest(item_query="Labneh", modifiers=["pepper regular"])],
        ),
        lines=[
            CompiledCartLine(
                menuItemId=14,
                qty=1,
                selectedOptions=[
                    CompiledOption(optionName="Pepper", suboptionName="Regular", groupId="sandwich-toppings")
                ],
            )
        ],
    )

    session_id = "test-update-preserve-quantity"
    session = get_session(session_id)
    result = await execute_compiled_operations(
        operations=[op],
        clarifications=[],
        failures=[],
        session_id=session_id,
        cart_id="cart-labneh",
        session=session,
        auth_cookie=None,
    )

    assert result.cart_updated is True
    assert updated_payloads[0]["qty"] == 2


# ─────────────────────────��──────────────────────────────��────────────────────
# Bug #3 — session / queue flush on checkout
# ──────────────────────────────────────────���────────────────────────────────���─


def test_reset_conversation_session_flushes_all_state():
    """Bug #3: reset_conversation_session must clear pending ops, guided order
    state, cart_id, and all transient fields so a post-checkout session is clean."""
    from app.services.session_store import (
        get_session,
        reset_conversation_session,
        set_guided_order_item_id,
        set_guided_order_item_name,
        set_guided_order_phase,
        set_guided_order_state,
        set_pending_operations,
        set_pending_operations_context,
        set_session_cart_id,
        set_session_stage,
    )

    sid = "test-flush-on-checkout"
    session = get_session(sid)

    # Populate state that must be cleared.
    set_session_cart_id(sid, "cart-abc")
    set_session_stage(sid, "guided_ordering")
    set_guided_order_item_id(sid, 8)
    set_guided_order_item_name(sid, "Latte")
    set_guided_order_phase(sid, 2)
    set_guided_order_state(sid, "required")
    set_pending_operations(sid, [{"intent": "add_items", "items": []}])
    set_pending_operations_context(sid, {"foo": "bar"})
    session["last_items"] = [{"item_name": "Latte"}]
    session["checkout_initiated"] = True

    reset_conversation_session(sid)

    fresh = get_session(sid)
    assert fresh["cart_id"] is None, "cart_id must be cleared"
    assert fresh["stage"] is None, "stage must be cleared"
    assert fresh["guided_order_item_id"] is None
    assert fresh["guided_order_item_name"] is None
    assert fresh["guided_order_phase"] == 1
    assert fresh["guided_order_state"] is None
    assert fresh["pending_operations"] == []
    assert fresh["pending_operations_context"] == {}
    assert fresh["last_items"] == []
    assert fresh["checkout_initiated"] is False
