"""
Executor: CompiledOperation -> cart backend calls -> ExecutionResult.

Single entry point: execute_compiled_operations().
Fixes three bugs from the Phase 3 review:
  Bug #1: clear_cart in multi_op was a no-op (Path B had no clear_cart branch).
  Bug #2: _drain_pending_operations used op_items[0], silently dropping extras.
  Bug #3: last_items was not updated after multi-op adds, breaking follow-up refs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.schemas.actions import CompiledCartLine, CompiledOperation
from app.services.compiler import CompileFailure, CompileNeedsClarification
from app.services.session_store import (
    clear_pending_operations,
    get_session,
    set_guided_order_groups,
    set_guided_order_item_id,
    set_guided_order_item_name,
    set_guided_order_optional_groups,
    set_guided_order_phase,
    set_guided_order_quantity,
    set_guided_order_required_groups,
    set_guided_order_selections,
    set_guided_order_step,
    set_pending_operations,
    set_session_stage,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class ExecutionContext:
    session_id: str
    cart_id: str | None
    session: dict
    auth_cookie: str | None
    cart_updated: bool = False


@dataclass
class OpExecutionOutcome:
    reply_fragment: str
    cart_updated: bool = False
    failed: bool = False
    suggestions: list[dict] = field(default_factory=list)
    defaults_used: list[str] = field(default_factory=list)


@dataclass
class ExecutionResult:
    reply: str
    cart_updated: bool
    cart_id: str | None
    intent_for_response: str
    needs_followup: bool = False
    followup_stage: str | None = None
    suggestions: list[dict] = field(default_factory=list)
    defaults_used: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# Per-intent handlers
# ─────────────────────────────────────────────────────────────────────────────


async def _execute_clear_cart(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move clear_cart tool import to a shared module.
    from app.services.tools import clear_cart, get_cart

    existing = await get_cart(cart_id=ctx.cart_id)
    if not existing["cart"]:
        return OpExecutionOutcome(
            reply_fragment="Your cart is already empty.",
            cart_updated=False,
        )

    result = await clear_cart(cart_id=ctx.cart_id)
    ctx.cart_id = result["cart_id"]
    ctx.session["last_items"] = []
    ctx.session["last_intent"] = None
    ctx.session["pending_clarification"] = None
    set_session_stage(ctx.session_id, None)
    ctx.cart_updated = True
    return OpExecutionOutcome(reply_fragment="Your cart is now empty.", cart_updated=True)


async def _execute_add_line(
    line: CompiledCartLine,
    item_name: str,
    ctx: ExecutionContext,
) -> OpExecutionOutcome:
    # Phase 5: move add_item_to_cart import to a shared module.
    from app.services.http_client import ExpressAPIError
    from app.services.tools import add_item_to_cart

    wire = line.to_wire_payload()
    try:
        result = await add_item_to_cart(
            menu_item_id=wire["menuItemId"],
            qty=wire["qty"],
            selected_options=wire["selectedOptions"],
            instructions=wire["instructions"],
            cart_id=ctx.cart_id,
        )
        ctx.cart_id = result["cart_id"]
        ctx.cart_updated = True
        opts = wire.get("selectedOptions") or []
        opt_labels = [str(o.get("optionName") or "").strip() for o in opts if isinstance(o, dict) and o.get("optionName")]
        suffix = f" ({', '.join(opt_labels)})" if opt_labels else ""
        qty = wire["qty"]
        qty_prefix = f"{qty}x " if qty > 1 else ""
        return OpExecutionOutcome(
            reply_fragment=f"Added {qty_prefix}{item_name}{suffix} to your cart.",
            cart_updated=True,
        )
    except ExpressAPIError as err:
        # Phase 5: move is_out_of_stock_error to a shared module.
        from app.services.orchestrator import is_out_of_stock_error
        if is_out_of_stock_error(err):
            return OpExecutionOutcome(
                reply_fragment=f"{item_name} is out of stock right now.",
                cart_updated=False,
                failed=True,
            )
        return OpExecutionOutcome(
            reply_fragment=f"Couldn't add {item_name} right now.",
            cart_updated=False,
            failed=True,
        )


async def _execute_add_operation(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    """
    Iterate ALL op.lines — fixes bug #2 (op_items[0] drop in _drain_pending_operations).
    Updates session.last_items after every successful add — fixes bug #3.
    """
    if not op.lines:
        return OpExecutionOutcome(reply_fragment="", cart_updated=False)

    # Map lines to item names from source_parsed; fall back to index-based lookup.
    source_items = op.source_parsed.items if op.source_parsed else []

    success_parts: list[str] = []
    failure_parts: list[str] = []
    added_item_records: list[dict] = []

    for i, line in enumerate(op.lines):
        # Resolve item name: prefer source_parsed, fall back to menu_item_id.
        if i < len(source_items):
            item_name = source_items[i].item_query or f"item #{i+1}"
        else:
            item_name = f"item #{i+1}"

        outcome = await _execute_add_line(line, item_name, ctx)
        if outcome.failed:
            failure_parts.append(outcome.reply_fragment)
        else:
            success_parts.append(outcome.reply_fragment)
            added_item_records.append({
                "item_name": str(item_name).strip().lower(),
                "quantity": line.qty,
                "menu_item_id": line.menu_item_id,
            })

    # Bug #3 fix: update last_items after every add so follow-up refs work.
    if added_item_records:
        ctx.session["last_items"] = added_item_records
        ctx.session["last_intent"] = "add_items"

    all_parts = success_parts + failure_parts
    reply = " ".join(all_parts) if all_parts else ""
    return OpExecutionOutcome(
        reply_fragment=reply,
        cart_updated=bool(success_parts),
        failed=bool(failure_parts) and not bool(success_parts),
    )


async def _execute_remove(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move tool imports to a shared module.
    from app.services.tools import get_cart, remove_item_from_cart, update_cart_item_quantity

    line = op.lines[0] if op.lines else None
    cart_line_id = op.cart_line_id

    if cart_line_id is None:
        # Fallback: look up by item name in cart.
        if not op.source_parsed or not op.source_parsed.items:
            return OpExecutionOutcome(reply_fragment="Nothing to remove.", failed=True)
        item_name = op.source_parsed.items[0].item_query
        cart_result = await get_cart(cart_id=ctx.cart_id)
        # Phase 5: move find_menu_item_by_name to a shared module.
        from app.services.tools import find_menu_item_by_name
        matched = await find_menu_item_by_name(
            cart_result["cart"],
            item_name,
            include_unavailable=True,
        )
        if not matched:
            return OpExecutionOutcome(reply_fragment=f"Couldn't find {item_name} in your cart.", failed=True)
        cart_line_id = matched.get("lineId") or matched.get("_id")
        ctx.cart_id = cart_result["cart_id"]
        display_name = matched.get("name") or item_name
    else:
        display_name = (op.source_parsed.items[0].item_query if op.source_parsed and op.source_parsed.items else "item")

    if cart_line_id is None:
        return OpExecutionOutcome(reply_fragment=f"Couldn't remove that item right now.", failed=True)

    # Handle partial quantity removal.
    remove_qty = (op.source_parsed.items[0].quantity if op.source_parsed and op.source_parsed.items else None)
    if remove_qty and remove_qty > 0 and line and line.qty > remove_qty:
        result = await update_cart_item_quantity(
            line_id=cart_line_id,
            qty=line.qty - remove_qty,
            cart_id=ctx.cart_id,
        )
        ctx.cart_id = result["cart_id"]
        ctx.cart_updated = True
        return OpExecutionOutcome(
            reply_fragment=f"Removed {remove_qty} {display_name} from your cart.",
            cart_updated=True,
        )

    result = await remove_item_from_cart(line_id=cart_line_id, cart_id=ctx.cart_id)
    ctx.cart_id = result["cart_id"]
    ctx.cart_updated = True
    return OpExecutionOutcome(
        reply_fragment=f"Removed {display_name} from your cart.",
        cart_updated=True,
    )


async def _execute_update_quantity(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move tool imports to a shared module.
    from app.services.tools import update_cart_item_quantity

    cart_line_id = op.cart_line_id
    if not op.lines or cart_line_id is None:
        return OpExecutionOutcome(reply_fragment="Couldn't update quantity right now.", failed=True)

    line = op.lines[0]
    item_name = (op.source_parsed.items[0].item_query if op.source_parsed and op.source_parsed.items else "item")
    result = await update_cart_item_quantity(
        line_id=cart_line_id,
        qty=line.qty,
        cart_id=ctx.cart_id,
    )
    ctx.cart_id = result["cart_id"]
    ctx.cart_updated = True
    return OpExecutionOutcome(
        reply_fragment=f"Updated {item_name} to quantity {line.qty}.",
        cart_updated=True,
    )


async def _execute_update_item(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move tool imports to a shared module.
    from app.services.tools import add_item_to_cart, remove_item_from_cart

    cart_line_id = op.cart_line_id
    if not op.lines or cart_line_id is None:
        return OpExecutionOutcome(reply_fragment="Couldn't update that item right now.", failed=True)

    line = op.lines[0]
    item_name = (op.source_parsed.items[0].item_query if op.source_parsed and op.source_parsed.items else "item")
    try:
        from app.services.http_client import ExpressAPIError
        removed = await remove_item_from_cart(line_id=cart_line_id, cart_id=ctx.cart_id)
        wire = line.to_wire_payload()
        result = await add_item_to_cart(
            menu_item_id=wire["menuItemId"],
            qty=wire["qty"],
            selected_options=wire["selectedOptions"],
            instructions=wire["instructions"],
            cart_id=removed["cart_id"],
        )
        ctx.cart_id = result["cart_id"]
        ctx.cart_updated = True
        return OpExecutionOutcome(reply_fragment=f"Updated {item_name}.", cart_updated=True)
    except Exception:
        return OpExecutionOutcome(reply_fragment=f"Couldn't update {item_name} right now.", failed=True)


async def _execute_view_cart(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move build_cart_summary to a shared module.
    from app.services.orchestrator import build_cart_summary
    from app.services.tools import get_cart

    result = await get_cart(cart_id=ctx.cart_id)
    ctx.cart_id = result["cart_id"]
    summary = build_cart_summary(result["cart"])
    if summary:
        return OpExecutionOutcome(reply_fragment=f"Here's your cart:\n{summary}")
    return OpExecutionOutcome(reply_fragment="Your cart is empty.")


async def _execute_checkout(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move orchestrator helpers to a shared module.
    from app.services.orchestrator import build_cart_summary, _build_bill
    from app.services.tools import get_cart
    from app.services.session_store import set_checkout_initiated

    result = await get_cart(cart_id=ctx.cart_id)
    ctx.cart_id = result["cart_id"]
    if not result["cart"]:
        return OpExecutionOutcome(reply_fragment="Your cart is empty — nothing to checkout.")
    _build_bill(result["cart"])
    set_session_stage(ctx.session_id, "checkout_summary")
    set_checkout_initiated(ctx.session_id, True)
    summary = build_cart_summary(result["cart"])
    return OpExecutionOutcome(
        reply_fragment=f"Ready to checkout? Here's your order summary.\n\n{summary}" if summary else "Ready to checkout?",
    )


async def _execute_describe(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move tool imports to a shared module.
    from app.services.tools import fetch_menu_item_detail

    if not op.lines:
        return OpExecutionOutcome(reply_fragment="I couldn't find that item.")
    line = op.lines[0]
    item_name = (op.source_parsed.items[0].item_query if op.source_parsed and op.source_parsed.items else "item")
    detail = await fetch_menu_item_detail(line.menu_item_id)
    if not detail:
        return OpExecutionOutcome(reply_fragment=f"I couldn't find details for {item_name}.")
    description = str(detail.get("description") or "").strip()
    price = detail.get("price") or detail.get("basePrice")
    name = detail.get("name") or item_name
    parts = [f"{name}"]
    if description:
        parts.append(description)
    if price:
        parts.append(f"Price: L.L {int(float(price or 0)):,}")
    return OpExecutionOutcome(reply_fragment=" — ".join(parts))


async def _execute_list_categories(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    from app.services.http_client import ExpressAPIError, ExpressHttpClient

    try:
        client = ExpressHttpClient()
        data, _ = await client.get("/menu/categories")
        categories = data.get("categories", []) if isinstance(data, dict) else []
        names = [str(c.get("name") or "").strip() for c in categories if isinstance(c, dict) and c.get("name")]
        if names:
            return OpExecutionOutcome(reply_fragment="Here are our categories: " + ", ".join(names) + ".")
        return OpExecutionOutcome(reply_fragment="I couldn't find any categories right now.")
    except ExpressAPIError:
        return OpExecutionOutcome(reply_fragment="I couldn't load the menu categories right now.")


async def _execute_list_category_items(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move fetch_menu_items to a shared module.
    from app.services.tools import fetch_menu_items

    category_query = ""
    if op.source_parsed and op.source_parsed.items:
        category_query = op.source_parsed.items[0].item_query.lower().strip()

    all_items = await fetch_menu_items()
    if not category_query:
        return OpExecutionOutcome(reply_fragment="Which category are you interested in?")

    matched = [
        item for item in all_items
        if isinstance(item, dict) and category_query in str(item.get("category") or "").lower()
    ]
    if not matched:
        return OpExecutionOutcome(reply_fragment=f"I couldn't find items in '{category_query}'.")
    names = [str(item.get("name") or "").strip() for item in matched[:10] if item.get("name")]
    return OpExecutionOutcome(reply_fragment=f"Items in {category_query}: " + ", ".join(names) + ".")


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch table
# ─────────────────────────────────────────────────────────────────────────────

_HANDLERS: dict[str, Callable[..., Awaitable[OpExecutionOutcome]]] = {
    "clear_cart": _execute_clear_cart,
    "add_items": _execute_add_operation,
    "add_item": _execute_add_operation,
    "remove_item": _execute_remove,
    "update_quantity": _execute_update_quantity,
    "update_item": _execute_update_item,
    "view_cart": _execute_view_cart,
    "checkout": _execute_checkout,
    "confirm_checkout": _execute_checkout,
    "describe_item": _execute_describe,
    "list_categories": _execute_list_categories,
    "list_category_items": _execute_list_category_items,
}


def _pipeline_stage_for_intent(intent: str) -> str:
    return {
        "add_items": "add_items_done",
        "add_item": "add_items_done",
        "remove_item": "remove_item_done",
        "update_quantity": "update_quantity_done",
        "update_item": "update_item_done",
        "clear_cart": "clear_cart_done",
        "view_cart": "view_cart_done",
    }.get(intent, "executor_done")


# ─────────────────────────────────────────────────────────────────────────────
# Guided ordering setup helper (called when a clarification has missing groups)
# ─────────────────────────────────────────────────────────────────────────────


async def _setup_guided_ordering(
    clarification: CompileNeedsClarification,
    ctx: ExecutionContext,
    remaining_ops: list[CompiledOperation],
) -> str:
    """
    Set up the guided-ordering session from a CompileNeedsClarification.
    Returns the guided-ordering prompt text.
    """
    # Phase 5: move orchestrator helpers to a shared module.
    from app.services.orchestrator import build_guided_order_groups, build_guided_order_prompt, build_optional_review_prompt
    from app.services.tools import fetch_menu_item_detail

    matched_item = clarification.matched_menu_item or {}
    source_item = clarification.source_item

    menu_item_id = matched_item.get("id") or matched_item.get("_id")
    item_name = matched_item.get("name") or (source_item.item_query if source_item else "your item")
    quantity = int(source_item.quantity or 1) if source_item else 1

    # Fetch full menu detail to get both required and optional groups.
    menu_detail = None
    if menu_item_id is not None:
        if (
            isinstance(matched_item.get("variantGroupDetails"), list)
            or isinstance(matched_item.get("variants"), list)
        ):
            menu_detail = matched_item
        else:
            menu_detail = await fetch_menu_item_detail(menu_item_id)

    required_groups, optional_groups = build_guided_order_groups(menu_detail)

    # Persist remaining compiled ops so the guided-ordering completion can drain them.
    if remaining_ops:
        set_pending_operations(ctx.session_id, [op.model_dump() for op in remaining_ops])

    set_guided_order_item_id(ctx.session_id, menu_item_id)
    set_guided_order_item_name(ctx.session_id, item_name)
    set_guided_order_quantity(ctx.session_id, quantity)
    set_guided_order_required_groups(ctx.session_id, required_groups)
    set_guided_order_optional_groups(ctx.session_id, optional_groups)
    set_guided_order_selections(ctx.session_id, {})
    set_guided_order_step(ctx.session_id, 0)
    set_session_stage(ctx.session_id, "guided_ordering")

    if required_groups:
        set_guided_order_phase(ctx.session_id, 1)
        set_guided_order_groups(ctx.session_id, required_groups)
        first_group = required_groups[0]
        return build_guided_order_prompt(item_name, first_group, include_item_name=True, allow_skip=False)
    elif len(optional_groups) == 1:
        set_guided_order_phase(ctx.session_id, 3)
        set_guided_order_groups(ctx.session_id, optional_groups)
        first_group = optional_groups[0]
        return build_guided_order_prompt(item_name, first_group, include_item_name=True, allow_skip=True)
    else:
        set_guided_order_phase(ctx.session_id, 2)
        set_guided_order_groups(ctx.session_id, optional_groups)
        return build_optional_review_prompt(item_name, {}, optional_groups)


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────


async def execute_compiled_operations(
    operations: list[CompiledOperation],
    clarifications: list[CompileNeedsClarification],
    failures: list[CompileFailure],
    session_id: str,
    cart_id: str | None,
    session: dict,
    auth_cookie: str | None,
) -> ExecutionResult:
    """
    Execute a sequence of compiled operations against the cart backend.

    Behavior:
      - Operations execute in order. Each produces a reply fragment.
      - CompileFailure results are rendered as failure messages (no short-circuit
        except for clear_cart failures, which do short-circuit).
      - CompileNeedsClarification(reason="missing_required_group") triggers
        guided ordering: remaining ops are persisted and this function returns
        with needs_followup=True.
      - CompileNeedsClarification(reason="ambiguous_item") returns the
        disambiguation prompt.
      - CompileNeedsClarification(reason="unmatched_modifiers") adds the item
        anyway and appends a note about unmatched modifiers.

    Returns ExecutionResult with a joined reply and metadata.
    """
    ctx = ExecutionContext(
        session_id=session_id,
        cart_id=cart_id,
        session=session,
        auth_cookie=auth_cookie,
    )

    reply_parts: list[str] = []
    all_suggestions: list[dict] = []
    all_defaults: list[str] = []
    intent_for_response = "unknown"

    # Render compile failures.
    for failure in failures:
        item_name = (failure.source_item.item_query if failure.source_item else None) or "item"
        msg = _failure_to_reply(failure, item_name)
        reply_parts.append(msg)

    # Handle clarifications before executing operations.
    for i, clarification in enumerate(clarifications):
        if clarification.reason == "missing_required_group":
            # Start guided ordering. Queue remaining operations as pending.
            remaining_ops = operations  # all ops not yet executed
            prompt = await _setup_guided_ordering(clarification, ctx, remaining_ops)
            # Prepend any already-accumulated reply so user sees full context.
            full_reply = (" ".join(reply_parts) + " " + prompt).strip() if reply_parts else prompt
            return ExecutionResult(
                reply=full_reply,
                cart_updated=ctx.cart_updated,
                cart_id=ctx.cart_id,
                intent_for_response="add_items",
                needs_followup=True,
                followup_stage="guided_ordering",
                suggestions=all_suggestions,
                defaults_used=all_defaults,
                metadata={"pipeline_stage": "guided_ordering_start"},
            )

        elif clarification.reason == "ambiguous_item":
            from app.services.item_clarification import build_menu_choice_prompt
            candidates = clarification.candidates or []
            item_name = (clarification.source_item.item_query if clarification.source_item else None) or "item"
            prompt = build_menu_choice_prompt(item_name, candidates)
            full_reply = (" ".join(reply_parts) + " " + prompt).strip() if reply_parts else prompt
            return ExecutionResult(
                reply=full_reply,
                cart_updated=ctx.cart_updated,
                cart_id=ctx.cart_id,
                intent_for_response="add_items",
                needs_followup=True,
                followup_stage="item_clarification",
                suggestions=all_suggestions,
                defaults_used=all_defaults,
                metadata={"pipeline_stage": "add_item_needs_menu_choice"},
            )

        elif clarification.reason == "unmatched_modifiers":
            # Add the item with what was matched; append a note about unmatched modifiers.
            unmatched = clarification.unmatched_modifiers or []
            if unmatched:
                note = f"Note: I couldn't match {', '.join(repr(m) for m in unmatched)} to any option — want me to add that as a note?"
                reply_parts.append(note)

        # follow_up_unresolvable: include an informational message.
        elif clarification.reason == "follow_up_unresolvable":
            reply_parts.append("I'm not sure which item you're referring to. Could you specify the item name?")

    # Execute operations in order.
    for i, op in enumerate(operations):
        intent_for_response = op.intent
        handler = _HANDLERS.get(op.intent)
        if handler is None:
            logger.warning({"stage": "executor_unknown_intent", "intent": op.intent})
            continue

        outcome = await handler(op, ctx)

        if outcome.reply_fragment:
            reply_parts.append(outcome.reply_fragment)
        if outcome.cart_updated:
            ctx.cart_updated = True
        all_suggestions.extend(outcome.suggestions)
        all_defaults.extend(outcome.defaults_used)

        # clear_cart failure is terminal: stop executing subsequent ops.
        if op.intent == "clear_cart" and outcome.failed:
            break

    final_reply = " ".join(p for p in reply_parts if p)
    if not final_reply:
        final_reply = "Done."

    return ExecutionResult(
        reply=final_reply,
        cart_updated=ctx.cart_updated,
        cart_id=ctx.cart_id,
        intent_for_response=intent_for_response,
        needs_followup=False,
        followup_stage=None,
        suggestions=all_suggestions,
        defaults_used=all_defaults,
        metadata={"pipeline_stage": _pipeline_stage_for_intent(intent_for_response)},
    )


def _failure_to_reply(failure: CompileFailure, item_name: str) -> str:
    if failure.message:
        return failure.message
    if failure.reason == "item_not_found":
        return f"I couldn't find '{item_name}' on the menu."
    if failure.reason == "item_unavailable":
        return f"{item_name} is out of stock right now."
    if failure.reason == "menu_item_id_missing":
        return f"I found {item_name} but couldn't add it right now."
    return f"I couldn't process {item_name} right now."
