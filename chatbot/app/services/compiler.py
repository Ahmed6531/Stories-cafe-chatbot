"""
Compiler: ParsedOperation -> CompiledOperation.

Resolves user-language item requests into backend-ready cart lines by:
  1. Resolving follow-up references against session history.
  2. Fuzzy-matching item_query against the menu catalog.
  3. Detecting ambiguity and returning a clarification result.
  4. Resolving modifiers against menu option groups.
  5. Partitioning unmatched modifiers into negations (-> instructions) and
     actionable-unknowns (-> clarification suggestions).
  6. Assembling CompiledCartLine objects with exact wire-format parity.

The executor layer (orchestrator) consumes CompileResult and produces the
user-facing reply. The compiler never writes to the cart, never talks to
the LLM, and never calls the backend directly - menu fetch is the only
external call.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal

from app.schemas.actions import (
    CompiledCartLine,
    CompiledOperation,
    CompiledOption,
    ParsedItemRequest,
    ParsedOperation,
)
from app.services.item_clarification import (
    find_ambiguous_menu_matches,
)
from app.services.menu_utils import (
    is_menu_item_available,
    normalize_modifier_text,
    split_instruction_fragments,
)
from app.services import tools as tools_service

logger = logging.getLogger(__name__)


@dataclass
class CompileSuccess:
    operation: CompiledOperation
    kind: Literal["ok"] = "ok"


@dataclass
class CompileNeedsClarification:
    kind: Literal["needs_clarification"] = "needs_clarification"
    reason: Literal[
        "ambiguous_item",
        "missing_required_group",
        "follow_up_unresolvable",
        "unmatched_modifiers",
    ] = "ambiguous_item"
    candidates: list[dict] = field(default_factory=list)
    missing_groups: list[dict] = field(default_factory=list)
    unmatched_modifiers: list[str] = field(default_factory=list)
    source_item: ParsedItemRequest | None = None
    matched_menu_item: dict | None = None


@dataclass
class CompileFailure:
    kind: Literal["failed"] = "failed"
    reason: Literal["item_not_found", "item_unavailable", "menu_item_id_missing", "internal_error"] = "internal_error"
    source_item: ParsedItemRequest | None = None
    message: str = ""


CompileResult = CompileSuccess | CompileNeedsClarification | CompileFailure

_PASSIVE_COMPILE_INTENTS = frozenset({
    "view_cart",
    "list_category_items",
    "list_categories",
    "recommendation_query",
})


def _coerce_menu_item_id(value) -> int | str | None:
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return int(cleaned)
        except ValueError:
            return cleaned
    try:
        return int(value)
    except (TypeError, ValueError):
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


def _get_cart_items(cart: dict | None) -> list[dict]:
    if isinstance(cart, dict):
        for key in ("cart", "items"):
            items = cart.get(key)
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
    return []


def _cart_candidates(cart_items: list[dict], matched_item: dict) -> list[dict]:
    matched_name = normalize_modifier_text(matched_item.get("name"))
    matched_menu_item_id = _coerce_menu_item_id(matched_item.get("menuItemId"))
    candidates = []
    for item in cart_items:
        same_name = normalize_modifier_text(item.get("name")) == matched_name
        same_id = matched_menu_item_id is not None and _coerce_menu_item_id(item.get("menuItemId")) == matched_menu_item_id
        if same_name or same_id:
            candidates.append(item)
    return candidates


def _query_disambiguates_cart_item(item_query: str, candidate: dict) -> bool:
    query = normalize_modifier_text(item_query)
    if not query:
        return False
    option_names = [
        normalize_modifier_text(option.get("optionName") or option.get("name"))
        for option in (candidate.get("selectedOptions") or [])
        if isinstance(option, dict)
    ]
    return any(option_name and option_name in query for option_name in option_names)


def _compiled_options_from_cart(candidate: dict) -> list[CompiledOption]:
    compiled = []
    for option in candidate.get("selectedOptions") or []:
        if not isinstance(option, dict) or not option.get("optionName"):
            continue
        compiled.append(
            CompiledOption(
                optionName=str(option.get("optionName")),
                suboptionName=(str(option.get("suboptionName")) if option.get("suboptionName") else None),
                groupId=(str(option.get("groupId")) if option.get("groupId") else None),
            )
        )
    return compiled


def _compiled_options_from_session(selected_options: list[dict]) -> list[CompiledOption]:
    compiled: list[CompiledOption] = []
    for option in selected_options:
        if not isinstance(option, dict) or not option.get("optionName"):
            continue
        compiled.append(
            CompiledOption(
                optionName=str(option.get("optionName")),
                suboptionName=(str(option.get("suboptionName")) if option.get("suboptionName") else None),
                groupId=(str(option.get("groupId")) if option.get("groupId") else None),
            )
        )
    return compiled


def _resolve_follow_up_item(item: ParsedItemRequest, intent: str, session: dict) -> ParsedItemRequest | CompileNeedsClarification:
    if not item.follow_up_ref or item.item_query.strip():
        return item
    session_items = session.get("last_items") or []
    if not isinstance(session_items, list) or not session_items:
        return CompileNeedsClarification(reason="follow_up_unresolvable", source_item=item)
    session_item = session_items[0] if isinstance(session_items[0], dict) else {}
    item_query = str(session_item.get("item_name") or "").strip()
    if not item_query:
        return CompileNeedsClarification(reason="follow_up_unresolvable", source_item=item)
    quantity = item.quantity
    if intent in {"add_items", "repeat_order"}:
        quantity = quantity if quantity is not None else 1
    elif intent not in {"update_quantity"} and quantity is None:
        quantity = session_item.get("quantity")
    return item.model_copy(update={"item_query": item_query, "quantity": quantity})


async def _get_menu_detail(
    matched_item: dict,
    menu_item_id: int | str,
    menu_items: list[dict] | None = None,
) -> dict | None:
    if isinstance(matched_item.get("variantGroupDetails"), list) or isinstance(matched_item.get("variants"), list):
        return matched_item
    for menu_item in menu_items or []:
        if not isinstance(menu_item, dict):
            continue
        candidate_id = _coerce_menu_item_id(menu_item.get("id") or menu_item.get("_id"))
        if candidate_id == menu_item_id:
            if isinstance(menu_item.get("variantGroupDetails"), list) or isinstance(menu_item.get("variants"), list):
                return menu_item
            if not menu_item.get("variantGroups"):
                return menu_item
            break
    if not matched_item.get("variantGroups"):
        return matched_item
    return await tools_service.fetch_menu_item_detail(menu_item_id)


def _groups_meta_from_menu_detail(menu_detail: dict | None) -> list[dict]:
    groups_meta = []
    if isinstance(menu_detail, dict):
        groups_meta = (
            menu_detail.get("variantGroupDetails")
            or menu_detail.get("variants")
            or []
        )
    return [
        {**group, "isActive": group.get("isActive", True)}
        if isinstance(group, dict)
        else group
        for group in groups_meta
    ]


def _compiled_options_from_slot_state(slot_state: dict, groups_meta: list[dict]) -> list[CompiledOption]:
    from app.services.slot_filler import slot_state_to_selected_options

    selected_options_wire = slot_state_to_selected_options(slot_state, groups_meta)
    return [
        CompiledOption(
            optionName=option["optionName"],
            suboptionName=option.get("suboptionName"),
            groupId=option.get("groupId"),
        )
        for option in selected_options_wire
    ]


def _group_tokens(group: dict) -> set[str]:
    raw_label = " ".join(
        str(group.get(key) or "")
        for key in ("customerLabel", "name", "adminName", "groupId")
    )
    tokens = set(normalize_modifier_text(raw_label).split())
    tokens.update(
        token[:-1]
        for token in list(tokens)
        if token.endswith("s") and len(token) > 3
    )
    return tokens


def _groups_meta_for_fragment(groups_meta: list[dict], fragment: str) -> list[dict]:
    fragment_tokens = set(normalize_modifier_text(fragment).split())
    if not fragment_tokens:
        return groups_meta
    return sorted(
        groups_meta,
        key=lambda group: (
            0 if isinstance(group, dict) and fragment_tokens & _group_tokens(group) else 1
        ),
    )


def _is_negation_text(value: str) -> bool:
    normalized = normalize_modifier_text(value)
    return normalized.startswith(("remove ", "no ", "without ", "take out "))


def _fill_slot_state_from_fragments(
    fragments: list[str],
    groups_meta: list[dict],
    slot_state: dict,
) -> tuple[dict, list[str], list[str]]:
    from app.services.slot_filler import fill_slots_from_text

    applied: list[str] = []
    unmatched: list[str] = []
    for fragment in fragments:
        cleaned = str(fragment or "").strip()
        if not cleaned:
            continue
        slot_state, fragment_applied, fragment_unmatched = fill_slots_from_text(
            cleaned,
            _groups_meta_for_fragment(groups_meta, cleaned),
            slot_state,
        )
        applied.extend(fragment_applied)
        unmatched.extend(fragment_unmatched)
    return slot_state, applied, unmatched


def _build_ambiguous_candidates(candidates: list[dict]) -> list[dict]:
    return [
        {
            "item_name": candidate.get("name"),
            "menu_item_id": candidate.get("id") or candidate.get("_id") or candidate.get("menuItemId"),
            "selectedOptions": candidate.get("selectedOptions") if isinstance(candidate.get("selectedOptions"), list) else [],
        }
        for candidate in candidates
        if isinstance(candidate, dict)
    ]


async def _compile_add_or_describe_item(
    parsed: ParsedOperation,
    item: ParsedItemRequest,
    *,
    session: dict,
    menu_items: list[dict],
) -> CompileResult:
    resolved_item = _resolve_follow_up_item(item, parsed.intent, session)
    if isinstance(resolved_item, CompileNeedsClarification):
        return resolved_item
    session_items = session.get("last_items") or []
    session_item = (
        session_items[0]
        if isinstance(session_items, list) and session_items and isinstance(session_items[0], dict)
        else {}
    )
    prev_selected_options = session_item.get("selected_options") or []
    prev_instructions = str(session_item.get("instructions") or "").strip()
    matched_item = await tools_service.find_menu_item_by_name(
        menu_items,
        resolved_item.item_query,
        include_unavailable=True,
    )
    if matched_item:
        query_normalized = resolved_item.item_query.strip().lower()
        matched_name_normalized = str(matched_item.get("name") or "").strip().lower()
        if query_normalized != matched_name_normalized:
            candidates = find_ambiguous_menu_matches(menu_items, resolved_item.item_query)
            if len(candidates) > 1:
                return CompileNeedsClarification(
                    reason="ambiguous_item",
                    candidates=_build_ambiguous_candidates(candidates),
                    source_item=resolved_item,
                )
    if not matched_item:
        candidates = find_ambiguous_menu_matches(menu_items, resolved_item.item_query)
        if len(candidates) > 1:
            return CompileNeedsClarification(
                reason="ambiguous_item",
                candidates=_build_ambiguous_candidates(candidates),
                source_item=resolved_item,
            )
        return CompileFailure(reason="item_not_found", source_item=resolved_item)

    if not is_menu_item_available(matched_item):
        return CompileFailure(reason="item_unavailable", source_item=resolved_item)
    menu_item_id = _coerce_menu_item_id(matched_item.get("id") or matched_item.get("_id"))
    if menu_item_id is None:
        return CompileFailure(reason="menu_item_id_missing", source_item=resolved_item)
    if item.follow_up_ref and prev_selected_options:
        compiled_prev_options = _compiled_options_from_session(prev_selected_options)
        if compiled_prev_options:
            return CompileSuccess(
                operation=CompiledOperation(
                    intent=parsed.intent,
                    lines=[
                        CompiledCartLine(
                            menuItemId=menu_item_id,
                            qty=max(1, int(resolved_item.quantity or 1)),
                            selectedOptions=compiled_prev_options,
                            instructions=prev_instructions,
                        )
                    ],
                    source_parsed=ParsedOperation(intent=parsed.intent, items=[resolved_item]),
                )
            )
    menu_detail = await _get_menu_detail(matched_item, menu_item_id, menu_items)
    variant_refs = matched_item.get("variantGroups") if isinstance(matched_item.get("variantGroups"), list) else []
    variant_details = (
        menu_detail.get("variantGroupDetails")
        if isinstance(menu_detail, dict) and isinstance(menu_detail.get("variantGroupDetails"), list)
        else menu_detail.get("variants")
        if isinstance(menu_detail, dict) and isinstance(menu_detail.get("variants"), list)
        else []
    )
    logger.info({
        "stage": "add_item_compile_menu_detail",
        "intent": parsed.intent,
        "item_query": resolved_item.item_query,
        "requested_quantity": resolved_item.quantity,
        "modifiers": resolved_item.modifiers,
        "use_defaults": resolved_item.use_defaults,
        "matched_menu_item_id": menu_item_id,
        "matched_menu_item_name": matched_item.get("name"),
        "variant_group_refs_count": len(variant_refs),
        "variant_group_details_count": len(variant_details),
    })
    qty = int(resolved_item.quantity or 1)
    if qty <= 0:
        return CompileFailure(
            reason="internal_error",
            source_item=resolved_item,
            message="Quantity must be at least 1.",
        )
    if parsed.intent == "add_items":
        if resolved_item.use_defaults:
            from app.services.item_clarification import apply_smart_defaults
            from app.services.slot_filler import (
                get_empty_required_groups,
                init_slot_state,
            )

            legacy_item = {
                "item_name": resolved_item.item_query,
                "quantity": resolved_item.quantity,
                "size": None,
                "options": {"milk": None, "sugar": None},
                "addons": list(resolved_item.modifiers or []),
                "instructions": "; ".join(
                    str(note).strip()
                    for note in resolved_item.notes
                    if str(note).strip()
                ),
            }
            defaulted_item, defaults_used_list, still_required = apply_smart_defaults(
                legacy_item,
                menu_detail,
            )
            merged_modifiers: list[str] = []
            size_value = str(defaulted_item.get("size") or "").strip()
            if size_value:
                merged_modifiers.append(size_value)
            options = defaulted_item.get("options") if isinstance(defaulted_item.get("options"), dict) else {}
            milk_value = str(options.get("milk") or "").strip()
            if milk_value:
                merged_modifiers.append(
                    milk_value if "milk" in milk_value.lower() else f"{milk_value} milk"
                )
            for addon in defaulted_item.get("addons") or []:
                cleaned_addon = str(addon or "").strip()
                if cleaned_addon:
                    merged_modifiers.append(cleaned_addon)
            merged_notes = split_instruction_fragments(
                defaulted_item.get("instructions") or ""
            )
            groups_meta = _groups_meta_from_menu_detail(menu_detail)
            slot_state = init_slot_state(groups_meta)
            slot_state, applied, unmatched = _fill_slot_state_from_fragments(
                list(merged_modifiers)
                + [str(note) for note in merged_notes if str(note).strip()],
                groups_meta,
                slot_state,
            )
            empty_required = get_empty_required_groups(slot_state, groups_meta)
            if still_required or empty_required:
                return CompileNeedsClarification(
                    reason="missing_required_group",
                    missing_groups=empty_required or still_required,
                    source_item=resolved_item,
                    matched_menu_item=matched_item,
                )
            selected_options = _compiled_options_from_slot_state(
                slot_state, groups_meta
            )
            instructions = "; ".join(str(note) for note in merged_notes if str(note).strip())
            return CompileSuccess(
                operation=CompiledOperation(
                    intent=parsed.intent,
                    lines=[
                        CompiledCartLine(
                            menuItemId=menu_item_id,
                            qty=max(1, int(resolved_item.quantity or 1)),
                            selectedOptions=selected_options,
                            instructions=instructions,
                            unmatched_modifiers=unmatched,
                            defaults_used=defaults_used_list,
                        )
                    ],
                    source_parsed=ParsedOperation(intent=parsed.intent, items=[resolved_item]),
                )
            )

    from app.services.slot_filler import (
        get_empty_required_groups,
        init_slot_state,
    )

    groups_meta = _groups_meta_from_menu_detail(menu_detail)
    slot_state = init_slot_state(groups_meta)
    if resolved_item.modifiers or resolved_item.notes:
        slot_state, applied, unmatched = _fill_slot_state_from_fragments(
            list(resolved_item.modifiers)
            + [str(note) for note in resolved_item.notes if str(note).strip()],
            groups_meta,
            slot_state,
        )
    else:
        applied = []
        unmatched = []

    empty_required = get_empty_required_groups(slot_state, groups_meta)
    if parsed.intent == "add_items" and empty_required:
        return CompileNeedsClarification(
            reason="missing_required_group",
            missing_groups=empty_required,
            source_item=resolved_item,
            matched_menu_item=matched_item,
        )

    selected_options = _compiled_options_from_slot_state(slot_state, groups_meta)
    instruction_parts = [
        str(note).strip()
        for note in resolved_item.notes
        if str(note).strip()
    ]
    instruction_parts.extend(
        str(modifier).strip()
        for modifier in resolved_item.modifiers
        if str(modifier).strip() and _is_negation_text(str(modifier))
    )
    instructions = "; ".join(dict.fromkeys(instruction_parts))
    unmatched = [
        fragment
        for fragment in unmatched
        if not _is_negation_text(fragment)
    ]
    line = CompiledCartLine(
        menuItemId=menu_item_id,
        qty=qty,
        selectedOptions=selected_options,
        instructions=instructions,
        unmatched_modifiers=unmatched,
    )
    return CompileSuccess(
        operation=CompiledOperation(
            intent=parsed.intent,
            lines=[line],
            source_parsed=ParsedOperation(intent=parsed.intent, items=[resolved_item]),
        )
    )


async def _compile_cart_target_operation(parsed: ParsedOperation, session: dict, cart: dict | None, menu_items: list[dict]) -> CompileResult:
    if cart is None:
        return CompileFailure(reason="internal_error", message="cart required for remove/update")
    cart_items = _get_cart_items(cart)
    target_item = parsed.items[0] if parsed.items else ParsedItemRequest()
    resolved_item = _resolve_follow_up_item(target_item, parsed.intent, session)
    if isinstance(resolved_item, CompileNeedsClarification):
        return resolved_item
    normalized_target_query = normalize_modifier_text(resolved_item.item_query)
    if (
        parsed.intent == "remove_item"
        and resolved_item.quantity is None
        and (
            normalized_target_query.startswith("all ")
            or normalized_target_query.startswith("every ")
        )
    ):
        return CompileSuccess(
            operation=CompiledOperation(
                intent=parsed.intent,
                lines=[],
                cart_line_id=None,
                source_parsed=parsed,
            )
        )
    matched_cart_item = await tools_service.find_menu_item_by_name(
        cart_items,
        resolved_item.item_query,
        include_unavailable=True,
    )
    if not matched_cart_item:
        return CompileFailure(
            reason="item_not_found",
            source_item=resolved_item,
            message=f"I couldn't find '{resolved_item.item_query}' in your cart.",
        )
    _cart_query_norm = resolved_item.item_query.strip().lower()
    _cart_match_norm = str(matched_cart_item.get("name") or "").strip().lower()
    if _cart_query_norm != _cart_match_norm:
        _cart_ambiguous = find_ambiguous_menu_matches(cart_items, resolved_item.item_query)
        if len(_cart_ambiguous) > 1:
            return CompileNeedsClarification(
                reason="ambiguous_item",
                candidates=_build_ambiguous_candidates(_cart_ambiguous),
                source_item=resolved_item,
            )
    candidates = _cart_candidates(cart_items, matched_cart_item)
    distinct_variants = {
        tuple(
            (
                str(option.get("optionName") or ""),
                str(option.get("suboptionName") or ""),
                str(option.get("groupId") or ""),
            )
            for option in (candidate.get("selectedOptions") or [])
            if isinstance(option, dict)
        )
        for candidate in candidates
    }
    if len(candidates) > 1 and len(distinct_variants) > 1:
        disambiguated = [candidate for candidate in candidates if _query_disambiguates_cart_item(resolved_item.item_query, candidate)]
        if len(disambiguated) == 1:
            matched_cart_item = disambiguated[0]
        else:
            return CompileNeedsClarification(
                reason="ambiguous_item",
                candidates=_build_ambiguous_candidates(candidates),
                source_item=resolved_item,
            )
    line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
    if line_id is None:
        return CompileFailure(reason="internal_error", source_item=resolved_item, message="cart line id missing")
    menu_item_id = _coerce_menu_item_id(matched_cart_item.get("menuItemId"))
    if menu_item_id is None:
        fallback_match = await tools_service.find_menu_item_by_name(menu_items, matched_cart_item.get("name") or resolved_item.item_query)
        menu_item_id = _coerce_menu_item_id((fallback_match or {}).get("id") or (fallback_match or {}).get("_id"))
    if menu_item_id is None:
        return CompileFailure(reason="menu_item_id_missing", source_item=resolved_item)
    qty = resolved_item.quantity if parsed.intent == "update_quantity" else (resolved_item.quantity or int(matched_cart_item.get("qty") or 1))
    if parsed.intent == "update_quantity" and qty is not None and int(qty) <= 0:
        return CompileFailure(
            reason="internal_error",
            source_item=resolved_item,
            message="Quantity must be at least 1.",
        )
    line = CompiledCartLine(
        menuItemId=menu_item_id,
        qty=max(1, int(qty or 1)),
        selectedOptions=_compiled_options_from_cart(matched_cart_item),
        instructions=str(matched_cart_item.get("instructions") or "").strip(),
    )
    return CompileSuccess(
        operation=CompiledOperation(
            intent=parsed.intent,
            lines=[line],
            cart_line_id=str(line_id),
            source_parsed=parsed,
        )
    )


async def _compile_update_item_operation(
    parsed: ParsedOperation,
    session: dict,
    cart: dict | None,
    menu_items: list[dict],
) -> CompileResult:
    if cart is None:
        return CompileFailure(reason="internal_error", message="cart required for update_item")

    target_item = parsed.items[0] if parsed.items else ParsedItemRequest()
    resolved_item = _resolve_follow_up_item(target_item, parsed.intent, session)
    if isinstance(resolved_item, CompileNeedsClarification):
        return resolved_item

    item_query = resolved_item.item_query.strip()
    if not item_query:
        return CompileFailure(reason="internal_error", message="no item specified")

    cart_items = _get_cart_items(cart)
    matched_cart_item = await tools_service.find_menu_item_by_name(
        cart_items,
        item_query,
        include_unavailable=True,
    )
    if not matched_cart_item:
        return CompileFailure(reason="item_not_found", source_item=resolved_item)

    line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
    if line_id is None:
        return CompileFailure(reason="internal_error", source_item=resolved_item, message="cart line id missing")

    menu_item_id = _coerce_menu_item_id(matched_cart_item.get("menuItemId"))
    if menu_item_id is None:
        _fallback_query = str(matched_cart_item.get("name") or item_query)
        fallback_match = await tools_service.find_menu_item_by_name(
            menu_items,
            _fallback_query,
        )
        if fallback_match:
            _fb_query_norm = _fallback_query.strip().lower()
            _fb_name_norm = str(fallback_match.get("name") or "").strip().lower()
            if _fb_query_norm != _fb_name_norm:
                _fb_candidates = find_ambiguous_menu_matches(menu_items, _fallback_query)
                if len(_fb_candidates) > 1:
                    return CompileNeedsClarification(
                        reason="ambiguous_item",
                        candidates=_build_ambiguous_candidates(_fb_candidates),
                        source_item=resolved_item,
                    )
        menu_item_id = _coerce_menu_item_id((fallback_match or {}).get("id") or (fallback_match or {}).get("_id"))
    if menu_item_id is None:
        return CompileFailure(reason="menu_item_id_missing", source_item=resolved_item)

    menu_detail = await _get_menu_detail(matched_cart_item, menu_item_id, menu_items)

    from app.services.slot_filler import reconstruct_slot_state_from_cart

    groups_meta = _groups_meta_from_menu_detail(menu_detail)
    slot_state = reconstruct_slot_state_from_cart(
        matched_cart_item.get("selectedOptions") or [],
        groups_meta,
    )
    fragments = (
        list(resolved_item.modifiers)
        + [str(note) for note in resolved_item.notes if str(note).strip()]
    )
    if any(str(fragment).strip() for fragment in fragments):
        slot_state, applied, unmatched = _fill_slot_state_from_fragments(
            fragments,
            groups_meta,
            slot_state,
        )
    else:
        unmatched = []

    selected_options = _compiled_options_from_slot_state(slot_state, groups_meta)
    existing_instructions = str(
        matched_cart_item.get("instructions") or ""
    ).strip()
    new_instructions = "; ".join(
        str(note) for note in resolved_item.notes
        if str(note).strip()
        and not any(
            str(note).strip().lower().startswith(prefix)
            for prefix in ("remove ", "no ", "without ", "take out ")
        )
    )
    if new_instructions and existing_instructions:
        instructions = f"{existing_instructions}; {new_instructions}"
    elif new_instructions:
        instructions = new_instructions
    else:
        instructions = existing_instructions

    return CompileSuccess(
        operation=CompiledOperation(
            intent="update_item",
            lines=[
                CompiledCartLine(
                    menuItemId=menu_item_id,
                    qty=int(matched_cart_item.get("qty") or 1),
                    selectedOptions=selected_options,
                    instructions=instructions,
                    unmatched_modifiers=unmatched,
                )
            ],
            cart_line_id=str(line_id),
            source_parsed=parsed,
        )
    )


async def compile_operation(
    parsed: ParsedOperation,
    session: dict,
    cart: dict | None = None,
    menu_items: list[dict] | None = None,
) -> list[CompileResult]:
    if parsed.intent in _PASSIVE_COMPILE_INTENTS:
        return [
            CompileSuccess(
                operation=CompiledOperation(
                    intent=parsed.intent,
                    lines=[],
                    source_parsed=parsed,
                )
            )
        ]

    menu_items = menu_items if menu_items is not None else await tools_service.fetch_menu_items()
    if parsed.intent == "add_items":
        return [await _compile_add_or_describe_item(parsed, item, session=session, menu_items=menu_items) for item in parsed.items]
    if parsed.intent in {"remove_item", "update_quantity"}:
        return [await _compile_cart_target_operation(parsed, session, cart, menu_items)]
    if parsed.intent == "update_item":
        if not parsed.items:
            return [CompileFailure(reason="internal_error", message="no items for update_item")]
        return [await _compile_update_item_operation(parsed, session, cart, menu_items)]
    if parsed.intent == "describe_item":
        item = parsed.items[0] if parsed.items else ParsedItemRequest()
        return [await _compile_add_or_describe_item(parsed, item, session=session, menu_items=menu_items)]
    return [CompileSuccess(operation=CompiledOperation(intent=parsed.intent, lines=[], source_parsed=parsed))]
