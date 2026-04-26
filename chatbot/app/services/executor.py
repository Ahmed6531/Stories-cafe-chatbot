"""
Executor: CompiledOperation -> cart backend calls -> ExecutionResult.

Single entry point: execute_compiled_operations().
Fixes three bugs from the Phase 3 review:
  Bug #1: clear_cart in multi_op was a no-op (Path B had no clear_cart branch).
  Bug #2: _drain_pending_operations used op_items[0], silently dropping extras.
  Bug #3: last_items was not updated after multi-op adds, breaking follow-up refs.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.schemas.actions import (
    CompiledCartLine,
    CompiledOperation,
    ParsedItemRequest,
    ParsedOperation,
)
from app.services.compiler import (
    CompileFailure,
    CompileNeedsClarification,
    CompileResult,
    CompileSuccess,
)
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

_PASSIVE_EXECUTOR_INTENTS = frozenset({
    "view_cart",
    "list_category_items",
    "list_categories",
    "recommendation_query",
})

_INFO_BEFORE_GUIDED_INTENTS = _PASSIVE_EXECUTOR_INTENTS | frozenset({
    "describe_item",
})

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
    size_upgrade: dict | None = None


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
    size_upgrade: dict | None = None
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
        opt_labels = []
        for option in opts:
            if not isinstance(option, dict) or not option.get("optionName"):
                continue
            label = str(option.get("optionName") or "").strip()
            suboption = str(option.get("suboptionName") or "").strip()
            if suboption:
                label = f"{suboption} {label}"
            opt_labels.append(label)
        suffix = f" ({', '.join(opt_labels)})" if opt_labels else ""
        qty = wire["qty"]
        qty_prefix = f"{qty}x " if qty > 1 else ""
        defaults_list = line.defaults_used
        size_upgrade: dict | None = None
        try:
            from app.services.upsell import get_size_upgrade_suggestion
            from app.services.tools import fetch_menu_item_detail

            _detail = await fetch_menu_item_detail(wire["menuItemId"])
            if _detail:
                _selected_names = [
                    str(o.get("optionName") or "").strip()
                    for o in (wire.get("selectedOptions") or [])
                    if isinstance(o, dict)
                ]
                _sess = get_session(ctx.session_id) or {}
                _is_repeat = bool(_sess.get("checkout_initiated"))
                size_upgrade = get_size_upgrade_suggestion(
                    ctx.session_id,
                    _detail,
                    _selected_names,
                    is_repeat_customer=_is_repeat,
                )
        except Exception:
            size_upgrade = None
        if defaults_list:
            defaults_summary = ", ".join(defaults_list)
            reply = (
                f"Added {qty_prefix}{item_name} to your cart "
                f"({defaults_summary}). Sound good, or want to change anything?"
            )
        else:
            reply = f"Added {qty_prefix}{item_name}{suffix} to your cart."
        return OpExecutionOutcome(
            reply_fragment=reply,
            cart_updated=True,
            defaults_used=line.defaults_used,
            size_upgrade=size_upgrade,
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


async def _observe_added_item_combos(
    *,
    cart_id: str | None,
    added_item_records: list[dict],
) -> None:
    try:
        from app.services.tools import get_cart, observe_combo

        cart_result = await get_cart(cart_id=cart_id)
        existing_items = cart_result.get("cart") or []

        new_menu_item_ids = [
            str(record["menu_item_id"])
            for record in added_item_records
            if record.get("menu_item_id") is not None
        ]
        existing_menu_item_ids = [
            str(item.get("menuItemId") or item.get("menu_item_id") or "")
            for item in existing_items
            if isinstance(item, dict)
            and str(item.get("menuItemId") or item.get("menu_item_id") or "")
            not in new_menu_item_ids
            and (item.get("menuItemId") or item.get("menu_item_id"))
        ]

        if not existing_menu_item_ids:
            return

        for new_id in new_menu_item_ids:
            await observe_combo(
                anchor_menu_item_ids=existing_menu_item_ids,
                suggested_menu_item_id=new_id,
                source="cart_add",
            )
    except Exception:
        pass


def _schedule_combo_observation(
    *,
    cart_id: str | None,
    added_item_records: list[dict],
) -> None:
    try:
        asyncio.create_task(
            _observe_added_item_combos(
                cart_id=cart_id,
                added_item_records=added_item_records,
            )
        )
    except Exception:
        pass


async def _build_post_add_suggestions(
    ctx: ExecutionContext,
    added_item_records: list[dict],
) -> list[dict]:
    """
    Generate upsell/complementary suggestions after a successful add.
    Returns [] on any error or if cooldown suppresses suggestions.
    Never raises.
    """
    del added_item_records
    try:
        from app.services.upsell import get_upsell_suggestions
        from app.services.tools import fetch_menu_items, get_cart

        cart_result = await get_cart(cart_id=ctx.cart_id)
        cart_items = cart_result.get("cart") or []
        if not cart_items:
            return []

        menu_items = await fetch_menu_items()
        anchor = cart_items[-1] if cart_items else None

        suggestions = await get_upsell_suggestions(
            session_id=ctx.session_id,
            intent="add_items",
            cart_items=cart_items,
            menu_items=menu_items,
            anchor_menu_item=anchor,
        )
        if suggestions:
            return suggestions

        # Upsell suppressed by cooldown — try complementary as fallback
        from app.services.suggestions import suggest_complementary_items
        return suggest_complementary_items(menu_items, anchor, limit=2)

    except Exception:
        return []


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
    all_defaults: list[str] = []
    first_size_upgrade: dict | None = None

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
            all_defaults.extend(outcome.defaults_used)
            if first_size_upgrade is None and outcome.size_upgrade is not None:
                first_size_upgrade = outcome.size_upgrade
            wire = line.to_wire_payload()
            added_item_records.append({
                "item_name": str(item_name).strip().lower(),
                "name": str(item_name).strip(),
                "quantity": line.qty,
                "menu_item_id": line.menu_item_id,
                "selected_options": wire.get("selectedOptions") or [],
                "instructions": wire.get("instructions") or "",
            })

    # Bug #3 fix: update last_items after every add so follow-up refs work.
    if added_item_records:
        ctx.session["last_items"] = added_item_records
        ctx.session["last_intent"] = "add_items"

    if added_item_records and ctx.cart_updated:
        _schedule_combo_observation(
            cart_id=ctx.cart_id,
            added_item_records=added_item_records,
        )

    post_suggestions: list[dict] = []
    if added_item_records and first_size_upgrade is None:
        post_suggestions = await _build_post_add_suggestions(ctx, added_item_records)

    all_parts = success_parts + failure_parts
    reply = " ".join(all_parts) if all_parts else ""
    return OpExecutionOutcome(
        reply_fragment=reply,
        cart_updated=bool(success_parts),
        failed=bool(failure_parts) and not bool(success_parts),
        suggestions=post_suggestions,
        defaults_used=all_defaults,
        size_upgrade=first_size_upgrade,
    )


async def _execute_remove(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move tool imports to a shared module.
    from app.services.tools import get_cart, remove_item_from_cart, update_cart_item_quantity, find_menu_item_by_name

    line = op.lines[0] if op.lines else None
    cart_line_id = op.cart_line_id
    source_item = op.source_parsed.items[0] if op.source_parsed and op.source_parsed.items else None
    item_name_query = source_item.item_query if source_item else "item"
    remove_qty = source_item.quantity if source_item else None
    normalized_query = str(item_name_query or "").strip().lower()
    remove_all = remove_qty is None and cart_line_id is None

    if remove_all:
        match_query = normalized_query
        for prefix in ("all ", "every "):
            if match_query.startswith(prefix):
                match_query = match_query[len(prefix):].strip()
                break
        match_query = match_query or item_name_query

        cart_result = await get_cart(cart_id=ctx.cart_id)
        cart_items = cart_result.get("cart") or []
        if not cart_items:
            return OpExecutionOutcome(
                reply_fragment="Your cart is empty — nothing to remove.",
                failed=True,
            )

        matching_lines = []
        for cart_item in cart_items:
            matched = await find_menu_item_by_name(
                [cart_item],
                match_query,
                include_unavailable=True,
            )
            if matched:
                line_id = cart_item.get("lineId") or cart_item.get("_id")
                if line_id:
                    matching_lines.append((line_id, cart_item.get("name") or item_name_query))

        if not matching_lines:
            return OpExecutionOutcome(
                reply_fragment=f"I couldn't find {match_query} in your cart.",
                failed=True,
            )

        display_name = matching_lines[0][1]
        removed_count = 0
        for line_id, _ in matching_lines:
            try:
                result = await remove_item_from_cart(
                    line_id=line_id,
                    cart_id=ctx.cart_id,
                )
                ctx.cart_id = result["cart_id"]
                removed_count += 1
                ctx.cart_updated = True
            except Exception:
                continue

        if removed_count == 0:
            return OpExecutionOutcome(
                reply_fragment=f"Couldn't remove {display_name} right now.",
                failed=True,
            )

        count_str = f"all {removed_count} " if removed_count > 1 else ""
        return OpExecutionOutcome(
            reply_fragment=f"Removed {count_str}{display_name} from your cart.",
            cart_updated=True,
        )

    if cart_line_id is None:
        # Fallback: look up by item name in cart.
        if source_item is None:
            return OpExecutionOutcome(reply_fragment="Nothing to remove.", failed=True)
        item_name = item_name_query
        cart_result = await get_cart(cart_id=ctx.cart_id)
        cart_items = cart_result.get("cart") or []
        if not cart_items:
            return OpExecutionOutcome(
                reply_fragment="Your cart is empty — nothing to remove.",
                failed=True,
            )
        matched = await find_menu_item_by_name(
            cart_items,
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
        if cart_line_id is None:
            from app.services.tools import get_cart
            cart_result = await get_cart(cart_id=ctx.cart_id)
            cart_items = cart_result.get("cart") or []
            if not cart_items:
                return OpExecutionOutcome(
                    reply_fragment="Your cart is empty — nothing to update.",
                    failed=True,
                )
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
    from app.services.http_client import ExpressAPIError
    from app.services.tools import get_cart, update_cart_item

    cart_line_id = op.cart_line_id
    if not op.lines or cart_line_id is None:
        return OpExecutionOutcome(
            reply_fragment="Couldn't update that item right now.",
            failed=True,
        )
    line = op.lines[0]
    item_name = (op.source_parsed.items[0].item_query if op.source_parsed and op.source_parsed.items else "item")
    try:
        wire = line.to_wire_payload()
        current_qty = wire["qty"]
        try:
            cart_result = await get_cart(cart_id=ctx.cart_id)
            for cart_item in cart_result.get("cart") or []:
                if not isinstance(cart_item, dict):
                    continue
                if str(cart_item.get("lineId") or cart_item.get("_id") or "") == str(cart_line_id):
                    current_qty = int(cart_item.get("qty") or current_qty)
                    break
        except Exception:
            current_qty = wire["qty"]
        result = await update_cart_item(
            line_id=cart_line_id,
            qty=current_qty,
            selected_options=wire["selectedOptions"],
            instructions=wire["instructions"],
            cart_id=ctx.cart_id,
        )
        ctx.cart_id = result["cart_id"]
        ctx.cart_updated = True

        opts = wire.get("selectedOptions") or []
        full_labels = []
        for option in opts:
            if not isinstance(option, dict) or not option.get("optionName"):
                continue
            label = str(option["optionName"]).strip()
            suboption = str(option.get("suboptionName") or "").strip()
            if suboption:
                label = f"{suboption} {label}"
            full_labels.append(label)

        suffix = f" ({', '.join(full_labels)})" if full_labels else ""
        return OpExecutionOutcome(
            reply_fragment=f"Updated {item_name}{suffix}.",
            cart_updated=True,
        )
    except ExpressAPIError as err:
        from app.services.orchestrator import is_out_of_stock_error
        if is_out_of_stock_error(err):
            return OpExecutionOutcome(
                reply_fragment=f"{item_name} is out of stock.",
                failed=True,
            )
        return OpExecutionOutcome(
            reply_fragment=f"Couldn't update {item_name} right now.",
            failed=True,
        )


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


def _fmt_price(price) -> str:
    try:
        return f"L.L {int(float(price or 0)):,}"
    except (TypeError, ValueError):
        return ""


async def _execute_checkout(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move orchestrator helpers to a shared module.
    from app.services.orchestrator import _build_bill
    from app.services.tools import get_cart
    from app.services.session_store import set_checkout_initiated

    result = await get_cart(cart_id=ctx.cart_id)
    ctx.cart_id = result["cart_id"]
    if not result["cart"]:
        return OpExecutionOutcome(reply_fragment="Your cart is empty — nothing to checkout.")
    _build_bill(result["cart"])
    set_session_stage(ctx.session_id, "checkout_summary")
    set_checkout_initiated(ctx.session_id, True)
    return OpExecutionOutcome(
        reply_fragment="Ready to checkout? Here's your order summary.",
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
    from app.services.tools import fetch_menu_items

    try:
        menu_items = await fetch_menu_items()
    except Exception:
        return OpExecutionOutcome(reply_fragment="I couldn't load the menu right now.")

    seen: set = set()
    categories = []
    for item in menu_items:
        cat = item.get("category")
        name = (
            cat.get("name") if isinstance(cat, dict) else str(cat or "")
        ).strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            categories.append(name)
    categories.sort()

    if categories:
        reply = (
            "Here's what we serve:\n"
            + "\n".join(f"- {category}" for category in categories)
        )
        return OpExecutionOutcome(reply_fragment=reply)
    return OpExecutionOutcome(
        reply_fragment="We have a wide selection. What are you in the mood for?"
    )


async def _execute_list_category_items(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    # Phase 5: move fetch_menu_items to a shared module.
    from app.services.tools import fetch_menu_items
    from app.services.session_store import set_last_visible_choices
    from app.services.menu_utils import category_name_from_item, filter_menu_items_by_category_query

    category_query = ""
    if op.source_parsed and op.source_parsed.items:
        first_item = op.source_parsed.items[0]
        category_query = str(first_item.item_query or "").strip().lower()

    if not category_query:
        return OpExecutionOutcome(reply_fragment="Which category are you interested in?")

    try:
        all_items = await fetch_menu_items()
    except Exception:
        return OpExecutionOutcome(reply_fragment="I couldn't load the menu right now.")

    matched = filter_menu_items_by_category_query(all_items, category_query)
    if matched:
        cat_label = category_name_from_item(matched[0]) or category_query.title()
        lines = [
            f"- {item['name']}  ({_fmt_price(item.get('basePrice'))})"
            for item in matched[:12]
            if item.get("name")
        ]
        reply = f"Here's what we have in {cat_label}:\n" + "\n".join(lines)
        if len(matched) > 12:
            reply += f"\n...and {len(matched) - 12} more."
        set_last_visible_choices(
            ctx.session_id, matched[:12], source="list_category_items"
        )
        return OpExecutionOutcome(reply_fragment=reply)

    set_last_visible_choices(ctx.session_id, [], source="list_category_items")
    return OpExecutionOutcome(
        reply_fragment=f"I couldn't find items in '{category_query}'."
    )


async def _execute_recommendation_query(op: CompiledOperation, ctx: ExecutionContext) -> OpExecutionOutcome:
    """
    Inline recommendation renderer for passive drain.
    Mirrors orchestrator recommendation_query behavior without setting stage.
    """
    from app.services.suggestions import (
        extract_recommendation_category,
        extract_recommendation_query_terms,
        filter_by_category,
        suggest_complementary_items,
        suggest_popular_items,
    )
    from app.services.upsell import get_upsell_suggestions
    from app.services.tools import fetch_menu_items, fetch_featured_items, get_cart
    from app.services.session_store import set_last_visible_choices

    normalized_message = ""
    if op.source_parsed and op.source_parsed.items:
        normalized_message = op.source_parsed.items[0].item_query or ""

    try:
        featured_items = await fetch_featured_items()
        cart_result = await get_cart(cart_id=ctx.cart_id)
        cart_items = cart_result["cart"]
        menu_items = await fetch_menu_items()
    except Exception:
        return OpExecutionOutcome(
            reply_fragment="I couldn't load recommendations right now."
        )

    rec_category = extract_recommendation_category(normalized_message)
    rec_query_terms = extract_recommendation_query_terms(normalized_message)
    menu_items_by_name = {
        (item.get("name") or "").strip().lower(): item
        for item in menu_items
        if isinstance(item, dict) and item.get("name")
    }
    popular = suggest_popular_items(featured_items, limit=6)
    complementary = []
    if cart_items:
        complementary = suggest_complementary_items(
            menu_items, cart_items[-1], limit=4
        )
    upsell = await get_upsell_suggestions(
        session_id=ctx.session_id,
        intent="recommendation_query",
        cart_items=cart_items,
        menu_items=menu_items,
        anchor_menu_item=cart_items[-1] if cart_items else None,
    )
    raw_suggestions = popular + complementary + upsell
    all_suggestions = raw_suggestions

    if rec_category or rec_query_terms:
        all_suggestions = filter_by_category(
            all_suggestions, rec_category, menu_items_by_name, rec_query_terms
        )

    seen_names: set[str] = set()
    filtered: list[dict] = []
    for suggestion in all_suggestions:
        name = (suggestion.get("item_name") or "").strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())
        filtered.append(suggestion)
        if len(filtered) == 4:
            break

    set_last_visible_choices(ctx.session_id, filtered, source="recommendation")

    if filtered:
        lines = [f"- {suggestion['item_name']}" for suggestion in filtered]
        return OpExecutionOutcome(
            reply_fragment="Here are some picks you might like:\n"
            + "\n".join(lines)
        )
    return OpExecutionOutcome(
        reply_fragment="I can help with suggestions once you add an item to your cart."
    )


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
    "recommendation_query": _execute_recommendation_query,
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
        "list_category_items": "list_category_items_done",
        "list_categories": "list_categories_done",
        "recommendation_query": "recommendation_done",
        "describe_item": "describe_done",
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
    from app.services.slot_filler import (
        auto_fill_single_option_groups,
        build_group_prompt,
        build_open_customization_prompt,
        fill_slots_from_text,
        find_hidden_option_name,
        get_empty_required_groups,
        init_slot_state,
    )
    from app.services.session_store import (
        set_guided_order_active_group_id,
        set_guided_order_groups_meta,
        set_guided_order_slot_state,
        set_guided_order_state,
    )
    from app.services.tools import fetch_menu_item_detail

    matched_item = clarification.matched_menu_item or {}
    source_item = clarification.source_item
    menu_item_id = matched_item.get("id") or matched_item.get("_id")
    item_name = (
        matched_item.get("name")
        or (source_item.item_query if source_item else "your item")
    )
    quantity = int(source_item.quantity or 1) if source_item else 1

    # Fetch full menu detail for groups_meta.
    if (
        isinstance(matched_item.get("variantGroupDetails"), list)
        or isinstance(matched_item.get("variants"), list)
    ):
        menu_detail = matched_item
    else:
        menu_detail = await fetch_menu_item_detail(menu_item_id)

    groups_meta = []
    if isinstance(menu_detail, dict):
        groups_meta = (
            menu_detail.get("variantGroupDetails")
            or menu_detail.get("variants")
            or []
        )
    groups_meta = [
        {**group, "isActive": group.get("isActive", True)}
        if isinstance(group, dict)
        else group
        for group in groups_meta
    ]

    # Initialize slot state.
    slot_state = init_slot_state(groups_meta)

    # Pre-fill from source_item modifiers — process each separately so that
    # ["Small", "Caramel Drizzle"] doesn't collapse into "Small Caramel Drizzle",
    # which would cause _find_best_option to match only the highest-specificity
    # token and drop the rest (including same-group multi-selects like ["Mint", "Rocca"]).
    applied: list[str] = []
    unmatched: list[str] = []
    if source_item and source_item.modifiers:
        for _modifier in source_item.modifiers:
            _cleaned = str(_modifier or "").strip()
            if not _cleaned:
                continue
            slot_state, _mod_applied, _mod_unmatched = fill_slots_from_text(
                _cleaned, groups_meta, slot_state
            )
            applied.extend(_mod_applied)
            unmatched.extend(_mod_unmatched)
        if applied:
            logger.info({
                "stage": "guided_ordering_prefill",
                "session_id": ctx.session_id,
                "item_name": item_name,
                "applied": applied,
                "unmatched": unmatched,
            })

    # Auto-select required groups that have exactly one active option.
    slot_state, _auto_applied = auto_fill_single_option_groups(slot_state, groups_meta)
    if _auto_applied:
        applied.extend(_auto_applied)

    # Store in session.
    set_guided_order_slot_state(ctx.session_id, slot_state)
    set_guided_order_groups_meta(ctx.session_id, groups_meta)
    set_guided_order_item_id(ctx.session_id, menu_item_id)
    set_guided_order_item_name(ctx.session_id, item_name)
    set_guided_order_quantity(ctx.session_id, quantity)
    set_session_stage(ctx.session_id, "guided_ordering")

    # Persist remaining ops for drain after guided ordering completes.
    if remaining_ops:
        set_pending_operations(
            ctx.session_id,
            [op.model_dump() for op in remaining_ops],
        )
        logger.info({
            "stage": "guided_ordering_pending_ops_queued",
            "session_id": ctx.session_id,
            "item_name": item_name,
            "pending_count": len(remaining_ops),
            "pending_ops": [
                {
                    "intent": op.intent,
                    "items": [
                        item.item_query
                        for item in (op.source_parsed.items if op.source_parsed else [])
                    ],
                    "has_lines": bool(op.lines),
                }
                for op in remaining_ops
            ],
        })

    # Build unavailability note from any pre-fill unmatched modifiers.
    _unavail_notes: list[str] = []
    for _u in unmatched:
        _hidden = find_hidden_option_name(_u, groups_meta)
        if _hidden:
            _unavail_notes.append(f"{_hidden} is not currently available")
    _unavail_prefix = (". ".join(_unavail_notes) + ".\n\n") if _unavail_notes else ""

    # Determine first prompt.
    empty_required = get_empty_required_groups(slot_state, groups_meta)
    if empty_required:
        set_guided_order_state(ctx.session_id, "required")
        set_guided_order_active_group_id(
            ctx.session_id, empty_required[0].get("groupId")
        )
        return _unavail_prefix + build_group_prompt(item_name, empty_required[0], is_first=True)
    else:
        set_guided_order_active_group_id(ctx.session_id, None)
        _has_optional = any(
            isinstance(g, dict)
            and g.get("isActive") is True
            and g.get("isRequired") is not True
            and any(
                isinstance(o, dict)
                and bool(o.get("name"))
                and o.get("isActive") is not False
                for o in (g.get("options") or [])
            )
            for g in groups_meta
        )
        if _has_optional:
            set_guided_order_state(ctx.session_id, "open")
        else:
            set_guided_order_state(ctx.session_id, "instructions")
        return _unavail_prefix + build_open_customization_prompt(item_name, slot_state, groups_meta)


def _requeue_guided_clarification(
    clarification: CompileNeedsClarification,
) -> CompiledOperation | None:
    if clarification.reason != "missing_required_group":
        return None

    matched_item = clarification.matched_menu_item or {}
    source_item = clarification.source_item
    item_name = str(
        matched_item.get("name")
        or (source_item.item_query if source_item else "")
        or ""
    ).strip()
    if not item_name:
        return None

    quantity = int(source_item.quantity or 1) if source_item else 1
    requeued_item = (
        source_item.model_copy(update={"item_query": item_name, "quantity": quantity})
        if isinstance(source_item, ParsedItemRequest)
        else ParsedItemRequest(item_query=item_name, quantity=quantity)
    )
    return CompiledOperation(
        intent="add_items",
        lines=[],
        source_parsed=ParsedOperation(
            intent="add_items",
            items=[requeued_item],
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────


async def execute_compiled_operations(
    compile_results: list[CompileResult] | None = None,
    *,
    session_id: str,
    cart_id: str | None,
    session: dict,
    auth_cookie: str | None,
    operations: list[CompiledOperation] | None = None,
    clarifications: list[CompileNeedsClarification] | None = None,
    failures: list[CompileFailure] | None = None,
) -> ExecutionResult:
    """
    Execute a sequence of ordered compile results against the cart backend.

    Behavior:
      - Compile results execute in order. Each success produces a reply fragment.
      - CompileFailure results are rendered as failure messages (no short-circuit
        except for clear_cart failures, which do short-circuit).
      - CompileNeedsClarification(reason="missing_required_group") triggers
        guided ordering after earlier ordered results have already been
        processed. Remaining successful ops are persisted and this function
        returns with needs_followup=True.
      - CompileNeedsClarification(reason="ambiguous_item") returns the
        disambiguation prompt.
      - CompileNeedsClarification(reason="unmatched_modifiers") adds the item
        anyway and appends a note about unmatched modifiers.

    Returns ExecutionResult with a joined reply and metadata.
    """
    if compile_results is None:
        compile_results = []
        compile_results.extend(CompileFailure(**failure.__dict__) for failure in (failures or []))
        compile_results.extend(CompileNeedsClarification(**clarification.__dict__) for clarification in (clarifications or []))
        compile_results.extend(CompileSuccess(operation=op) for op in (operations or []))

    ctx = ExecutionContext(
        session_id=session_id,
        cart_id=cart_id,
        session=session,
        auth_cookie=auth_cookie,
    )

    reply_parts: list[str] = []
    all_suggestions: list[dict] = []
    all_defaults: list[str] = []
    first_size_upgrade: dict | None = None
    intent_for_response = "unknown"

    for index, result in enumerate(compile_results):
        if isinstance(result, CompileFailure):
            item_name = (result.source_item.item_query if result.source_item else None) or "item"
            msg = _failure_to_reply(result, item_name)
            reply_parts.append(msg)
            continue

        if isinstance(result, CompileNeedsClarification):
            if result.reason == "missing_required_group":
                remaining_ops: list[CompiledOperation] = []
                for pending in compile_results[index + 1 :]:
                    if isinstance(pending, CompileSuccess):
                        pending_op = pending.operation
                        if pending_op.intent in _INFO_BEFORE_GUIDED_INTENTS:
                            handler = _HANDLERS.get(pending_op.intent)
                            if handler is None:
                                logger.warning({"stage": "executor_unknown_intent", "intent": pending_op.intent})
                                continue
                            outcome = await handler(pending_op, ctx)
                            if outcome.reply_fragment:
                                reply_parts.append(outcome.reply_fragment)
                            if outcome.cart_updated:
                                ctx.cart_updated = True
                            all_suggestions.extend(outcome.suggestions)
                            all_defaults.extend(outcome.defaults_used)
                            if first_size_upgrade is None and outcome.size_upgrade is not None:
                                first_size_upgrade = outcome.size_upgrade
                            continue
                        remaining_ops.append(pending_op)
                    elif isinstance(pending, CompileNeedsClarification):
                        requeued_op = _requeue_guided_clarification(pending)
                        if requeued_op is not None:
                            remaining_ops.append(requeued_op)
                prompt = await _setup_guided_ordering(result, ctx, remaining_ops)
                full_reply = ("\n\n".join(reply_parts) + "\n\n" + prompt).strip() if reply_parts else prompt
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

            if result.reason == "ambiguous_item":
                from app.services.item_clarification import build_menu_choice_prompt
                from app.services.session_store import set_last_visible_choices

                for pending in compile_results[index + 1 :]:
                    if not isinstance(pending, CompileSuccess):
                        continue

                    pending_op = pending.operation
                    handler = _HANDLERS.get(pending_op.intent)
                    if handler is None:
                        logger.warning({"stage": "executor_unknown_intent", "intent": pending_op.intent})
                        continue

                    outcome = await handler(pending_op, ctx)
                    if outcome.reply_fragment:
                        reply_parts.append(outcome.reply_fragment)
                    if outcome.cart_updated:
                        ctx.cart_updated = True
                    all_suggestions.extend(outcome.suggestions)
                    all_defaults.extend(outcome.defaults_used)
                    if first_size_upgrade is None and outcome.size_upgrade is not None:
                        first_size_upgrade = outcome.size_upgrade

                candidates = result.candidates or []
                item_name = (result.source_item.item_query if result.source_item else None) or "item"
                prompt = build_menu_choice_prompt(item_name, candidates)
                full_reply = ("\n\n".join(reply_parts) + "\n\n" + prompt).strip() if reply_parts else prompt
                set_last_visible_choices(ctx.session_id, candidates, source="menu_choice")
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

            if result.reason == "unmatched_modifiers":
                unmatched = result.unmatched_modifiers or []
                if unmatched:
                    note = f"Note: I couldn't match {', '.join(repr(m) for m in unmatched)} to any option - want me to add that as a note?"
                    reply_parts.append(note)
                continue

            if result.reason == "follow_up_unresolvable":
                reply_parts.append("I'm not sure which item you're referring to. Could you specify the item name?")
                continue

        op = result.operation
        if op.intent not in _PASSIVE_EXECUTOR_INTENTS or intent_for_response == "unknown":
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
        if first_size_upgrade is None and outcome.size_upgrade is not None:
            first_size_upgrade = outcome.size_upgrade

        if op.intent == "clear_cart" and outcome.failed:
            break

    final_reply = "\n\n".join(p for p in reply_parts if p)
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
        size_upgrade=first_size_upgrade,
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
