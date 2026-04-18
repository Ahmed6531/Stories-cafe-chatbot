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
    collect_missing_variant_groups,
    find_ambiguous_menu_matches,
)
from app.services.menu_utils import (
    NEGATION_PREFIXES,
    _resolve_customization_entry,
    add_unique_phrase,
    build_menu_semantics,
    expand_candidates,
    find_closest_variant_suggestion,
    get_variant_group_id,
    is_menu_item_available,
    merge_instruction_text,
    normalize_modifier_text,
)
from app.services import tools as tools_service


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


def _split_legacy_modifier_buckets(modifiers: list[str]) -> tuple[str | None, str | None, list[str]]:
    size_words = {"small", "medium", "large", "regular", "tall", "grande", "venti", "short", "xl", "extra large"}
    size = None
    milk = None
    addons: list[str] = []
    for modifier in modifiers:
        cleaned = str(modifier).strip()
        lowered = cleaned.lower()
        if not cleaned:
            continue
        if size is None and lowered in size_words:
            size = cleaned
        elif milk is None and "milk" in lowered:
            milk = cleaned
        else:
            addons.append(cleaned)
    return size, milk, addons


def _parsed_item_to_legacy_dict(item: ParsedItemRequest) -> dict:
    size, milk, addons = _split_legacy_modifier_buckets(item.modifiers)
    return {
        "item_name": item.item_query,
        "quantity": item.quantity,
        "size": size,
        "options": {"milk": milk, "sugar": None},
        "addons": addons,
        "instructions": "; ".join(note.strip() for note in item.notes if str(note).strip()),
    }


def _coerce_menu_item_id(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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


async def _get_menu_detail(matched_item: dict, menu_item_id: int) -> dict | None:
    if isinstance(matched_item.get("variantGroupDetails"), list) or isinstance(matched_item.get("variants"), list):
        return matched_item
    return await tools_service.fetch_menu_item_detail(menu_item_id)


def _build_modifier_entry(modifier: str, menu_semantics: dict) -> dict:
    normalized = normalize_modifier_text(modifier)
    group_hint = None
    if normalized:
        size_candidates = menu_semantics.get("size_candidates") or {}
        milk_candidates = menu_semantics.get("milk_candidates") or {}
        if any(normalized in expand_candidates(key, size_candidates) for key in size_candidates):
            group_hint = "size"
        elif "milk" in normalized or any(normalized in expand_candidates(key, milk_candidates) for key in milk_candidates):
            group_hint = "milk"
    return {"kind": "selection", "value": modifier, "group_hint": group_hint}


def _partition_unmatched_fragments(unmatched_fragments: list[str]) -> tuple[list[str], list[str]]:
    negations: list[str] = []
    actionable_unmatched: list[str] = []
    for fragment in unmatched_fragments:
        lowered = str(fragment or "").lower().strip()
        if not lowered:
            continue
        if any(lowered.startswith(prefix) for prefix in NEGATION_PREFIXES):
            negations.append(str(fragment).strip())
        else:
            actionable_unmatched.append(str(fragment).strip())
    return negations, actionable_unmatched


def _resolve_modifiers_against_menu(item: ParsedItemRequest, menu_detail: dict | None) -> tuple[list[CompiledOption], str, list[str]]:
    menu_semantics = build_menu_semantics(menu_detail)
    selected_options: list[CompiledOption] = []
    instruction_parts: list[str] = []
    unmatched_fragments: list[str] = []
    group_selections: dict[str, set[str]] = {}
    resolved_size = None
    entries = [_build_modifier_entry(modifier, menu_semantics) for modifier in item.modifiers if str(modifier).strip()]
    size_entries = [entry for entry in entries if entry.get("group_hint") == "size"]
    remaining_entries = [entry for entry in entries if entry.get("group_hint") != "size"]

    def append_matched_option(group: dict | None, option: dict, suboption: dict | None = None) -> None:
        group_id = get_variant_group_id(group) if group else None
        normalized_group_id = str(group_id or "").strip()
        normalized_option = str(option.get("name") or "").strip().lower()
        max_selections = group.get("maxSelections") if isinstance(group, dict) else None
        if normalized_group_id:
            current = group_selections.setdefault(normalized_group_id, set())
            if max_selections is not None and normalized_option not in current and len(current) >= int(max_selections):
                add_unique_phrase(instruction_parts, option.get("name"))
                return
            if normalized_option:
                current.add(normalized_option)
        selected_options.append(
            CompiledOption(
                optionName=str(option.get("name")),
                suboptionName=(str(suboption.get("name")) if isinstance(suboption, dict) and suboption.get("name") else None),
                groupId=(str(group_id) if group_id else None),
            )
        )

    for entry in size_entries + remaining_entries:
        matched_group, matched_option, matched_suboption = _resolve_customization_entry(
            entry,
            menu_detail,
            menu_semantics,
            preferred_size=resolved_size,
        )
        if matched_option:
            append_matched_option(matched_group, matched_option, matched_suboption)
            if entry.get("group_hint") == "size":
                resolved_size = str(matched_option.get("name") or "").strip().lower() or resolved_size
        else:
            unmatched_fragments.append(str(entry.get("value") or "").strip())

    note_fragments = [str(note).strip() for note in item.notes if str(note).strip()]
    negation_fragments, actionable_unmatched = _partition_unmatched_fragments(unmatched_fragments)
    instructions = merge_instruction_text("; ".join(note_fragments), "; ".join(negation_fragments))
    return selected_options, instructions, actionable_unmatched


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
    matched_item = await tools_service.find_menu_item_by_name(menu_items, resolved_item.item_query)
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
    menu_detail = await _get_menu_detail(matched_item, menu_item_id)
    if parsed.intent == "add_items":
        legacy_item = _parsed_item_to_legacy_dict(resolved_item)
        missing_groups = collect_missing_variant_groups(legacy_item, menu_detail)
        if missing_groups:
            return CompileNeedsClarification(
                reason="missing_required_group",
                missing_groups=missing_groups,
                source_item=resolved_item,
                matched_menu_item=matched_item,
            )
        if not resolved_item.modifiers and not any(str(note).strip() for note in resolved_item.notes):
            from app.services.orchestrator import build_guided_order_groups

            guided_required_groups, guided_optional_groups = build_guided_order_groups(menu_detail)
            if guided_required_groups or guided_optional_groups:
                return CompileNeedsClarification(
                    reason="missing_required_group",
                    missing_groups=guided_required_groups + guided_optional_groups,
                    source_item=resolved_item,
                    matched_menu_item=matched_item,
                )
    selected_options, instructions, actionable_unmatched = _resolve_modifiers_against_menu(resolved_item, menu_detail)
    line = CompiledCartLine(
        menuItemId=menu_item_id,
        qty=max(1, int(resolved_item.quantity or 1)),
        selectedOptions=selected_options,
        instructions=instructions,
        unmatched_modifiers=actionable_unmatched,
    )
    return CompileSuccess(
        operation=CompiledOperation(intent=parsed.intent, lines=[line], source_parsed=parsed)
    )


async def _compile_cart_target_operation(parsed: ParsedOperation, session: dict, cart: dict | None, menu_items: list[dict]) -> CompileResult:
    if cart is None:
        return CompileFailure(reason="internal_error", message="cart required for remove/update")
    cart_items = _get_cart_items(cart)
    target_item = parsed.items[0] if parsed.items else ParsedItemRequest()
    resolved_item = _resolve_follow_up_item(target_item, parsed.intent, session)
    if isinstance(resolved_item, CompileNeedsClarification):
        return resolved_item
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


async def compile_operation(
    parsed: ParsedOperation,
    session: dict,
    cart: dict | None = None,
    menu_items: list[dict] | None = None,
) -> list[CompileResult]:
    menu_items = menu_items if menu_items is not None else await tools_service.fetch_menu_items()
    if parsed.intent == "add_items":
        return [await _compile_add_or_describe_item(parsed, item, session=session, menu_items=menu_items) for item in parsed.items]
    if parsed.intent in {"remove_item", "update_quantity"}:
        return [await _compile_cart_target_operation(parsed, session, cart, menu_items)]
    if parsed.intent == "describe_item":
        item = parsed.items[0] if parsed.items else ParsedItemRequest()
        return [await _compile_add_or_describe_item(parsed, item, session=session, menu_items=menu_items)]
    return [CompileSuccess(operation=CompiledOperation(intent=parsed.intent, lines=[], source_parsed=parsed))]


def _resolve_modifiers_legacy_shim(requested_item: dict, menu_detail: dict | None) -> tuple[list[dict], str, list[dict]]:
    modifiers: list[str] = []
    size = str(requested_item.get("size") or "").strip()
    if size:
        modifiers.append(size)
    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}
    milk = str(options.get("milk") or "").strip()
    if milk:
        modifiers.append(milk if "milk" in milk.lower() else f"{milk} milk")
    for addon in requested_item.get("addons") or []:
        cleaned = str(addon).strip()
        if cleaned:
            modifiers.append(cleaned)
    parsed_item = ParsedItemRequest(
        item_query=str(requested_item.get("item_name") or "").strip(),
        quantity=int(requested_item.get("quantity") or 1),
        modifiers=modifiers,
        notes=[part.strip() for part in str(requested_item.get("instructions") or "").split(";") if part.strip()],
    )
    selected_options, instructions, actionable_unmatched = _resolve_modifiers_against_menu(parsed_item, menu_detail)
    payload = CompiledCartLine(
        menuItemId=1,
        qty=1,
        selectedOptions=selected_options,
        instructions=instructions,
        unmatched_modifiers=actionable_unmatched,
    ).to_wire_payload()

    unmatched = [
        {
            "fragment": fragment,
            "suggestion": find_closest_variant_suggestion(menu_detail, fragment),
        }
        for fragment in actionable_unmatched
    ]
    return payload["selectedOptions"], payload["instructions"], unmatched
