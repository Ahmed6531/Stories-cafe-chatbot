# app/services/orchestrator.py

import asyncio
import logging
import re
import httpx
from difflib import SequenceMatcher

from app.schemas.chat import ChatMessageResponse
from app.services.fallback_assistant import generate_fallback_reply
from app.services.intent_pipeline import resolve_intent
from app.services.item_clarification import get_menu_detail_variants
from app.services.llm_interpreter import _extract_json_object, _generate_gemini_content_async
from app.services.menu_utils import (
    ADDON_CANDIDATES,
    GUIDED_SKIP_WORDS,
    MILK_CANDIDATES,
    SIZE_CANDIDATES,
    TOKEN_EQUIVALENTS,
    NEGATION_PREFIXES,
    _best_token_overlap,
    _resolve_customization_entry,
    active_variant_options,
    add_unique_phrase,
    build_menu_semantics,
    build_modifier_candidates_from_menu_detail,
    expand_candidates,
    find_closest_variant_suggestion,
    filter_menu_items_by_category_query,
    find_variant_option,
    find_variant_option_in_group,
    category_name_from_item,
    get_variant_group_id,
    get_variant_group_key,
    get_variant_group_label,
    is_guided_skip_response,
    is_menu_item_available,
    iter_variant_options,
    merge_instruction_text,
    normalize_modifier_text,
    score_variant_option,
    split_instruction_fragments,
)
from app.utils.static_replies import STATIC_REPLY_TABLE
from app.services.session_store import (
    Session,
    clear_guided_order_session,
    get_guided_order_defaulted_groups,
    get_guided_order_groups,
    get_guided_order_phase,
    get_guided_order_item_id,
    get_guided_order_item_name,
    get_guided_order_optional_groups,
    get_guided_order_quantity,
    get_guided_order_required_groups,
    get_guided_order_selections,
    get_guided_order_step,
    get_session,
    get_session_stage,
    set_session_stage,
    get_checkout_initiated,
    set_guided_order_phase,
    set_guided_order_groups,
    set_guided_order_item_id,
    set_guided_order_item_name,
    set_guided_order_defaulted_groups,
    set_guided_order_optional_groups,
    set_guided_order_quantity,
    set_guided_order_required_groups,
    set_guided_order_selections,
    set_guided_order_step,
    set_checkout_initiated,
    set_last_visible_choices,
    update_last_action,
    get_pending_operations,
    set_pending_operations,
    get_pending_operations_context,
    set_pending_operations_context,
    clear_pending_operations,
)

logger = logging.getLogger(__name__)
_NEGATION_PREFIXES = NEGATION_PREFIXES

GUIDED_ABORT_WORDS = frozenset({
    "nevermind",
    "never mind",
    "cancel",
    "forget it",
    "forget that",
    "actually forget it",
    "stop",
    "don't add",
    "do not add",
    "cancel that",
    "abort",
})
PENDING_OPS_CONFIRM_YES_WORDS = frozenset({
    "yes", "yep", "yeah", "sure", "ok", "okay",
    "go ahead", "do it", "sounds good", "please",
    "yes please", "absolutely", "of course",
})
PENDING_OPS_CONFIRM_NO_WORDS = frozenset({
    "no", "nope", "nah", "cancel", "nevermind",
    "never mind", "forget it", "stop", "no thanks",
    "exit", "quit", "close", "leave", "end chat",
})
GUIDED_DIRECT_WORDS = frozenset({
    "none",
    "skip",
    "no thanks",
    "nothing",
    "no",
    "done",
    "add it",
    "add to cart",
    "add",
    "yes",
    "yep",
    "that's it",
    "nothing else",
    "looks good",
})


def _log_add_items_compile_results(
    *,
    session_id: str,
    normalized_message: str,
    parsed_request,
    compile_results: list,
) -> None:
    parsed_debug = []
    for operation in getattr(parsed_request, "operations", []) or []:
        parsed_debug.append({
            "intent": getattr(operation, "intent", None),
            "items": [
                {
                    "item_query": getattr(item, "item_query", ""),
                    "quantity": getattr(item, "quantity", None),
                    "modifiers": getattr(item, "modifiers", []),
                    "use_defaults": getattr(item, "use_defaults", False),
                }
                for item in getattr(operation, "items", []) or []
            ],
        })

    result_debug = []
    for result in compile_results:
        entry = {"kind": type(result).__name__}
        operation = getattr(result, "operation", None)
        if operation is not None:
            entry["intent"] = getattr(operation, "intent", None)
            entry["compiled_lines"] = [
                {
                    "menu_item_id": getattr(line, "menu_item_id", None),
                    "qty": getattr(line, "qty", None),
                    "selected_options_count": len(getattr(line, "selected_options", []) or []),
                    "defaults_used": getattr(line, "defaults_used", []),
                }
                for line in getattr(operation, "lines", []) or []
            ]
        else:
            entry["reason"] = getattr(result, "reason", None)
            source_item = getattr(result, "source_item", None)
            if source_item is not None:
                entry["source_item"] = {
                    "item_query": getattr(source_item, "item_query", ""),
                    "quantity": getattr(source_item, "quantity", None),
                    "modifiers": getattr(source_item, "modifiers", []),
                    "use_defaults": getattr(source_item, "use_defaults", False),
                }
            matched_item = getattr(result, "matched_menu_item", None)
            if isinstance(matched_item, dict):
                entry["matched_menu_item_id"] = matched_item.get("id") or matched_item.get("_id")
                entry["matched_menu_item_name"] = matched_item.get("name")
                variant_refs = matched_item.get("variantGroups")
                variant_details = matched_item.get("variantGroupDetails") or matched_item.get("variants")
                entry["variant_group_refs_count"] = len(variant_refs) if isinstance(variant_refs, list) else 0
                entry["variant_group_details_count"] = len(variant_details) if isinstance(variant_details, list) else 0
        result_debug.append(entry)

    logger.info({
        "stage": "add_items_compile_results",
        "session_id": session_id,
        "normalized_message": normalized_message,
        "parsed_request": parsed_debug,
        "compile_results": result_debug,
    })
GUIDED_DEFAULT_ALL_WORDS = frozenset({
    "default",
    "defaults",
    "use default",
    "use defaults",
    "just the default",
    "default everything",
    "default all",
    "just default",
    "whatever",
    "anything",
    "don't care",
    "no preference",
    "your choice",
    "up to you",
    "surprise me",
})
GUIDED_DONE_WORDS = frozenset({
    "done",
    "add it",
    "add to cart",
    "add",
    "yes",
    "yep",
    "that's it",
    "nothing else",
    "no thanks",
    "nope",
    "no",
    "nothing",
    "looks good",
    "perfect",
    "great",
})
STATIC_FALLBACK_MESSAGES = {
    "bare_affirmation_needs_context": (
        "Just to confirm - did you mean to checkout, or is there something else I can help with?"
    ),
}
GUIDED_REQUIRED_GROUP_KEYWORDS = ("size", "milk type", "milk")


def _fmt_price(value) -> str:
    return f"L.L {int(float(value or 0)):,}"


def _build_failed_item(item_name: str | None, message: str) -> dict:
    return {
        "item_name": (item_name or "item").strip() or "item",
        "message": message,
    }


def _format_failed_item_line(failed_item: dict) -> str:
    item_name = failed_item.get("item_name", "item")
    message = failed_item.get("message")
    return f"- {item_name}: {message}" if message else f"- {item_name}"


def is_out_of_stock_error(error: Exception | str | None) -> bool:
    err_lower = str(error or "").lower()
    return any(
        phrase in err_lower
        for phrase in (
            "out of stock",
            "not available",
            "unavailable",
            "sold out",
        )
    )


def build_out_of_stock_message(item_name: str | None) -> str:
    clean_name = (item_name or "that item").strip() or "that item"
    return f"{clean_name} is out of stock right now."




def _extract_option_name(option: dict | None) -> str:
    if not isinstance(option, dict):
        return ""
    return str(option.get("optionName") or option.get("name") or "").strip()


def _extract_suboption_name(option: dict | None) -> str:
    if not isinstance(option, dict):
        return ""
    return str(option.get("suboptionName") or option.get("sub") or "").strip()


def _extract_selected_group_id(option: dict | None) -> str:
    if not isinstance(option, dict):
        return ""
    return str(option.get("groupId") or "").strip()


def _variant_group_ref_values(group: dict | None) -> list[str]:
    if not isinstance(group, dict):
        return []

    refs: list[str] = []
    for raw_ref in (group.get("groupId"), group.get("refId"), group.get("id")):
        ref = str(raw_ref or "").strip()
        if ref and ref not in refs:
            refs.append(ref)
    return refs


def cart_item_to_requested_item(cart_item: dict, menu_detail: dict | None) -> dict:
    requested_item = {
        "item_name": cart_item.get("name") or "",
        "quantity": int(cart_item.get("qty") or 1),
        "size": None,
        "options": {"milk": None, "sugar": None},
        "addons": [],
        "instructions": str(cart_item.get("instructions") or "").strip(),
        "customizations": [],
    }

    selected_options = cart_item.get("selectedOptions") if isinstance(cart_item.get("selectedOptions"), list) else []
    if not selected_options:
        return requested_item

    groups_by_ref: dict[str, dict] = {}
    option_name_to_groups: dict[str, list[dict]] = {}
    for group, option in iter_variant_options(menu_detail):
        for group_ref in _variant_group_ref_values(group):
            groups_by_ref[normalize_modifier_text(group_ref)] = group

        option_name = normalize_modifier_text(option.get("name"))
        if option_name:
            group_list = option_name_to_groups.setdefault(option_name, [])
            if not any(existing is group for existing in group_list):
                group_list.append(group)

    for selected_option in selected_options:
        option_name = _extract_option_name(selected_option)
        suboption_name = _extract_suboption_name(selected_option)
        normalized_option_name = normalize_modifier_text(option_name)
        if not normalized_option_name:
            continue

        selection_group_id = _extract_selected_group_id(selected_option)
        group = groups_by_ref.get(normalize_modifier_text(selection_group_id))
        if not group:
            matching_groups = option_name_to_groups.get(normalized_option_name, [])
            if len(matching_groups) == 1:
                group = matching_groups[0]
        group_key = get_variant_group_key(group)
        requested_item["customizations"].append(
            {
                "kind": "selection",
                "value": option_name,
                "group_hint": group_key if group_key != "other" else None,
                "group_label": get_variant_group_label(group) if group else None,
                "group_id": selection_group_id or get_variant_group_id(group) or None,
                "suboption_value": suboption_name or None,
                "source": "selected_option",
            }
        )
        if group_key == "size":
            requested_item["size"] = option_name
        elif group_key == "milk":
            requested_item["options"]["milk"] = option_name
        elif group_key == "sugar":
            requested_item["options"]["sugar"] = option_name

    return normalize_requested_item_structure(requested_item, menu_detail)


def merge_requested_item_customizations(base_item: dict, overrides: dict, menu_detail: dict | None = None) -> dict:
    merged = {
        "item_name": overrides.get("item_name") or base_item.get("item_name") or "",
        "quantity": int(base_item.get("quantity") or 1),
        "size": overrides.get("size") or base_item.get("size"),
        "options": {
            "milk": None,
            "sugar": None,
        },
        "addons": [],
        "instructions": "",
    }

    base_options = base_item.get("options") if isinstance(base_item.get("options"), dict) else {}
    override_options = overrides.get("options") if isinstance(overrides.get("options"), dict) else {}

    for key in ("milk", "sugar"):
        merged["options"][key] = override_options.get(key) or base_options.get(key)

    base_addons = base_item.get("addons") if isinstance(base_item.get("addons"), list) else []
    override_addons = overrides.get("addons") if isinstance(overrides.get("addons"), list) else []

    option_to_group: dict[str, str] = {}
    if isinstance(menu_detail, dict):
        for group in get_menu_detail_variants(menu_detail):
            if not isinstance(group, dict):
                continue
            group_id = normalize_modifier_text(get_variant_group_label(group))
            raw_options = group.get("options")
            if not isinstance(raw_options, list):
                continue
            for option in raw_options:
                if not isinstance(option, dict):
                    continue
                option_name = normalize_modifier_text(option.get("name"))
                if option_name and group_id:
                    option_to_group[option_name] = group_id

    if override_addons and option_to_group:
        override_groups = {
            option_to_group.get(normalize_modifier_text(addon))
            for addon in override_addons
            if normalize_modifier_text(addon)
        }
        override_groups.discard(None)
        if override_groups:
            base_addons = [
                addon
                for addon in base_addons
                if option_to_group.get(normalize_modifier_text(addon)) not in override_groups
            ]

    seen_addons: set[str] = set()
    for addon in [*base_addons, *override_addons]:
        addon_text = str(addon or "").strip()
        addon_key = normalize_modifier_text(addon_text)
        if addon_key and addon_key not in seen_addons:
            seen_addons.add(addon_key)
            merged["addons"].append(addon_text)

    base_instructions = str(base_item.get("instructions") or "").strip()
    override_instructions = str(overrides.get("instructions") or "").strip()
    merged["instructions"] = merge_instruction_text(
        base_instructions,
        override_instructions,
    )

    merged["customizations"] = []
    if isinstance(base_item.get("customizations"), list):
        merged["customizations"].extend(base_item["customizations"])
    if isinstance(overrides.get("customizations"), list):
        merged["customizations"].extend(overrides["customizations"])

    return normalize_requested_item_structure(merged, menu_detail)




def build_customization_instruction_parts(requested_item: dict) -> list[str]:
    parts: list[str] = []
    for entry in build_requested_item_customizations(requested_item):
        add_unique_phrase(parts, entry.get("value"))
    return parts


def requested_item_has_customization(requested_item: dict) -> bool:
    return bool(build_customization_instruction_parts(requested_item))


def guided_group_name(group: dict | None) -> str:
    if not isinstance(group, dict):
        return ""
    return str(
        group.get("customerLabel")
        or group.get("name")
        or group.get("adminName")
        or ""
    ).strip()


def _normalize_customization_entry(entry: dict | None) -> dict | None:
    if not isinstance(entry, dict):
        return None

    value = str(entry.get("value") or entry.get("text") or "").strip()
    if not value:
        return None

    kind = str(entry.get("kind") or "selection").strip().lower()
    if kind not in {"selection", "instruction"}:
        kind = "selection"

    group_hint = normalize_modifier_text(
        entry.get("group_hint") or entry.get("groupKey") or entry.get("group_key")
    )
    group_label = str(
        entry.get("group_label") or entry.get("groupName") or entry.get("group_name") or ""
    ).strip() or None
    source = str(entry.get("source") or "").strip() or None
    group_id = str(entry.get("group_id") or entry.get("groupId") or "").strip() or None
    suboption_value = str(
        entry.get("suboption_value") or entry.get("suboptionName") or entry.get("suboption") or ""
    ).strip() or None

    if kind == "selection" and group_hint in {"milk", "sugar"}:
        normalized_value = normalize_modifier_text(value)
        if normalized_value in GUIDED_SKIP_WORDS:
            return {
                "kind": "instruction",
                "value": f"no {group_hint}",
                "group_hint": group_hint,
                "group_label": group_label,
                "group_id": group_id,
                "suboption_value": suboption_value,
                "source": source,
            }

    return {
        "kind": kind,
        "value": value,
        "group_hint": group_hint or None,
        "group_label": group_label,
        "group_id": group_id,
        "suboption_value": suboption_value,
        "source": source,
    }


def build_requested_item_customizations(requested_item: dict) -> list[dict]:
    if not isinstance(requested_item, dict):
        return []

    entries: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()

    def add_entry(raw_entry: dict | None) -> None:
        entry = _normalize_customization_entry(raw_entry)
        if not entry:
            return

        if entry["kind"] == "instruction":
            key = (
                entry["kind"],
                normalize_modifier_text(entry["value"]),
                "",
                "",
            )
        else:
            key = (
                entry["kind"],
                normalize_modifier_text(entry["value"]),
                normalize_modifier_text(entry.get("group_hint")),
                normalize_modifier_text(entry.get("group_label")),
                normalize_modifier_text(entry.get("group_id")),
                normalize_modifier_text(entry.get("suboption_value")),
            )
        if key in seen:
            return
        seen.add(key)
        entries.append(entry)

    explicit_entries = requested_item.get("customizations")
    if isinstance(explicit_entries, list):
        for entry in explicit_entries:
            add_entry(entry)

    size_value = requested_item.get("size")
    if isinstance(size_value, str) and size_value.strip():
        if normalize_modifier_text(size_value) not in GUIDED_SKIP_WORDS:
            add_entry(
                {
                    "kind": "selection",
                    "value": size_value,
                    "group_hint": "size",
                    "source": "size",
                }
            )

    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}
    for key in ("milk", "sugar"):
        value = options.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        add_entry(
            {
                "kind": "selection",
                "value": value,
                "group_hint": key,
                "source": f"options.{key}",
            }
        )

    addons = requested_item.get("addons")
    if isinstance(addons, list):
        for addon in addons:
            if isinstance(addon, str) and addon.strip():
                add_entry(
                    {
                        "kind": "selection",
                        "value": addon,
                        "group_hint": "addons",
                        "source": "addons",
                    }
                )

    for fragment in split_instruction_fragments(requested_item.get("instructions")):
        add_entry(
            {
                "kind": "instruction",
                "value": fragment,
                "source": "instructions",
            }
        )

    return entries


def normalize_requested_item_structure(
    requested_item: dict,
    menu_detail: dict | None = None,
) -> dict:
    if not isinstance(requested_item, dict):
        return {
            "item_name": "",
            "quantity": 1,
            "size": None,
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "",
            "customizations": [],
        }

    normalized = dict(requested_item)
    normalized["options"] = dict(
        requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {"milk": None, "sugar": None}
    )
    normalized["addons"] = list(requested_item.get("addons") or [])
    normalized["instructions"] = str(requested_item.get("instructions") or "").strip()
    normalized["customizations"] = build_requested_item_customizations(normalized)
    return normalized


def append_selected_option(
    selected_options: list[dict],
    option_name: str | None,
    group_name: str | None = None,
    *,
    group_id: str | None = None,
    suboption_name: str | None = None,
) -> None:
    if not isinstance(option_name, str) or not option_name.strip():
        return

    option_key = normalize_modifier_text(option_name)
    group_key = normalize_modifier_text(group_id)
    suboption_key = normalize_modifier_text(suboption_name)
    for existing in selected_options:
        existing_name = existing.get("optionName") if isinstance(existing, dict) else None
        existing_group_id = existing.get("groupId") if isinstance(existing, dict) else None
        existing_suboption = existing.get("suboptionName") if isinstance(existing, dict) else None
        if (
            normalize_modifier_text(existing_name) == option_key
            and normalize_modifier_text(existing_group_id) == group_key
            and normalize_modifier_text(existing_suboption) == suboption_key
        ):
            return

    entry: dict = {"optionName": option_name.strip()}
    if group_name and str(group_name).strip():
        entry["groupName"] = str(group_name).strip()
    if group_id and str(group_id).strip():
        entry["groupId"] = str(group_id).strip()
    if suboption_name and str(suboption_name).strip():
        entry["suboptionName"] = str(suboption_name).strip()
    selected_options.append(entry)


def _normalize_whitespace(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _get_static_reply(normalized_phrase: str) -> str | None:
    exact_reply = STATIC_REPLY_TABLE.get(normalized_phrase)
    if exact_reply:
        return exact_reply

    cleaned = re.sub(r"[^\w\s]", " ", normalized_phrase)
    cleaned = _normalize_whitespace(cleaned)
    if not cleaned:
        return None

    exact_cleaned_reply = STATIC_REPLY_TABLE.get(cleaned)
    if exact_cleaned_reply:
        return exact_cleaned_reply

    # Don't short-circuit on messages that continue past the greeting/thanks
    # — they likely contain an intent we should route properly.
    from app.services.menu_signal import get_menu_signal_sync

    signal = get_menu_signal_sync()

    _QUERY_WORDS = frozenset({
        "what", "which", "how", "when", "where",
        "do", "does", "have", "got", "any",
        "show", "list", "tell", "describe", "explain",
        "provide", "sell", "carry", "offer", "serve",
        "want", "need", "get", "add", "remove", "order",
        "checkout", "cart", "wondering", "curious",
        "available", "options", "recommend",
    })
    cleaned_words = set(cleaned.split())

    has_query_word = bool(cleaned_words & _QUERY_WORDS)
    has_menu_term = bool(
        cleaned_words & signal.category_names
        or cleaned_words & signal.item_name_tokens
        or cleaned_words & signal.option_names
        or any(item_name in cleaned for item_name in signal.item_names)
    )

    if has_query_word or has_menu_term:
        return None

    greeting_prefixes = (
        "hi",
        "hey",
        "hello",
        "hiya",
        "good morning",
        "good afternoon",
        "good evening",
    )
    gratitude_prefixes = ("thanks", "thank you", "thx", "cheers")
    positive_prefixes = ("great", "perfect", "awesome")

    if any(cleaned.startswith(prefix) for prefix in greeting_prefixes):
        return STATIC_REPLY_TABLE["hi"]
    if any(cleaned.startswith(prefix) for prefix in gratitude_prefixes):
        return STATIC_REPLY_TABLE["thank you"]
    if any(cleaned.startswith(prefix) for prefix in positive_prefixes):
        return STATIC_REPLY_TABLE["great"]

    return None


def _is_required_guided_group(group: dict) -> bool:
    if not isinstance(group, dict):
        return False

    if group.get("isRequired") is True or group.get("required") is True:
        return True

    group_name = normalize_modifier_text(guided_group_name(group))
    return any(keyword in group_name for keyword in GUIDED_REQUIRED_GROUP_KEYWORDS)


def build_guided_order_groups(menu_detail: dict | None) -> tuple[list[dict], list[dict]]:
    def group_rank(group: dict) -> tuple[int, str]:
        normalized_name = normalize_modifier_text(guided_group_name(group))
        if "size" in normalized_name:
            return (0, normalized_name)
        if "milk" in normalized_name:
            return (1, normalized_name)
        if any(keyword in normalized_name for keyword in ("extra", "addon", "add on", "topping", "syrup")):
            return (3, normalized_name)
        return (2, normalized_name)

    groups: list[dict] = []
    for group in get_menu_detail_variants(menu_detail):
        if not isinstance(group, dict):
            continue

        active_options = active_variant_options(group)
        if len(active_options) < 2:
            continue

        group_name = guided_group_name(group)
        if not group_name:
            continue

        normalized_name = normalize_modifier_text(group_name)
        if any(normalize_modifier_text(guided_group_name(existing)) == normalized_name for existing in groups):
            continue

        group_copy = dict(group)
        group_copy["name"] = group_name
        group_copy["isActive"] = group.get("isActive", True)
        group_copy["options"] = active_options
        groups.append(group_copy)

    groups.sort(key=group_rank)
    required_groups = [group for group in groups if _is_required_guided_group(group)]
    optional_groups = [group for group in groups if not _is_required_guided_group(group)]
    return required_groups, optional_groups


def _make_guided_passthrough_resolved() -> dict:
    return {
        "intent": "guided_order_response",
        "confidence": 1.0,
        "items": [],
        "follow_up_ref": None,
        "needs_clarification": False,
        "reason": "guided_direct_word",
        "source": "deterministic",
        "route_to_fallback": False,
        "fallback_needed": False,
    }


def _build_bill(cart_items: list[dict]) -> dict:
    _TAX_RATE = 0.08
    bill_items = []
    subtotal = 0.0
    item_count = 0

    for item in cart_items:
        qty = item.get("qty", 1)
        name = item.get("name", "item")
        unit_price = float(item.get("price", 0))
        line_total = unit_price * qty
        subtotal += line_total
        item_count += qty

        bill_items.append({
            "item_name": name,
            "quantity": qty,
            "unit_price": unit_price,
            "line_total": line_total,
            "selectedOptions": item.get("selectedOptions", []),
            "instructions": item.get("instructions", ""),
        })

    tax_amount = subtotal * _TAX_RATE

    return {
        "items": bill_items,
        "subtotal": subtotal,
        "tax_rate": _TAX_RATE,
        "tax_amount": tax_amount,
        "total": subtotal + tax_amount,
        "item_count": item_count,
    }


def build_cart_summary(cart_items: list[dict]) -> str:
    cart_lines = []

    for item in cart_items:
        qty = item.get("qty", 1)
        name = item.get("name", "item")
        price = item.get("price", item.get("basePrice", 0))
        if price:
            cart_lines.append(f"- {qty}x {name} - {_fmt_price(price)} each")
        else:
            cart_lines.append(f"- {qty}x {name}")

    return "\n".join(cart_lines)


async def _observe_guided_order_combo(
    *,
    cart_id: str | None,
    item_id,
) -> None:
    try:
        from app.services.tools import get_cart as _get_cart
        from app.services.tools import observe_combo

        _combo_cart = await _get_cart(cart_id=cart_id)
        _existing_ids = [
            str(item.get("menuItemId") or item.get("menu_item_id") or "")
            for item in (_combo_cart.get("cart") or [])
            if isinstance(item, dict)
            and str(item.get("menuItemId") or item.get("menu_item_id") or "") != str(item_id)
            and (item.get("menuItemId") or item.get("menu_item_id"))
        ]
        if _existing_ids:
            await observe_combo(
                anchor_menu_item_ids=_existing_ids,
                suggested_menu_item_id=str(item_id),
                source="cart_add",
            )
    except Exception:
        pass


def _schedule_guided_order_combo_observation(
    *,
    cart_id: str | None,
    item_id,
) -> None:
    try:
        asyncio.create_task(
            _observe_guided_order_combo(
                cart_id=cart_id,
                item_id=item_id,
            )
        )
    except Exception:
        pass


async def _finalize_guided_order(
    session_id: str,
    cart_id: str | None,
    normalized_message: str,
    *,
    add_item_to_cart,
    instructions_text: str = "",
    pipeline_stage: str = "guided_ordering_done",
    intent: str = "guided_order_response",
) -> ChatMessageResponse:
    from app.services.http_client import ExpressAPIError
    from app.services.slot_filler import slot_state_summary, slot_state_to_selected_options
    from app.services.session_store import (
        get_guided_order_groups_meta,
        get_guided_order_slot_state,
    )

    item_id = get_guided_order_item_id(session_id)
    item_name = get_guided_order_item_name(session_id)
    quantity = get_guided_order_quantity(session_id)
    slot_state = get_guided_order_slot_state(session_id)
    groups_meta = get_guided_order_groups_meta(session_id)

    if item_id is None or quantity is None:
        clear_guided_order_session(session_id)
        set_session_stage(session_id, None)
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="Something went wrong. What would you like to order?",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "guided_ordering_missing_state",
            },
        )

    selected_options = slot_state_to_selected_options(slot_state, groups_meta)

    try:
        cart_result = await add_item_to_cart(
            menu_item_id=item_id,
            qty=quantity,
            selected_options=selected_options,
            instructions=instructions_text,
            cart_id=cart_id,
        )
        _schedule_guided_order_combo_observation(
            cart_id=cart_result["cart_id"],
            item_id=item_id,
        )
    except ExpressAPIError as add_err:
        if is_out_of_stock_error(add_err):
            clear_guided_order_session(session_id)
            set_session_stage(session_id, None)
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=build_out_of_stock_message(item_name),
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "guided_order_item_id": item_id,
                    "guided_order_item_name": item_name,
                    "pipeline_stage": "guided_ordering_out_of_stock",
                },
            )
        raise

    # Generate post-add suggestions the same way the executor does
    post_add_suggestions: list[dict] = []
    try:
        from app.services.executor import _build_post_add_suggestions
        from app.services.executor import ExecutionContext
        _suggestion_ctx = ExecutionContext(
            session_id=session_id,
            cart_id=cart_result["cart_id"],
            session=get_session(session_id),
            auth_cookie=None,
        )
        post_add_suggestions = await _build_post_add_suggestions(
            _suggestion_ctx,
            [{"item_name": item_name, "quantity": quantity,
              "menu_item_id": item_id}],
        )
    except Exception:
        post_add_suggestions = []

    guided_size_upgrade: dict | None = None
    if not post_add_suggestions:
        try:
            from app.services.upsell import get_size_upgrade_suggestion
            from app.services.tools import fetch_menu_item_detail

            _guided_detail = await fetch_menu_item_detail(item_id)
            if _guided_detail:
                _selected_names = [
                    str(option.get("optionName") or "").strip()
                    for option in selected_options
                    if isinstance(option, dict) and option.get("optionName")
                ]
                _guided_sess = get_session(session_id) or {}
                _is_repeat = bool(
                    _guided_sess.get("last_checked_out_items")
                    or _guided_sess.get("checkout_initiated")
                )
                guided_size_upgrade = get_size_upgrade_suggestion(
                    session_id,
                    _guided_detail,
                    _selected_names,
                    is_repeat_customer=_is_repeat,
                )
        except Exception:
            guided_size_upgrade = None

    selection_summary_text = slot_state_summary(slot_state, groups_meta)
    summary_parts = [selection_summary_text] if selection_summary_text != "no customizations yet" else []
    if instructions_text:
        summary_parts.append(instructions_text)
    selection_summary = ", ".join(summary_parts)
    summary_suffix = f" ({selection_summary_text})" if summary_parts else ""
    defaulted_groups = get_guided_order_defaulted_groups(session_id)

    clear_guided_order_session(session_id)
    set_session_stage(session_id, None)
    # Update last_items so follow-up refs ("make it two", "same again")
    # resolve to the item just added via guided ordering.
    _guided_session = get_session(session_id)
    _guided_session["last_items"] = [
        {
            "item_name": item_name,
            "quantity": quantity,
            "menu_item_id": item_id,
            "selected_options": [
                opt if isinstance(opt, dict) else {"optionName": str(opt)}
                for opt in selected_options
            ],
            "instructions": instructions_text or "",
        }
    ]
    _guided_session["last_intent"] = "add_items"

    reply_text = f"Added {quantity}x {item_name}{summary_suffix} to your cart."
    if defaulted_groups:
        reply_text += f" I used the default for {', '.join(defaulted_groups)}. Sound good?"

    # Check if there are pending operations to drain via executor.
    pending_ops_raw = get_pending_operations(session_id)
    if pending_ops_raw:
        from app.services.executor import execute_compiled_operations
        clear_pending_operations(session_id)
        pending_compile_results = await _compile_pending_operations_for_drain(
            pending_ops_raw=pending_ops_raw,
            session_id=session_id,
            cart_id=cart_result["cart_id"],
            session=get_session(session_id),
        )
        if pending_compile_results:
            from app.services.compiler import CompileSuccess

            logger.info({
                "stage": "guided_ordering_drain_start",
                "session_id": session_id,
                "draining_count": len(pending_compile_results),
                "ops": [
                    {
                        "intent": (
                            result.operation.intent
                            if isinstance(result, CompileSuccess)
                            else type(result).__name__
                        ),
                        "items": [
                            item.item_query
                            for item in (
                                result.operation.source_parsed.items
                                if isinstance(result, CompileSuccess)
                                and result.operation.source_parsed
                                else []
                            )
                        ],
                    }
                    for result in pending_compile_results
                ],
            })
            drain_result = await execute_compiled_operations(
                compile_results=pending_compile_results,
                session_id=session_id,
                cart_id=cart_result["cart_id"],
                session=get_session(session_id),
                auth_cookie=None,
            )
            drained_checkout_intent = next(
                (
                    result.operation.intent
                    for result in pending_compile_results
                    if isinstance(result, CompileSuccess)
                    and result.operation.intent in {"checkout", "confirm_checkout"}
                ),
                None,
            )
            if drained_checkout_intent and not drain_result.needs_followup:
                from app.services.tools import get_cart

                checkout_cart = await get_cart(
                    cart_id=drain_result.cart_id or cart_result["cart_id"]
                )
                bill = _build_bill(checkout_cart["cart"]) if checkout_cart["cart"] else None
                if bill:
                    set_session_stage(session_id, "checkout_summary")
                    checkout_reply = "Ready to checkout? Here's your order summary."
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=f"{reply_text}\n\n{checkout_reply}",
                        intent=drained_checkout_intent,
                        cart_updated=True,
                        cart_id=checkout_cart["cart_id"],
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "guided_order_item_id": item_id,
                            "guided_order_item_name": item_name,
                            "guided_order_selections": slot_state,
                            "guided_order_instructions": instructions_text,
                            "size_upgrade": guided_size_upgrade,
                            "pipeline_stage": "checkout_summary",
                            "bill": bill,
                        },
                    )
            if drain_result.reply and drain_result.reply != "Done.":
                reply_text = reply_text + "\n\n" + drain_result.reply
            cart_result = {
                "cart_id": drain_result.cart_id or cart_result["cart_id"],
                "cart": cart_result.get("cart", []),
            }
            if drain_result.needs_followup:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply_text,
                    intent=intent,
                    cart_updated=True,
                    cart_id=drain_result.cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "size_upgrade": guided_size_upgrade,
                        "pipeline_stage": "guided_ordering_start",
                    },
                )

    return ChatMessageResponse(
        session_id=session_id,
        status="ok",
        reply=reply_text,
        intent=intent,
        cart_updated=True,
        cart_id=cart_result["cart_id"],
        defaults_used=[],
        suggestions=post_add_suggestions,
        metadata={
            "normalized_message": normalized_message,
            "guided_order_item_id": item_id,
            "guided_order_item_name": item_name,
            "guided_order_selections": slot_state,
            "guided_order_instructions": instructions_text,
            "size_upgrade": guided_size_upgrade,
            "cart": cart_result["cart"],
            "pipeline_stage": pipeline_stage,
        },
    )


async def _handle_guided_order_response(
    *,
    session_id: str,
    cart_id: str | None,
    normalized_message: str,
    normalized_phrase: str,
    intent: str,
    add_item_to_cart,
) -> ChatMessageResponse:
    from app.services.slot_filler import (
        build_group_prompt,
        build_open_customization_prompt,
        build_suboption_prompt,
        fill_slots_from_text,
        find_hidden_option_name,
        get_empty_required_groups,
    )
    from app.services.session_store import (
        get_guided_order_active_group_id,
        get_guided_order_groups_meta,
        get_guided_order_slot_state,
        get_guided_order_state,
        set_guided_order_active_group_id,
        set_guided_order_slot_state,
        set_guided_order_state,
    )

    item_id = get_guided_order_item_id(session_id)
    item_name = get_guided_order_item_name(session_id)
    quantity = get_guided_order_quantity(session_id)
    guided_state = get_guided_order_state(session_id)
    active_group_id = get_guided_order_active_group_id(session_id)
    slot_state = get_guided_order_slot_state(session_id)
    groups_meta = get_guided_order_groups_meta(session_id)

    if item_id is None or not item_name or quantity is None:
        clear_guided_order_session(session_id)
        set_session_stage(session_id, None)
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="Something went wrong. What would you like to order?",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "guided_ordering_missing_state",
            },
        )

    if guided_state == "instructions":
        instructions_text = (
            "" if is_guided_skip_response(normalized_message) else normalized_message
        )
        return await _finalize_guided_order(
            session_id,
            cart_id,
            normalized_message,
            add_item_to_cart=add_item_to_cart,
            instructions_text=instructions_text,
            pipeline_stage="guided_ordering_done",
            intent=intent,
        )

    if (
        guided_state == "required"
        and isinstance(active_group_id, str)
        and active_group_id.startswith("suboption:")
    ):
        parts = active_group_id.split(":", 2)
        parent_group_id = parts[1] if len(parts) > 1 else ""
        waiting_opt_name = parts[2] if len(parts) > 2 else ""
        parent_group = next(
            (g for g in groups_meta if g.get("groupId") == parent_group_id),
            None,
        )
        if parent_group:
            parent_opts = [
                o for o in (parent_group.get("options") or [])
                if o.get("isActive") is not False
            ]
            waiting_opt = next(
                (
                    o for o in parent_opts
                    if o.get("name", "").lower() == waiting_opt_name.lower()
                ),
                None,
            )
            if waiting_opt:
                suboptions = waiting_opt.get("suboptions") or []
                norm_response = normalize_modifier_text(normalized_message)
                matched_sub = next(
                    (
                        s for s in suboptions
                        if normalize_modifier_text(s.get("name", "")) == norm_response
                        or norm_response in normalize_modifier_text(s.get("name", ""))
                        or normalize_modifier_text(s.get("name", "")) in norm_response
                    ),
                    None,
                )
                if matched_sub:
                    entries = slot_state.get(parent_group_id, [])
                    for entry in entries:
                        if entry.get("optionName", "").lower() == waiting_opt_name.lower():
                            entry["suboptionName"] = matched_sub["name"]
                            break
                    set_guided_order_slot_state(session_id, slot_state)
                    set_guided_order_active_group_id(session_id, parent_group_id)
                    empty_required = get_empty_required_groups(slot_state, groups_meta)
                    if empty_required:
                        next_group = empty_required[0]
                        set_guided_order_active_group_id(
                            session_id, next_group.get("groupId")
                        )
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_group_prompt(
                                item_name, next_group, is_first=False
                            ),
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "guided_ordering_continue",
                            },
                        )
                    has_optional_groups = any(
                        group.get("isActive") is True
                        and group.get("isRequired") is not True
                        and group.get("options")
                        for group in groups_meta
                    )
                    set_guided_order_active_group_id(session_id, None)
                    if not has_optional_groups:
                        set_guided_order_state(session_id, "instructions")
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=f"Any special instructions for your {item_name}? Say 'none' to skip.",
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "guided_ordering_instructions",
                            },
                        )
                    set_guided_order_state(session_id, "open")
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_open_customization_prompt(
                            item_name, slot_state, groups_meta
                        ),
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "guided_ordering_review",
                        },
                    )
                else:
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_suboption_prompt(
                            item_name, waiting_opt_name, suboptions
                        ),
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "guided_ordering_suboption_retry",
                        },
                    )

    if guided_state == "required":
        active_group = next(
            (g for g in groups_meta if g.get("groupId") == active_group_id),
            None,
        )
        if active_group is None:
            empty_required = get_empty_required_groups(slot_state, groups_meta)
            if empty_required:
                active_group = empty_required[0]
                set_guided_order_active_group_id(
                    session_id, active_group.get("groupId")
                )
            else:
                guided_state = "open"
                set_guided_order_state(session_id, "open")
                set_guided_order_active_group_id(session_id, None)

        if guided_state == "required" and active_group is not None:
            slot_state, applied, unmatched = fill_slots_from_text(
                normalized_message, groups_meta, slot_state
            )
            set_guided_order_slot_state(session_id, slot_state)

            if not applied:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=(
                        f"I didn't catch that. "
                        + build_group_prompt(item_name, active_group, is_first=False)
                    ),
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "guided_ordering_retry",
                    },
                )

            just_filled = slot_state.get(active_group.get("groupId"), [])
            if just_filled:
                last_entry = just_filled[-1]
                opt_name = last_entry.get("optionName", "")
                active_opts = [
                    o for o in (active_group.get("options") or [])
                    if o.get("isActive") is not False
                ]
                matched_opt = next(
                    (
                        o for o in active_opts
                        if o.get("name", "").lower() == opt_name.lower()
                    ),
                    None,
                )
                if (
                    matched_opt
                    and matched_opt.get("suboptions")
                    and last_entry.get("suboptionName") is None
                ):
                    set_guided_order_active_group_id(
                        session_id,
                        f"suboption:{active_group.get('groupId')}:{opt_name}",
                    )
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_suboption_prompt(
                            item_name, opt_name, matched_opt["suboptions"]
                        ),
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "guided_ordering_suboption",
                        },
                    )

            empty_required = get_empty_required_groups(slot_state, groups_meta)
            if empty_required:
                next_group = empty_required[0]
                set_guided_order_active_group_id(
                    session_id, next_group.get("groupId")
                )
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=build_group_prompt(item_name, next_group, is_first=False),
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "guided_ordering_continue",
                    },
                )

            has_optional_groups = any(
                group.get("isActive") is True
                and group.get("isRequired") is not True
                and group.get("options")
                for group in groups_meta
            )
            set_guided_order_active_group_id(session_id, None)
            if not has_optional_groups:
                set_guided_order_state(session_id, "instructions")
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"Any special instructions for your {item_name}? Say 'none' to skip.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "guided_ordering_instructions",
                    },
                )
            set_guided_order_state(session_id, "open")
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=build_open_customization_prompt(
                    item_name, slot_state, groups_meta
                ),
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "guided_ordering_review",
                },
            )

    if guided_state == "open":
        finalize_words = frozenset({
            "done", "add it", "add to cart", "add", "yes", "yep",
            "that's it", "nothing else", "looks good", "perfect",
            "great", "no", "nope", "no thanks", "nothing",
            "that is all", "that's all", "skip", "none",
            "i'm good", "im good", "all good",
        })
        if normalized_phrase in finalize_words:
            set_guided_order_state(session_id, "instructions")
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=f"Any special instructions for your {item_name}? Say 'none' to skip.",
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "guided_ordering_instructions",
                },
            )

        slot_state, applied, unmatched = fill_slots_from_text(
            normalized_message, groups_meta, slot_state
        )
        set_guided_order_slot_state(session_id, slot_state)

        if applied:
            for group in groups_meta:
                if group.get("isRequired") or not group.get("isActive", True):
                    continue
                group_id = group.get("groupId", "")
                entries = slot_state.get(group_id, [])
                active_opts = [
                    o for o in (group.get("options") or [])
                    if o.get("isActive") is not False
                ]
                for entry in entries:
                    if entry.get("suboptionName") is not None:
                        continue
                    opt_name = entry.get("optionName", "")
                    matched_opt = next(
                        (
                            o for o in active_opts
                            if o.get("name", "").lower() == opt_name.lower()
                        ),
                        None,
                    )
                    if matched_opt and matched_opt.get("suboptions"):
                        set_guided_order_active_group_id(
                            session_id,
                            f"suboption:{group_id}:{opt_name}",
                        )
                        set_guided_order_state(session_id, "required")
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_suboption_prompt(
                                item_name, opt_name, matched_opt["suboptions"]
                            ),
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "guided_ordering_suboption",
                            },
                        )

            applied_text = ", ".join(applied)
            unmatched_note = ""
            if unmatched:
                unmatched_text = ", ".join(repr(u) for u in unmatched)
                unmatched_note = f" (I couldn't match: {unmatched_text})"
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=(
                    f"Added {applied_text}!{unmatched_note} "
                    f"Anything else, or say 'done' to add to cart."
                ),
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "guided_ordering_open_applied",
                },
            )

        _open_prompt = build_open_customization_prompt(item_name, slot_state, groups_meta)
        if unmatched:
            _notes: list[str] = []
            for _u in unmatched:
                _hidden = find_hidden_option_name(_u, groups_meta)
                if _hidden:
                    _notes.append(f"{_hidden} is not currently available")
                else:
                    _notes.append(f"I couldn't find '{_u}' in the available options")
            _open_reply = ". ".join(_notes) + ".\n\n" + _open_prompt
        else:
            _open_reply = _open_prompt
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=_open_reply,
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "guided_ordering_open_unclear",
            },
        )

    set_guided_order_state(session_id, "open")
    set_guided_order_active_group_id(session_id, None)
    return ChatMessageResponse(
        session_id=session_id,
        status="ok",
        reply=build_open_customization_prompt(item_name, slot_state, groups_meta),
        intent=intent,
        cart_updated=False,
        cart_id=cart_id,
        defaults_used=[],
        suggestions=[],
        metadata={
            "normalized_message": normalized_message,
            "pipeline_stage": "guided_ordering_open_unclear",
        },
    )


def extract_quantity_value(message: str) -> int | None:
    """
    Extracts a single explicit quantity from a normalized message string.
    Returns None if no quantity or multiple quantities are found.
    """
    WORD_TO_NUMBER = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    }
    tokens = re.findall(
        r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b",
        (message or "").lower(),
    )
    if len(tokens) != 1:
        return None
    token = tokens[0]
    if token.isdigit():
        return int(token)
    return WORD_TO_NUMBER.get(token)


def _sort_operations_by_priority(operations: list[dict]) -> list[dict]:
    """
    Execution order:
      Active ops (mutate cart or produce scoped info before add):
        0  clear_cart
        1  remove_item
        2  update_quantity
        3  update_item
        4  add_items / add_item / repeat_order
        5  checkout / confirm_checkout
        6  describe_item          ← info needed before guided ordering
      Passive ops (render inline after all active ops complete):
        7  view_cart
        8  list_category_items
        9  list_categories
        10 recommendation_query
      Fallthrough:
        99 everything else
    """
    PRIORITY = {
        "clear_cart":           0,
        "remove_item":          1,
        "update_quantity":      2,
        "update_item":          3,
        "add_items":            4,
        "add_item":             4,
        "repeat_order":         4,
        "checkout":             5,
        "confirm_checkout":     5,
        "describe_item":        6,
        "view_cart":            7,
        "list_category_items":  8,
        "list_categories":      9,
        "recommendation_query": 10,
    }
    DEFAULT_PRIORITY = 99

    indexed = list(enumerate(operations))
    indexed.sort(key=lambda entry: (
        PRIORITY.get(entry[1].get("intent"), DEFAULT_PRIORITY),
        entry[0],  # preserve LLM order within same priority tier
    ))
    return [op for _, op in indexed]





# Intents that mutate cart state or need to run before guided ordering.
ACTIVE_INTENTS: frozenset[str] = frozenset({
    "clear_cart",
    "remove_item",
    "update_quantity",
    "update_item",
    "add_items",
    "add_item",
    "repeat_order",
    "checkout",
    "confirm_checkout",
    "describe_item",
})

# Intents that render data inline without mutating cart state or
# setting session stage. Always execute after active ops complete.
PASSIVE_INTENTS: frozenset[str] = frozenset({
    "view_cart",
    "list_category_items",
    "list_categories",
    "recommendation_query",
})


async def _render_passive_op(
    op: dict,
    *,
    session_id: str,
    cart_id: str | None,
    session: dict | None,
    normalized_message: str,
) -> str:
    """
    Renders a single passive operation inline and returns its reply text.
    Does NOT set session stage. Sets last_visible_choices for list ops
    so follow-up ordinal refs work.
    """
    from app.services.tools import fetch_featured_items, fetch_menu_items, get_cart
    from app.services.suggestions import (
        extract_recommendation_category,
        extract_recommendation_query_terms,
        filter_by_category,
        suggest_complementary_items,
        suggest_popular_items,
    )
    from app.services.upsell import get_upsell_suggestions

    op_intent = op.get("intent") or ""
    items = op.get("items") or []

    if op_intent == "view_cart":
        try:
            cart_result = await get_cart(cart_id=cart_id)
            summary = build_cart_summary(cart_result["cart"])
            return f"Here's your cart:\n{summary}" if summary else "Your cart is empty."
        except Exception:
            return "I couldn't load your cart right now."

    if op_intent == "list_category_items":
        category_query = ""
        if items:
            category_query = (
                str(items[0].get("category") or items[0].get("item_query") or "")
                .strip().lower()
            )
        if not category_query:
            return "Which category are you interested in?"
        try:
            menu_items = await fetch_menu_items()
        except Exception:
            return "I couldn't load the menu right now."
        matched = filter_menu_items_by_category_query(menu_items, category_query)
        if matched:
            cat_label = category_name_from_item(matched[0]) or category_query.title()
            lines = [
                f"- {item['name']}  ({_fmt_price(item.get('basePrice'))})"
                for item in matched[:12]
            ]
            reply = f"Here's what we have in {cat_label}:\n" + "\n".join(lines)
            if len(matched) > 12:
                reply += f"\n...and {len(matched) - 12} more."
            set_last_visible_choices(session_id, matched[:12], source="list_category_items")
            return reply
        set_last_visible_choices(session_id, [], source="list_category_items")
        return f"I couldn't find items in '{category_query}'."

    if op_intent == "list_categories":
        try:
            menu_items = await fetch_menu_items()
        except Exception:
            return "I couldn't load the menu right now."
        seen: set = set()
        categories: list[str] = []
        for item in menu_items:
            cat = item.get("category")
            name = (cat.get("name") if isinstance(cat, dict) else str(cat or "")).strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                categories.append(name)
        categories.sort()
        if categories:
            return "Here's what we serve:\n" + "\n".join(f"- {c}" for c in categories)
        return "We have a wide selection. What are you in the mood for?"

    if op_intent == "recommendation_query":
        try:
            featured_items = await fetch_featured_items()
            cart_result = await get_cart(cart_id=cart_id)
            cart_items = cart_result["cart"]
            menu_items = await fetch_menu_items()
        except Exception:
            return "I couldn't load recommendations right now."
        rec_category = extract_recommendation_category(normalized_message)
        rec_query_terms = extract_recommendation_query_terms(normalized_message)
        menu_items_by_name = {
            (item.get("name") or "").lower(): item
            for item in menu_items
            if isinstance(item, dict) and item.get("name")
        }
        popular = suggest_popular_items(featured_items, limit=6)
        complementary: list[dict] = []
        if cart_items:
            complementary = suggest_complementary_items(menu_items, cart_items[-1], limit=4)
        upsell = await get_upsell_suggestions(
            session_id=session_id,
            intent=op_intent,
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
            if not all_suggestions and rec_query_terms and rec_category:
                all_menu = [
                    {"type": "menu_search", "item_name": i.get("name"), "menu_item_id": i.get("id")}
                    for i in menu_items if isinstance(i, dict) and i.get("name")
                ]
                all_suggestions = filter_by_category(
                    all_menu, rec_category, menu_items_by_name, rec_query_terms
                )
                if not all_suggestions:
                    all_suggestions = filter_by_category(
                        raw_suggestions, rec_category, menu_items_by_name, []
                    )

        if not all_suggestions and rec_query_terms and not rec_category:
            all_menu = [
                {"type": "menu_search", "item_name": i.get("name"), "menu_item_id": i.get("id")}
                for i in menu_items if isinstance(i, dict) and i.get("name")
            ]
            all_suggestions = filter_by_category(
                all_menu, None, menu_items_by_name, rec_query_terms
            )

        seen_names: set[str] = set()
        filtered: list[dict] = []
        for s in all_suggestions:
            name = (s.get("item_name") or "").strip()
            if not name or name.lower() in seen_names:
                continue
            seen_names.add(name.lower())
            filtered.append(s)
            if len(filtered) == 4:
                break

        set_last_visible_choices(session_id, filtered, source="recommendation")
        if filtered:
            return "Here are some picks you might like:\n" + "\n".join(
                f"- {s['item_name']}" for s in filtered
            )
        return "I can help with suggestions once you add an item to your cart."

    return ""


def _legacy_item_to_modifiers(item: dict) -> list[str]:
    mods: list[str] = []
    size = str(item.get("size") or "").strip()
    if size:
        mods.append(size)
    options = item.get("options") if isinstance(item.get("options"), dict) else {}
    milk = str(options.get("milk") or "").strip()
    if milk:
        mods.append(milk if "milk" in milk.lower() else f"{milk} milk")
    for addon in (item.get("addons") or []):
        cleaned = str(addon).strip()
        if cleaned:
            mods.append(cleaned)
    return mods


def _message_explicitly_removes_all(message: str | None, item_query: str) -> bool:
    if not message or not item_query:
        return False

    normalized_message = normalize_modifier_text(message)
    normalized_query = normalize_modifier_text(item_query)
    if not normalized_message or not normalized_query:
        return False

    query_pattern = re.escape(normalized_query)
    patterns = [
        rf"\bremove\s+(?:all|every)\s+(?:the\s+)?{query_pattern}\b",
        rf"\bdelete\s+(?:all|every)\s+(?:the\s+)?{query_pattern}\b",
        rf"\btake\s+out\s+(?:all|every)\s+(?:the\s+)?{query_pattern}\b",
        rf"\bget\s+rid\s+of\s+(?:all|every)\s+(?:the\s+)?{query_pattern}\b",
    ]
    return any(re.search(pattern, normalized_message) for pattern in patterns)


def _message_has_remove_all_command(message: str | None) -> bool:
    normalized_message = normalize_modifier_text(message)
    if not normalized_message:
        return False
    return bool(
        re.search(
            r"\b(?:remove|delete)\s+(?:all|every)\b"
            r"|\btake\s+out\s+(?:all|every)\b"
            r"|\bget\s+rid\s+of\s+(?:all|every)\b",
            normalized_message,
        )
    )


def _resolved_to_parsed_request(resolved: dict, intent: str, session: dict, message: str | None = None):
    """Convert a resolve_intent result dict to a ParsedRequest for the compiler."""
    from app.schemas.actions import ParsedRequest, ParsedOperation, ParsedItemRequest

    raw_ops = resolved.get("operations") or []
    if not raw_ops:
        raw_ops = [{
            "intent": resolved.get("intent") or intent or "unknown",
            "items": resolved.get("items") or [],
            "follow_up_ref": resolved.get("follow_up_ref"),
        }]

    raw_ops = _sort_operations_by_priority(raw_ops)

    ops = []
    for raw_op in raw_ops:
        op_intent = str(raw_op.get("intent") or "unknown")
        items = []
        for item in (raw_op.get("items") or []):
            if not isinstance(item, dict):
                continue
            item_query = str(item.get("item_query") or item.get("item_name") or "").strip()
            if (
                op_intent == "remove_item"
                and item.get("quantity") is None
                and item_query
                and not normalize_modifier_text(item_query).startswith(("all ", "every "))
                and (
                    _message_explicitly_removes_all(message, item_query)
                    or _message_has_remove_all_command(message)
                )
            ):
                item_query = f"all {item_query}"

            if op_intent in {"list_category_items", "list_categories"} and not item_query:
                item_query = str(item.get("category") or "").strip()

            items.append(
                ParsedItemRequest(
                    item_query=item_query,
                    quantity=(
                        int(item.get("quantity") or 1)
                        if op_intent == "add_items"
                        else item.get("quantity")
                    ),
                    modifiers=(
                        [str(m).strip() for m in item["modifiers"] if str(m).strip()]
                        if isinstance(item.get("modifiers"), list)
                        else _legacy_item_to_modifiers(item)
                    ),
                    notes=(
                        [str(n).strip() for n in item["notes"] if str(n).strip()]
                        if isinstance(item.get("notes"), list)
                        else split_instruction_fragments(item.get("instructions"))
                    ),
                    follow_up_ref=item.get("follow_up_ref"),
                    use_defaults=bool(item.get("use_defaults", False)),
                )
            )
        ops.append(ParsedOperation(intent=op_intent, items=items))

    if not ops:
        return None

    return ParsedRequest(
        operations=ops,
        confidence=float(resolved.get("confidence") or 1.0),
    )


async def _compile_pending_operations_for_drain(
    *,
    pending_ops_raw: list[dict],
    session_id: str,
    cart_id: str | None,
    session: Session | None,
) -> list:
    from app.schemas.actions import CompiledOperation
    from app.services.compiler import CompileSuccess, compile_operation
    from app.services.tools import fetch_menu_items, get_cart

    try:
        compiled_pending = [CompiledOperation.model_validate(op) for op in pending_ops_raw]
    except Exception:
        return []

    if not compiled_pending:
        return []

    if not any(not op.lines for op in compiled_pending):
        return [CompileSuccess(operation=op) for op in compiled_pending]

    menu_items = await fetch_menu_items()
    try:
        cart_raw = await get_cart(cart_id=cart_id)
    except Exception:
        cart_raw = {"cart_id": cart_id, "cart": []}

    active_session = session if isinstance(session, dict) else get_session(session_id)
    compile_results = []
    for op in compiled_pending:
        if op.lines:
            compile_results.append(CompileSuccess(operation=op))
            continue
        compile_results.extend(
            await compile_operation(op.source_parsed, active_session, cart_raw, menu_items)
        )
    logger.debug({
        "stage": "pending_drain_compiled",
        "session_id": session_id,
        "results": [
            type(result).__name__ + (
                ":" + result.operation.intent
                if isinstance(result, CompileSuccess)
                else ""
            )
            for result in compile_results
        ],
    })
    return compile_results


async def _run_typed_compiler_executor_intent(
    *,
    session_id: str,
    normalized_message: str,
    resolved: dict,
    intent: str,
    session: dict,
    cart_id: str | None,
    auth_cookie: str | None,
    missing_reply: str,
    missing_stage: str,
) -> ChatMessageResponse:
    from app.services.compiler import compile_operation
    from app.services.executor import execute_compiled_operations
    from app.services.tools import fetch_menu_items, get_cart

    parsed_request = _resolved_to_parsed_request(resolved, intent, session, normalized_message)
    if not parsed_request or not parsed_request.operations:
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=missing_reply,
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": missing_stage,
            },
        )

    try:
        menu_items = await fetch_menu_items()
    except Exception:
        if intent in {"remove_item", "update_quantity"}:
            menu_items = []
        else:
            raise
    try:
        cart_raw = await get_cart(cart_id=cart_id)
    except Exception:
        cart_raw = {"cart_id": cart_id, "cart": []}

    compile_results = []
    for op in parsed_request.operations:
        compile_results.extend(
            await compile_operation(op, session, cart_raw, menu_items)
        )

    exec_result = await execute_compiled_operations(
        compile_results=compile_results,
        session_id=session_id,
        cart_id=cart_id,
        session=session,
        auth_cookie=auth_cookie,
    )

    # When checkout is one of several ops (e.g. [add_items, checkout]),
    # execute_compiled_operations buries the checkout stage under the last
    # active intent's pipeline_stage and then the block below clears it.
    # Re-run checkout as the terminal response so the frontend gets
    # pipeline_stage: checkout_summary with the bill payload.
    _checkout_intents = {"checkout", "confirm_checkout"}
    _parsed_ops = parsed_request.operations if parsed_request else []
    _has_checkout = any(op.intent in _checkout_intents for op in _parsed_ops)
    if _has_checkout and not exec_result.needs_followup:
        _checkout_intent = next(
            op.intent for op in _parsed_ops if op.intent in _checkout_intents
        )
        _pre_reply = exec_result.reply if exec_result.reply and exec_result.reply != "Done." else ""
        if _pre_reply:
            _summary_text = "Ready to checkout? Here's your order summary."
            _pre_reply = _pre_reply.replace(_summary_text, "").strip()
        _co_cart = await get_cart(cart_id=exec_result.cart_id or cart_id)
        _bill = None
        if not _co_cart["cart"]:
            _checkout_reply = "Your cart is empty — add some items first."
            _checkout_stage = "checkout_empty_cart"
        else:
            _bill = _build_bill(_co_cart["cart"])
            set_session_stage(session_id, "checkout_summary")
            _checkout_reply = "Ready to checkout? Here's your order summary."
            _checkout_stage = "checkout_summary"
        _full_reply = (_pre_reply + "\n\n" + _checkout_reply).strip() if _pre_reply else _checkout_reply
        if session is not None:
            session["cart_id"] = _co_cart["cart_id"]
        update_last_action(session_id, normalized_message, _full_reply, _checkout_intent)
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=_full_reply,
            intent=_checkout_intent,
            cart_updated=exec_result.cart_updated,
            cart_id=_co_cart["cart_id"],
            defaults_used=exec_result.defaults_used,
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": _checkout_stage,
                "bill": _bill,
            },
        )

    if session is not None:
        session["cart_id"] = exec_result.cart_id
    if not exec_result.needs_followup:
        set_session_stage(session_id, None)

    update_last_action(session_id, normalized_message, exec_result.reply, intent)
    return ChatMessageResponse(
        session_id=session_id,
        status="ok",
        reply=exec_result.reply,
        intent=exec_result.intent_for_response or intent,
        cart_updated=exec_result.cart_updated,
        cart_id=exec_result.cart_id,
        defaults_used=exec_result.defaults_used,
        suggestions=exec_result.suggestions,
        metadata={
            "normalized_message": normalized_message,
            "size_upgrade": exec_result.size_upgrade,
            **exec_result.metadata,
        },
    )


async def _handle_pending_ops_confirmation(
    *,
    session_id: str,
    normalized_message: str,
    normalized_phrase: str,
    cart_id: str | None,
    session: Session | None,
    auth_cookie: str | None,
) -> ChatMessageResponse:
    if normalized_phrase in PENDING_OPS_CONFIRM_YES_WORDS:
        set_session_stage(session_id, None)
        pending_ops = get_pending_operations(session_id)
        context = get_pending_operations_context(session_id)
        accumulated = list(context.get("reply_parts") or [])

        from app.services.executor import execute_compiled_operations

        clear_pending_operations(session_id)
        pending_compile_results = await _compile_pending_operations_for_drain(
            pending_ops_raw=pending_ops,
            session_id=session_id,
            cart_id=cart_id,
            session=session,
        )
        if pending_compile_results:
            drain_result = await execute_compiled_operations(
                compile_results=pending_compile_results,
                session_id=session_id,
                cart_id=cart_id,
                session=session,
                auth_cookie=auth_cookie,
            )
            if drain_result.reply and drain_result.reply != "Done.":
                accumulated.append(drain_result.reply)
            cart_id = drain_result.cart_id or cart_id
            if drain_result.needs_followup:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=" ".join(accumulated),
                    intent="unknown",
                    cart_updated=True,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "pending_ops_drain_guided",
                    },
                )

        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="Done! Anything else?",
            intent="unknown",
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "pending_ops_confirmation_done",
            },
        )

    if normalized_phrase in PENDING_OPS_CONFIRM_NO_WORDS:
        clear_pending_operations(session_id)
        set_session_stage(session_id, None)
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="No problem! What else can I get you?",
            intent="unknown",
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "pending_ops_confirmation_cancelled",
            },
        )

    context = get_pending_operations_context(session_id)
    ops_text = context.get("pending_ops_description", "those items")
    return ChatMessageResponse(
        session_id=session_id,
        status="ok",
        reply=f"Just to confirm - did you still want to {ops_text}? Say yes or no.",
        intent="unknown",
        cart_updated=False,
        cart_id=cart_id,
        defaults_used=[],
        suggestions=[],
        metadata={
            "normalized_message": normalized_message,
            "pipeline_stage": "pending_ops_confirmation_unclear",
        },
    )


async def process_chat_message(
    session_id: str,
    message: str,
    cart_id: str | None = None,
    session: Session | None = None,
    auth_cookie: str | None = None,
) -> ChatMessageResponse:

    if session is None:
        session = get_session(session_id)

    from app.utils.normalize import normalize_user_message
    from app.services.tools import (
        add_item_to_cart,
        clear_cart,
        fetch_my_orders,
        fetch_featured_items,
        fetch_menu_item_detail,
        fetch_menu_items,
        fetch_my_orders,
        find_menu_item_by_name,
        get_cart,
    )
    from app.services.suggestions import (
        extract_recommendation_query_terms,
        suggest_complementary_items,
        suggest_popular_items,
        extract_recommendation_category,
        filter_by_category,
    )
    from app.services.http_client import ExpressAPIError
    from app.services.item_clarification import (
        apply_customization_response,
        build_customization_prompt,
        build_customization_suggestions,
        build_menu_choice_prompt,
        build_menu_choice_suggestions,
        collect_missing_variant_groups,
        resolve_menu_choice,
    )
    from app.services.upsell import get_upsell_suggestions, record_turn

    if session is not None and cart_id is None:
        cart_id = session["cart_id"]

    # Count every turn so upsell cooldown works correctly through clarification flows.
    record_turn(session_id)

    normalized_message = normalize_user_message(message)
    normalized_phrase = _normalize_whitespace(normalized_message)
    # Default so exception handlers always have a defined intent variable.
    intent = "unknown"
    current_stage = get_session_stage(session_id)
    resolved = None
    _skip_resolve = False
    guided_interrupted = False

    if current_stage == "pending_ops_confirmation":
        return await _handle_pending_ops_confirmation(
            session_id=session_id,
            normalized_message=normalized_message,
            normalized_phrase=normalized_phrase,
            cart_id=cart_id,
            session=session,
            auth_cookie=auth_cookie,
        )

    if current_stage not in {"guided_ordering", "checkout_summary"}:
        static_reply = _get_static_reply(normalized_phrase)
        if static_reply:
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=static_reply,
                intent="unknown",
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "static_reply",
                },
            )

    if current_stage == "guided_ordering" and normalized_phrase in GUIDED_DIRECT_WORDS:
        resolved = _make_guided_passthrough_resolved()
        intent = "guided_order_response"
        _skip_resolve = True

    if (
        not _skip_resolve
        and current_stage == "guided_ordering"
        and normalized_phrase in GUIDED_ABORT_WORDS
    ):
        item_name = get_guided_order_item_name(session_id)
        clear_guided_order_session(session_id)
        set_session_stage(session_id, None)

        pending_ops = get_pending_operations(session_id)
        logger.info({
            "stage": "guided_ordering_abort_pending_ops",
            "session_id": session_id,
            "pending_count": len(pending_ops),
            "pending_ops": [
                {
                    "intent": op.get("intent"),
                    "items": [
                        item.get("item_query") or item.get("item_name")
                        for item in (op.get("source_parsed", {}).get("items") or [])
                    ],
                }
                for op in pending_ops
            ],
        })
        if pending_ops:
            # Build natural language description of remaining ops
            op_descriptions: list[str] = []
            for pending_op in pending_ops:
                pending_intent = pending_op.get("intent")
                source_parsed = pending_op.get("source_parsed") or {}
                parsed_items = source_parsed.get("items") or []
                if pending_intent == "add_items" and parsed_items:
                    names = [
                        item.get("item_query") or item.get("item_name") or "item"
                        for item in parsed_items
                        if isinstance(item, dict)
                    ]
                    for name in names:
                        if name and name != "item":
                            op_descriptions.append(f"add a {name}")
                elif pending_intent == "remove_item" and parsed_items:
                    name = (
                        parsed_items[0].get("item_query")
                        or parsed_items[0].get("item_name")
                        or "item"
                    )
                    op_descriptions.append(f"remove the {name}")
                elif pending_intent == "update_quantity" and parsed_items:
                    name = (
                        parsed_items[0].get("item_query")
                        or parsed_items[0].get("item_name")
                        or "item"
                    )
                    qty = parsed_items[0].get("quantity")
                    op_descriptions.append(
                        f"update {name} to {qty}" if qty else f"update {name}"
                    )
                elif pending_intent == "view_cart":
                    op_descriptions.append("view your cart")
                elif pending_intent == "list_category_items":
                    category = ""
                    if parsed_items and isinstance(parsed_items[0], dict):
                        category = (
                            parsed_items[0].get("category")
                            or parsed_items[0].get("item_query")
                            or ""
                        )
                    op_descriptions.append(
                        f"show {category} items" if category else "browse menu items"
                    )
                elif pending_intent == "list_categories":
                    op_descriptions.append("list categories")
                elif pending_intent == "recommendation_query":
                    op_descriptions.append("show recommendations")
                elif pending_intent in {"checkout", "confirm_checkout"}:
                    op_descriptions.append("checkout")

            if op_descriptions:
                if len(op_descriptions) == 1:
                    ops_text = op_descriptions[0]
                elif len(op_descriptions) == 2:
                    ops_text = f"{op_descriptions[0]} and {op_descriptions[1]}"
                else:
                    ops_text = (
                        ", ".join(op_descriptions[:-1])
                        + f", and {op_descriptions[-1]}"
                    )

                set_pending_operations_context(session_id, {
                    "awaiting_pending_ops_confirmation": True,
                    "pending_ops_description": ops_text,
                })
                set_session_stage(session_id, "pending_ops_confirmation")

                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=(
                        f"Alright, I won't add the "
                        f"{item_name or 'item'}. "
                        f"You also wanted to {ops_text}. "
                        f"Still want to do that?"
                    ),
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "guided_ordering_aborted_with_queue",
                        "pending_ops_remaining": len(pending_ops),
                    },
                )
        else:
            clear_pending_operations(session_id)

        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=f"No problem! I won't add the "
                  f"{item_name or 'item'}. What else can I get you?",
            intent="unknown",
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "guided_ordering_aborted",
            },
        )

    if (
        not _skip_resolve
        and current_stage == "guided_ordering"
        and get_session(session_id).get("guided_order_state") in {"open", "instructions"}
        and normalized_phrase in GUIDED_DEFAULT_ALL_WORDS
    ):
        if get_session(session_id).get("guided_order_state") == "open":
            from app.services.session_store import set_guided_order_state
            set_guided_order_state(session_id, "instructions")
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=(
                    f"Any special instructions for your "
                    f"{get_guided_order_item_name(session_id) or 'item'}? "
                    f"Say 'none' to skip."
                ),
                intent="guided_order_response",
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "guided_ordering_instructions",
                },
            )
        return await _finalize_guided_order(
            session_id,
            cart_id,
            normalized_message,
            add_item_to_cart=add_item_to_cart,
            instructions_text="",
            pipeline_stage="guided_ordering_default_all",
        )

    if not _skip_resolve:
        try:
            resolved = await resolve_intent(
                message=normalized_message,
                session=session or {},
                cart={},
                menu=[],
            )
            intent = resolved["intent"]
        except Exception as _resolve_err:
            logger.warning({
                "stage": "resolve_intent_failed",
                "session_id": session_id,
                "error": str(_resolve_err),
            })
            resolved = {
                "intent": "unknown",
                "confidence": 0.0,
                "items": [],
                "follow_up_ref": None,
                "needs_clarification": False,
                "reason": "resolve_intent_exception",
                "source": "error",
                "route_to_fallback": True,
                "fallback_needed": True,
            }
            intent = "unknown"

    try:
        if get_session_stage(session_id) == "guided_ordering" and intent != "guided_order_response":
            if intent in PASSIVE_INTENTS:
                passive_ops = [
                    op for op in (resolved.get("operations") or [])
                    if op.get("intent") in PASSIVE_INTENTS
                ]
                if not passive_ops:
                    passive_ops = [
                        {
                            "intent": intent,
                            "items": resolved.get("items") or [],
                        }
                    ]

                passive_parts: list[str] = []
                for passive_op in passive_ops:
                    part = await _render_passive_op(
                        passive_op,
                        session_id=session_id,
                        cart_id=cart_id,
                        session=session,
                        normalized_message=normalized_message,
                    )
                    if part:
                        passive_parts.append(part)
                passive_reply = "\n\n".join(passive_parts)

                from app.services.session_store import (
                    get_guided_order_active_group_id,
                    get_guided_order_groups_meta,
                    get_guided_order_slot_state,
                    get_guided_order_state,
                )

                _g_state = get_guided_order_state(session_id)
                _slot_state = get_guided_order_slot_state(session_id)
                _groups_meta = get_guided_order_groups_meta(session_id)
                _item_name = get_guided_order_item_name(session_id)
                _active_gid = get_guided_order_active_group_id(session_id)

                if _g_state == "required":
                    _active_group = next(
                        (g for g in _groups_meta if g.get("groupId") == _active_gid),
                        None,
                    )
                    if _active_group:
                        from app.services.slot_filler import build_group_prompt
                        guided_question = build_group_prompt(
                            _item_name, _active_group, is_first=False
                        )
                    else:
                        guided_question = "What would you like?"
                elif _g_state == "open":
                    from app.services.slot_filler import build_open_customization_prompt
                    guided_question = build_open_customization_prompt(
                        _item_name, _slot_state, _groups_meta
                    )
                elif _g_state == "instructions":
                    guided_question = (
                        f"Any special instructions for your {_item_name}? "
                        f"Say 'none' to skip."
                    )
                else:
                    guided_question = "What would you like?"

                combined_reply = (
                    passive_reply + "\n\n" + guided_question
                    if passive_reply
                    else guided_question
                )

                logger.info({
                    "stage": "passive_during_guided_ordering",
                    "session_id": session_id,
                    "intent": intent,
                    "passive_count": len(passive_ops),
                    "guided_state": _g_state,
                    "guided_item": _item_name,
                })
                update_last_action(session_id, normalized_message, combined_reply, intent)
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=combined_reply,
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": f"passive_during_guided_{intent}",
                    },
                )
            else:
                if intent == "unknown" or resolved.get("route_to_fallback"):
                    from app.services.session_store import (
                        get_guided_order_active_group_id,
                        get_guided_order_groups_meta,
                        get_guided_order_slot_state,
                        get_guided_order_state,
                    )
                    from app.services.slot_filler import (
                        build_group_prompt,
                        build_open_customization_prompt,
                    )

                    _g_state = get_guided_order_state(session_id)
                    _slot_state = get_guided_order_slot_state(session_id)
                    _groups_meta = get_guided_order_groups_meta(session_id)
                    _item_name = get_guided_order_item_name(session_id) or "item"
                    _active_gid = get_guided_order_active_group_id(session_id)

                    if _g_state == "instructions":
                        return await _handle_guided_order_response(
                            session_id=session_id,
                            cart_id=cart_id,
                            normalized_message=normalized_message,
                            normalized_phrase=normalized_phrase,
                            intent="guided_order_response",
                            add_item_to_cart=add_item_to_cart,
                        )

                    if _g_state == "required":
                        _active_group = next(
                            (g for g in _groups_meta if g.get("groupId") == _active_gid),
                            None,
                        )
                        guided_question = (
                            build_group_prompt(_item_name, _active_group, is_first=False)
                            if _active_group
                            else "What would you like?"
                        )
                    elif _g_state == "open":
                        guided_question = build_open_customization_prompt(
                            _item_name, _slot_state, _groups_meta
                        )
                    else:
                        guided_question = "What would you like?"

                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=f"I didn't catch that. {guided_question}",
                        intent="guided_order_response",
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "guided_ordering_retry",
                        },
                    )

                clear_guided_order_session(session_id)
                clear_pending_operations(session_id)
                set_session_stage(session_id, None)
                guided_interrupted = True
                logger.info(
                    {
                        "stage": "guided_ordering_interrupted",
                        "session_id": session_id,
                        "new_intent": intent,
                        "normalized_message": normalized_message,
                    }
                )

        # ── resolved nullability guard ────────────────────────────────────────
        if resolved is None:
            resolved = {
                "intent": "unknown",
                "confidence": 0.0,
                "items": [],
                "follow_up_ref": None,
                "needs_clarification": False,
                "reason": "resolved_missing",
                "source": "error",
                "route_to_fallback": True,
                "fallback_needed": True,
            }
            intent = "unknown"

        # ── pending_clarification state machine ──────────────────────────────
        pending_clarification = session.get("pending_clarification") if session is not None else None
        if isinstance(pending_clarification, dict):
            stripped_message = normalized_message.strip().lower()
            abandon_phrases = {
                "nevermind",
                "never mind",
                "cancel",
                "forget it",
                "dont want",
                "don't want",
                "dont want that",
                "don't want that",
                "not anymore",
                "stop",
                "skip",
                "rather",
                "have",
            }
            fresh_command_starts = (
                "add ",
                "remove ",
                "delete ",
                "update ",
                "set ",
                "checkout",
                "check out",
                "view cart",
                "show cart",
                "clear cart",
                "empty cart",
                "have",
                "describe",
            )
            is_fresh_command = intent in {
                "add_items",
                "remove_item",
                "update_quantity",
                "view_cart",
                "checkout",
                "clear_cart",
                "describe_item",
                "recommendation_query",
            }
            explicit_new_command = stripped_message.startswith(fresh_command_starts)
            has_abandon_phrase = any(phrase in stripped_message for phrase in abandon_phrases)

            if has_abandon_phrase and not explicit_new_command and not is_fresh_command:
                session["pending_clarification"] = None
                set_session_stage(session_id, None)
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="No problem, I canceled that. What would you like to do instead?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "clarification_cancelled",
                    },
                )

            wants_to_interrupt = (
                has_abandon_phrase and (is_fresh_command or explicit_new_command)
            ) or explicit_new_command

            if wants_to_interrupt:
                session["pending_clarification"] = None
                set_session_stage(session_id, None)
                pending_clarification = None

        if isinstance(pending_clarification, dict):
            clarification_type = pending_clarification.get("type")
            carry_requested_items = pending_clarification.get("remaining_requested_items") or []
            carry_successful_items = pending_clarification.get("already_added_items") or []

            if clarification_type == "menu_choice":
                selected_candidate = resolve_menu_choice(
                    normalized_message,
                    pending_clarification.get("candidates") or [],
                )
                if not selected_candidate:
                    set_last_visible_choices(
                        session_id,
                        pending_clarification.get("candidates") or [],
                        source="menu_choice",
                    )
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_menu_choice_prompt(
                            pending_clarification.get("item_query") or "item",
                            pending_clarification.get("candidates") or [],
                        ),
                        intent="add_items",
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=build_menu_choice_suggestions(
                            pending_clarification.get("candidates") or [],
                        ),
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "clarification_menu_choice_pending",
                        },
                    )

                base_item = dict(pending_clarification.get("requested_item") or {})
                base_item["item_name"] = selected_candidate.get("name")
                resolved.update({
                    "intent": "add_items",
                    "items": [base_item, *carry_requested_items],
                    "confidence": 1.0,
                    "route_to_fallback": False,
                    "_resolved_clarification": True,
                    "_carried_successful_items": carry_successful_items,
                })
                intent = "add_items"
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

            elif clarification_type == "item_customization":
                base_item = dict(pending_clarification.get("requested_item") or {})
                updated_item = apply_customization_response(
                    base_item,
                    normalized_message,
                    pending_clarification.get("menu_detail"),
                )
                remaining_groups = collect_missing_variant_groups(
                    updated_item,
                    pending_clarification.get("menu_detail"),
                )
                if remaining_groups:
                    session["pending_clarification"] = {
                        **pending_clarification,
                        "requested_item": updated_item,
                    }
                    session["last_items"] = [updated_item]
                    session["last_intent"] = "add_items"
                    set_session_stage(session_id, "item_customization")
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_customization_prompt(
                            updated_item.get("item_name") or "this item",
                            remaining_groups,
                        ),
                        intent="add_items",
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=build_customization_suggestions(remaining_groups),
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "clarification_item_customization_pending",
                        },
                    )

                resolved.update({
                    "intent": "add_items",
                    "items": [updated_item, *carry_requested_items],
                    "confidence": 1.0,
                    "route_to_fallback": False,
                    "_resolved_clarification": True,
                    "_carried_successful_items": carry_successful_items,
                })
                intent = "add_items"
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

        # Recovery path: if session stage says we're customizing but pending_clarification was lost
        if (
            not isinstance(pending_clarification, dict)
            and session is not None
            and get_session_stage(session_id) == "item_customization"
        ):
            last_items = session.get("last_items")
            last_item = last_items[0] if isinstance(last_items, list) and last_items and isinstance(last_items[0], dict) else None
            item_name = (last_item or {}).get("item_name") if isinstance(last_item, dict) else None

            if item_name:
                menu_items = await fetch_menu_items()
                matched_item = await find_menu_item_by_name(menu_items, item_name)
                if matched_item:
                    menu_item_id = matched_item.get("id") or matched_item.get("_id")
                    menu_detail = await fetch_menu_item_detail(menu_item_id) if menu_item_id is not None else None
                    updated_item = apply_customization_response(last_item, normalized_message, menu_detail)
                    remaining_groups = collect_missing_variant_groups(updated_item, menu_detail)

                    if remaining_groups:
                        session["pending_clarification"] = {
                            "type": "item_customization",
                            "requested_item": updated_item,
                            "menu_detail": menu_detail,
                        }
                        session["last_items"] = [updated_item]
                        session["last_intent"] = "add_items"
                        set_session_stage(session_id, "item_customization")
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_customization_prompt(updated_item.get("item_name") or "this item", remaining_groups),
                            intent="add_items",
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=build_customization_suggestions(remaining_groups),
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "clarification_recovered_item_customization_pending",
                            },
                        )

                    resolved.update({
                        "intent": "add_items",
                        "items": [updated_item],
                        "confidence": 1.0,
                        "route_to_fallback": False,
                        "_resolved_clarification": True,
                    })
                    intent = "add_items"
                    session["pending_clarification"] = None
                    set_session_stage(session_id, None)

        # "add it" shortcut — user said "add it" after a describe_item reply
        import re as _re
        _add_it_clean = _re.sub(r"[^a-z0-9\s]", "", normalized_message.strip().lower())
        _add_it_clean = _re.sub(r"\s+", " ", _add_it_clean).strip()
        _add_it_clean = _re.sub(r"\s+(please|pls|now|then|go|ahead)$", "", _add_it_clean).strip()
        _IS_ADD_IT = bool(_re.fullmatch(
            r"(yes\s+)?(ok\s+)?(good[!]?\s+|looks\s+good\s+|sounds\s+good\s+|great\s+|perfect\s+|sure\s+)?"
            r"(add\s+(it|this|that)|yes\s+add\s+(it|this|that))",
            _add_it_clean,
        ))
        if (
            session is not None
            and not isinstance(pending_clarification, dict)
            and _IS_ADD_IT
            and session.get("last_described_item")
        ):
            described_item = str(session.get("last_described_item") or "").strip()
            if described_item:
                resolved.update({
                    "intent": "add_items",
                    "items": [
                        {
                            "item_name": described_item,
                            "quantity": 1,
                            "size": None,
                            "options": {"milk": None, "sugar": None},
                            "addons": [],
                            "instructions": "",
                        }
                    ],
                    "confidence": 1.0,
                    "route_to_fallback": False,
                })
                intent = "add_items"

        # Bare affirmation with active pending clarification —
        # treat "yes/ok/sure" as confirmation of the pending question
        if (
            resolved.get("reason") == "bare_affirmation_needs_context"
            and isinstance(session.get("pending_clarification"), dict)
        ):
            clarification_type = session["pending_clarification"].get("type")
            if clarification_type == "menu_choice":
                # "yes" on a menu choice means "take the first candidate"
                candidates = session["pending_clarification"].get("candidates") or []
                if candidates:
                    first_candidate = candidates[0]
                    base_item = dict(
                        session["pending_clarification"].get("requested_item") or {})
                    base_item["item_name"] = first_candidate.get("name")
                    resolved.update({
                        "intent": "add_items",
                        "items": [base_item],
                        "confidence": 1.0,
                        "route_to_fallback": False,
                        "_resolved_clarification": True,
                    })
                    intent = "add_items"
                    session["pending_clarification"] = None
                    set_session_stage(session_id, None)
            elif clarification_type == "item_customization":
                # "yes" on customization means "add it as is"
                resolved.update({
                    "intent": "add_items",
                    "items": [
                        session["pending_clarification"].get("requested_item") or {}],
                    "confidence": 1.0,
                    "route_to_fallback": False,
                    "_resolved_clarification": True,
                })
                intent = "add_items"
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

        # ── Route to fallback assistant for low-confidence / unknown intent ──
        if resolved["route_to_fallback"]:
            fallback_reason = resolved.get("reason", "unknown_intent")
            static_fallback = STATIC_FALLBACK_MESSAGES.get(fallback_reason)
            if static_fallback:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=static_fallback,
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "fallback_response",
                        "fallback_reason": fallback_reason,
                        "fallback_source": "static",
                    },
                )

            fallback_reply = await generate_fallback_reply(
                normalized_message,
                reason=fallback_reason,
            )
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=fallback_reply or "I'm not sure how to help with that. Could you rephrase?",
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "fallback_response",
                    "fallback_reason": fallback_reason,
                    "fallback_source": "llm" if fallback_reply else "static",
                },
            )

        # ── pending_ops_confirmation stage ───────────────────────────────────
        if get_session_stage(session_id) == "pending_ops_confirmation":
            _YES_WORDS = frozenset({
                "yes", "yep", "yeah", "sure", "ok", "okay",
                "go ahead", "do it", "sounds good", "please",
                "yes please", "absolutely", "of course",
            })
            _NO_WORDS = frozenset({
                "no", "nope", "nah", "cancel", "nevermind",
                "never mind", "forget it", "stop", "no thanks",
            })

            if normalized_phrase in _YES_WORDS:
                set_session_stage(session_id, None)
                pending_ops = get_pending_operations(session_id)
                context = get_pending_operations_context(session_id)
                accumulated = list(context.get("reply_parts") or [])

                from app.services.executor import execute_compiled_operations
                from app.services.session_store import clear_pending_operations as _clr_pend
                _clr_pend(session_id)
                pending_compile_results = await _compile_pending_operations_for_drain(
                    pending_ops_raw=pending_ops,
                    session_id=session_id,
                    cart_id=cart_id,
                    session=session,
                )
                if pending_compile_results:
                    drain_result = await execute_compiled_operations(
                        compile_results=pending_compile_results,
                        session_id=session_id,
                        cart_id=cart_id,
                        session=session,
                        auth_cookie=auth_cookie,
                    )
                    if drain_result.reply and drain_result.reply != "Done.":
                        accumulated.append(drain_result.reply)
                    cart_id = drain_result.cart_id or cart_id
                    if drain_result.needs_followup:
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=" ".join(accumulated),
                            intent="unknown",
                            cart_updated=True,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "pending_ops_drain_guided",
                            },
                        )

                clear_pending_operations(session_id)
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Done! Anything else?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "pending_ops_confirmation_done",
                    },
                )

            elif normalized_phrase in _NO_WORDS:
                clear_pending_operations(session_id)
                set_session_stage(session_id, None)
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="No problem! What else can I get you?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "pending_ops_confirmation_cancelled",
                    },
                )

            else:
                # Unclear response — re-ask
                context = get_pending_operations_context(session_id)
                ops_text = context.get("pending_ops_description", "those items")
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"Just to confirm — did you still want to "
                          f"{ops_text}? Say yes or no.",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "pending_ops_confirmation_unclear",
                    },
                )

        if intent == "guided_order_response":
            return await _handle_guided_order_response(
                session_id=session_id,
                cart_id=cart_id,
                normalized_message=normalized_message,
                normalized_phrase=normalized_phrase,
                intent=intent,
                add_item_to_cart=add_item_to_cart,
            )
        # ── Multi-op passive+active gate ─────────────────────────────────────
        # When the LLM returns multiple ops and at least one is active and one
        # is passive, route through _run_typed_compiler_executor_intent so
        # active ops execute first. Without this, the top-level passive intent
        # handlers return early and silently drop the active ops.
        _all_ops = resolved.get("operations") or []
        _has_active = any(op.get("intent") in ACTIVE_INTENTS for op in _all_ops)
        _has_passive = any(op.get("intent") in PASSIVE_INTENTS for op in _all_ops)

        if len(_all_ops) > 1 and _has_active and _has_passive:
            _active_intent = next(
                op.get("intent") for op in _all_ops
                if op.get("intent") in ACTIVE_INTENTS
            )
            return await _run_typed_compiler_executor_intent(
                session_id=session_id,
                normalized_message=normalized_message,
                resolved=resolved,
                intent=_active_intent,
                session=session,
                cart_id=cart_id,
                auth_cookie=auth_cookie,
                missing_reply="I'm not sure what you'd like to do.",
                missing_stage="multi_op_missing",
            )

        if intent == "clear_cart":
            existing_cart = await get_cart(cart_id=cart_id)
            if not existing_cart["cart"]:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=(
                        "Your cart is already empty, and I cancelled that guided order."
                        if guided_interrupted
                        else "Your cart is already empty."
                    ),
                    intent=intent,
                    cart_updated=guided_interrupted,
                    cart_id=existing_cart["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": (
                            "guided_ordering_interrupted_clear_cart_empty"
                            if guided_interrupted
                            else "clear_cart_already_empty"
                        ),
                    },
                )

            cart_result = await clear_cart(cart_id=cart_id)
            if session is not None:
                session["last_items"] = []
                session["last_intent"] = None
                session["pending_clarification"] = None
                clear_pending_operations(session_id)
                set_session_stage(session_id, None)

            update_last_action(session_id, normalized_message, "Your cart is now empty.", intent, action_data={"cleared": True})

            _FOLLOW_UP_INTENTS = {"add_items", "remove_item", "update_quantity", "update_item"}
            remaining_operations = [
                op for op in (resolved.get("operations") or [])
                if op.get("intent") != "clear_cart"
            ]
            first_remaining_intent = remaining_operations[0].get("intent", "unknown") if remaining_operations else ""

            if remaining_operations and first_remaining_intent in _FOLLOW_UP_INTENTS:
                remaining_resolved = {
                    **resolved,
                    "intent": first_remaining_intent,
                    "items": remaining_operations[0].get("items") or [],
                    "operations": remaining_operations,
                    "route_to_fallback": False,
                }
                follow_up = await _run_typed_compiler_executor_intent(
                    session_id=session_id,
                    normalized_message=normalized_message,
                    resolved=remaining_resolved,
                    intent=first_remaining_intent,
                    session=session,
                    cart_id=cart_result["cart_id"],
                    auth_cookie=auth_cookie,
                    missing_reply="Done. What would you like to add?",
                    missing_stage="clear_cart_follow_up_missing",
                )
                combined_reply = f"Your cart is now empty. {follow_up.reply}"
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=combined_reply,
                    intent=follow_up.intent,
                    cart_updated=True,
                    cart_id=follow_up.cart_id,
                    defaults_used=follow_up.defaults_used,
                    suggestions=follow_up.suggestions,
                    metadata={
                        "normalized_message": normalized_message,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "clear_cart_with_follow_up",
                        **follow_up.metadata,
                    },
                )

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Your cart is now empty.",
                intent=intent,
                cart_updated=True,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "clear_cart_done",
                },
            )

        if intent == "view_cart":
            cart_result = await get_cart(cart_id=cart_id)
            cart_summary = build_cart_summary(cart_result["cart"])

            if cart_summary:
                reply_text = f"Here is your current cart:\n{cart_summary}"
            else:
                reply_text = "Your cart is empty."

            update_last_action(session_id, normalized_message, reply_text, intent, action_data={"cart_summary": cart_summary})

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "view_cart_done",
                },
            )

        if intent == "recommendation_query":
            featured_items = await fetch_featured_items()
            cart_result = await get_cart(cart_id=cart_id)
            cart_items = cart_result["cart"]
            menu_items = await fetch_menu_items()

            rec_category = extract_recommendation_category(normalized_message)
            rec_query_terms = extract_recommendation_query_terms(normalized_message)

            if not rec_category and not rec_query_terms and session and session.get("last_recommendation_query"):
                rec_category = session.get("last_recommendation_query")
                from app.services.menu_details import _looks_like_ice_cream_query

                if _looks_like_ice_cream_query(rec_category):
                    rec_category = "yogurt"
            menu_items_by_name = {
                (item.get("name") or "").lower(): item
                for item in menu_items
                if isinstance(item, dict) and item.get("name")
            }

            popular = suggest_popular_items(featured_items, limit=6)
            complementary = []
            if cart_items:
                anchor_item = cart_items[-1]
                complementary = suggest_complementary_items(menu_items, anchor_item, limit=4)

            upsell = await get_upsell_suggestions(
                session_id=session_id,
                intent=intent,
                cart_items=cart_items,
                menu_items=menu_items,
                anchor_menu_item=cart_items[-1] if cart_items else None,
            )

            raw_suggestions = popular + complementary + upsell
            all_suggestions = raw_suggestions
            used_broad_category_fallback = False
            used_term_only_fallback = False

            if rec_category or rec_query_terms:
                all_suggestions = filter_by_category(
                    all_suggestions,
                    rec_category,
                    menu_items_by_name,
                    rec_query_terms,
                )

                if not all_suggestions and rec_query_terms and rec_category:
                    all_menu_suggestions = [
                        {
                            "type": "menu_search",
                            "item_name": item.get("name"),
                            "menu_item_id": item.get("id"),
                        }
                        for item in menu_items
                        if isinstance(item, dict) and item.get("name")
                    ]
                    all_suggestions = filter_by_category(
                        all_menu_suggestions,
                        rec_category,
                        menu_items_by_name,
                        rec_query_terms,
                    )
                    if not all_suggestions:
                        all_suggestions = filter_by_category(
                            raw_suggestions,
                            rec_category,
                            menu_items_by_name,
                            [],
                        )
                        used_broad_category_fallback = bool(all_suggestions)

            if not all_suggestions and rec_query_terms and not rec_category:
                all_menu_suggestions = [
                    {
                        "type": "menu_search",
                        "item_name": item.get("name"),
                        "menu_item_id": item.get("id"),
                    }
                    for item in menu_items
                    if isinstance(item, dict) and item.get("name")
                ]
                all_suggestions = filter_by_category(
                    all_menu_suggestions,
                    None,
                    menu_items_by_name,
                    rec_query_terms,
                )
                if all_suggestions:
                    used_term_only_fallback = True
                else:
                    all_suggestions = filter_by_category(
                        raw_suggestions,
                        "food",
                        menu_items_by_name,
                        [],
                    )
                    if all_suggestions:
                        used_term_only_fallback = True

            seen_names: set[str] = set()
            filtered_suggestions = []
            for suggestion in all_suggestions:
                item_name = (suggestion.get("item_name") or "").strip()
                if not item_name:
                    continue
                key = item_name.lower()
                if key in seen_names:
                    continue
                seen_names.add(key)
                filtered_suggestions.append(suggestion)
                if len(filtered_suggestions) == 4:
                    break

            suggestion_lines = [f"- {s['item_name']}" for s in filtered_suggestions]
            if suggestion_lines:
                if rec_category:
                    if rec_category == "drink":
                        cat_label = "drinks"
                    elif rec_category == "yogurt":
                        cat_label = "yogurt items"
                    else:
                        cat_label = "food"
                    if used_broad_category_fallback and rec_query_terms:
                        requested = " ".join(rec_query_terms)
                        reply_text = (
                            f"I couldn't find specific {requested} right now, but here are some {cat_label} you might like:\n"
                            + "\n".join(suggestion_lines)
                        )
                    else:
                        reply_text = f"Here are some {cat_label} you might like:\n" + "\n".join(suggestion_lines)
                elif used_term_only_fallback and rec_query_terms:
                    requested = " ".join(rec_query_terms)
                    reply_text = (
                        f"I couldn't find exact matches for {requested}, but here are items you might like:\n"
                        + "\n".join(suggestion_lines)
                    )
                else:
                    reply_text = "Here are some picks you might like:\n" + "\n".join(suggestion_lines)
            else:
                if rec_category:
                    if rec_category == "drink":
                        cat_label = "drinks"
                    elif rec_category == "yogurt":
                        cat_label = "yogurt items"
                    else:
                        cat_label = "food items"
                    reply_text = f"I don't have specific {cat_label} to suggest right now — try browsing the menu!"
                else:
                    reply_text = "I can help with suggestions once you add an item to your cart."

            set_last_visible_choices(
                session_id,
                filtered_suggestions if suggestion_lines else [],
                source="recommendation",
            )
            update_last_action(
                session_id,
                normalized_message,
                reply_text,
                intent,
                matched_items=filtered_suggestions,
                action_data={"visible_choices": filtered_suggestions},
            )

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=filtered_suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "recommendation_category": rec_category,
                    "recommendation_query_terms": rec_query_terms,
                    "used_broad_category_fallback": used_broad_category_fallback,
                    "used_term_only_fallback": used_term_only_fallback,
                    "pipeline_stage": "recommendation_done",
                },
            )

        if intent == "list_categories":
            menu_items = await fetch_menu_items()
            seen: set = set()
            categories = []
            for item in menu_items:
                cat = item.get("category")
                name = (cat.get("name") if isinstance(cat, dict) else str(cat or "")).strip()
                if name and name.lower() not in seen:
                    seen.add(name.lower())
                    categories.append(name)
            categories.sort()

            if categories:
                reply_text = "Here's what we serve:\n" + "\n".join(f"- {c}" for c in categories)
            else:
                reply_text = "We have a wide selection of food and drinks. What are you in the mood for?"

            update_last_action(
                session_id,
                normalized_message,
                reply_text,
                intent,
                action_data={"categories": categories},
            )

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "categories": categories,
                    "pipeline_stage": "list_categories_done",
                },
            )

        if intent == "list_category_items":
            _first_item = (resolved.get("items") or [{}])[0]
            category_query = (
                str(_first_item.get("category") or _first_item.get("item_query") or "")
                .strip().lower()
            )
            menu_items = await fetch_menu_items()

            matched = filter_menu_items_by_category_query(menu_items, category_query)

            if matched:
                cat_label = category_name_from_item(matched[0]) or category_query
                lines = [
                    f"- {item['name']}  ({_fmt_price(item.get('basePrice'))})"
                    for item in matched[:12]
                ]
                reply_text = f"Here's what we have in {cat_label}:\n" + "\n".join(lines)
                if len(matched) > 12:
                    reply_text += f"\n...and {len(matched) - 12} more. What catches your eye?"
                suggestions = [{"item_name": item["name"]} for item in matched[:4]]
                set_last_visible_choices(
                    session_id,
                    matched[:12],
                    source="list_category_items",
                )
            else:
                # Soft fallback: list categories instead
                seen2: set = set()
                categories2 = []
                for item in menu_items:
                    cat = item.get("category")
                    name = (cat.get("name") if isinstance(cat, dict) else str(cat or "")).strip()
                    if name and name.lower() not in seen2:
                        seen2.add(name.lower())
                        categories2.append(name)
                categories2.sort()
                if categories2:
                    reply_text = (
                        f"I couldn't find items in '{category_query}'. Here's what we serve:\n"
                        + "\n".join(f"- {c}" for c in categories2)
                    )
                else:
                    reply_text = f"I couldn't find '{category_query}' on the menu. What are you in the mood for?"
                suggestions = []
                set_last_visible_choices(session_id, [], source="list_category_items")

            update_last_action(
                session_id,
                normalized_message,
                reply_text,
                intent,
                matched_items=suggestions,
                action_data={"category_query": category_query, "visible_choices": suggestions},
            )

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "category_query": category_query,
                    "pipeline_stage": "list_category_items_done",
                },
            )

        if intent == "describe_item":
            from app.services.menu_details import process_describe_item
            describe_response = await process_describe_item(
                session_id=session_id,
                normalized_message=normalized_message,
                intent=intent,
                cart_id=cart_id,
            )
            if session is not None:
                described_item = (
                    (describe_response.metadata or {}).get("item_query")
                    or (describe_response.metadata or {}).get("matched_item", {}).get("name")
                )
                if isinstance(described_item, str) and described_item.strip():
                    session["last_described_item"] = described_item.strip()
            return describe_response

        if intent == "checkout":
            cart_result = await get_cart(cart_id=cart_id)
            if not cart_result["cart"]:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Your cart is empty. Add some items first, then head to checkout.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "checkout_empty_cart",
                    },
                )

            bill = _build_bill(cart_result["cart"])
            set_session_stage(session_id, "checkout_summary")
            reply_text = "Ready to checkout? Here's your order summary."
            update_last_action(session_id, normalized_message, reply_text, intent, action_data={"bill": bill})
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "checkout_summary",
                    "bill": bill,
                },
            )

        if intent == "confirm_checkout":
            last_stage = get_session_stage(session_id)

            if last_stage != "checkout_summary":
                cart_result = await get_cart(cart_id=cart_id)
                if not cart_result["cart"]:
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply="Your cart is empty. Add some items first!",
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "checkout_empty_cart",
                        },
                    )

                bill = _build_bill(cart_result["cart"])
                set_session_stage(session_id, "checkout_summary")
                been_through_checkout = get_checkout_initiated(session_id)

                reply = (
                    "Welcome back! Here's your order - ready when you are."
                    if been_through_checkout
                    else "Ready to checkout? Here's your order summary."
                )

                update_last_action(session_id, normalized_message, reply, intent, action_data={"bill": bill})
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply,
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "checkout_summary",
                        "bill": bill,
                    },
                )

            cart_result = await get_cart(cart_id=cart_id)
            if not cart_result["cart"]:
                set_session_stage(session_id, None)
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Uh oh - your cart is empty now! Add some items and we'll get you checked out.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "checkout_empty_cart",
                    },
                )

            set_session_stage(session_id, "checkout_redirect")
            set_checkout_initiated(session_id, True)
            if session is not None:
                session["last_checked_out_items"] = [
                    {
                        "menuItemId": item.get("menuItemId"),
                        "qty": int(item.get("qty") or 1),
                        "selectedOptions": item.get("selectedOptions") if isinstance(item.get("selectedOptions"), list) else [],
                        "instructions": str(item.get("instructions") or ""),
                        "name": str(item.get("name") or "").strip(),
                    }
                    for item in cart_result.get("cart", [])
                    if isinstance(item, dict)
                ]

            reply_text = "Great! Taking you to checkout now."
            update_last_action(session_id, normalized_message, reply_text, intent, action_data={"checkout": True})
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "checkout_redirect",
                },
            )

        if intent == "update_quantity":
            return await _run_typed_compiler_executor_intent(
                session_id=session_id,
                normalized_message=normalized_message,
                resolved=resolved,
                intent=intent,
                session=session,
                cart_id=cart_id,
                auth_cookie=auth_cookie,
                missing_reply="Please tell me which item in your cart you'd like to update.",
                missing_stage="update_quantity_missing",
            )

        if intent == "update_item":
            return await _run_typed_compiler_executor_intent(
                session_id=session_id,
                normalized_message=normalized_message,
                resolved=resolved,
                intent=intent,
                session=session,
                cart_id=cart_id,
                auth_cookie=auth_cookie,
                missing_reply="Please tell me which item you'd like to update.",
                missing_stage="update_item_missing",
            )

        if intent == "remove_item":
            return await _run_typed_compiler_executor_intent(
                session_id=session_id,
                normalized_message=normalized_message,
                resolved=resolved,
                intent=intent,
                session=session,
                cart_id=cart_id,
                auth_cookie=auth_cookie,
                missing_reply="Please tell me which item you'd like to remove.",
                missing_stage="remove_item_missing",
            )

        if intent in {"add_items", "add_item", "repeat_order"}:
            from app.services.executor import execute_compiled_operations
            from app.services.compiler import compile_operation

            if intent == "repeat_order":
                from app.schemas.actions import ParsedItemRequest, ParsedOperation, ParsedRequest

                order_fetch_failed = False
                order_fetch_auth_error = False
                try:
                    recent_orders = await fetch_my_orders(auth_cookie=auth_cookie, limit=20)
                except ExpressAPIError as e:
                    recent_orders = []
                    order_fetch_failed = True
                    if "401" in str(e) or "403" in str(e) or "unauthorized" in str(e).lower():
                        order_fetch_auth_error = True
                except Exception:
                    recent_orders = []
                    order_fetch_failed = True
                order_history_items: list[dict] = []
                for order in (recent_orders or []):
                    if not isinstance(order, dict):
                        continue
                    if str(order.get("status") or "").strip().lower() == "cancelled":
                        continue
                    order_items = order.get("items")
                    if not isinstance(order_items, list) or not order_items:
                        continue
                    normalized_lines = []
                    for line in order_items:
                        if not isinstance(line, dict):
                            continue
                        mid = line.get("menuItemId")
                        qty = int(line.get("qty") or 1)
                        name = str(line.get("name") or "").strip()
                        if mid is None or qty < 1 or not name:
                            continue
                        normalized_lines.append(
                            {
                                "name": name,
                                "qty": qty,
                                "selectedOptions": line.get("selectedOptions")
                                if isinstance(line.get("selectedOptions"), list) else [],
                                "instructions": str(line.get("instructions") or ""),
                            }
                        )
                    if normalized_lines:
                        order_history_items = normalized_lines
                        break

                session_items: list[dict] = []
                if not order_history_items:
                    raw_last = (session or {}).get("last_items") or []
                    for item in raw_last:
                        if not isinstance(item, dict):
                            continue
                        name = str(item.get("item_name") or item.get("name") or "").strip()
                        qty = int(item.get("quantity") or item.get("qty") or 1)
                        if name and qty >= 1:
                            session_items.append(
                                {
                                    "name": name,
                                    "qty": qty,
                                    "selectedOptions": [],
                                    "instructions": "",
                                }
                            )

                items_to_repeat = order_history_items or session_items
                if not items_to_repeat:
                    if order_fetch_auth_error:
                        _no_history_reply = (
                            "I couldn't access your order history — "
                            "please sign in to use this feature."
                        )
                    elif order_fetch_failed:
                        _no_history_reply = (
                            "I couldn't reach your order history right now. "
                            "Please try again in a moment."
                        )
                    else:
                        _no_history_reply = (
                            "I don't have a record of a previous order. "
                            "Sign in to access your order history, or tell me what you'd like."
                        )
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=_no_history_reply,
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "repeat_order_no_history",
                        },
                    )

                # Items with stored options → add directly (preserve customizations)
                # Items without stored options → go through normal compile path
                direct_add_items = [
                    item for item in items_to_repeat
                    if item.get("selectedOptions")
                ]
                compile_add_items = [
                    item for item in items_to_repeat
                    if not item.get("selectedOptions")
                ]

                # Direct-add path: bypass compiler to preserve stored customizations
                direct_reply_parts: list[str] = []
                for item in direct_add_items:
                    try:
                        from app.services.tools import find_menu_item_by_name, add_item_to_cart as _add_item
                        _menu_for_direct = await fetch_menu_items()
                        matched = await find_menu_item_by_name(_menu_for_direct, item["name"])
                        if not matched:
                            direct_reply_parts.append(
                                f"I couldn't find {item['name']} on the menu anymore."
                            )
                            continue
                        _direct_menu_item_id = matched.get("id") or matched.get("_id")
                        if _direct_menu_item_id is None:
                            continue
                        _cart_result_repeat = await _add_item(
                            menu_item_id=_direct_menu_item_id,
                            qty=item["qty"],
                            selected_options=item["selectedOptions"],
                            instructions=item.get("instructions") or "",
                            cart_id=cart_id,
                        )
                        cart_id = _cart_result_repeat["cart_id"]
                        _opts = item.get("selectedOptions") or []
                        _opt_labels = [
                            str(o.get("optionName") or "").strip()
                            for o in _opts
                            if isinstance(o, dict) and o.get("optionName")
                        ]
                        _suffix = f" ({', '.join(_opt_labels)})" if _opt_labels else ""
                        _qty_prefix = f"{item['qty']}x " if item["qty"] > 1 else ""
                        direct_reply_parts.append(
                            f"Added {_qty_prefix}{item['name']}{_suffix} to your cart."
                        )
                    except Exception as _repeat_err:
                        if isinstance(_repeat_err, ExpressAPIError) and is_out_of_stock_error(_repeat_err):
                            direct_reply_parts.append(
                                f"{item['name']} is out of stock right now."
                            )
                        else:
                            direct_reply_parts.append(
                                f"Couldn't re-add {item['name']} right now."
                            )

                if direct_add_items and not compile_add_items:
                    _combined_reply = " ".join(direct_reply_parts)
                    if session is not None:
                        session["cart_id"] = cart_id
                        session["last_items"] = [
                            {
                                "item_name": item["name"],
                                "quantity": item["qty"],
                                "menu_item_id": None,
                                "selected_options": item.get("selectedOptions") or [],
                                "instructions": item.get("instructions") or "",
                            }
                            for item in direct_add_items
                        ]
                    update_last_action(session_id, normalized_message, _combined_reply, intent)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=_combined_reply,
                        intent="repeat_order",
                        cart_updated=True,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "repeat_order_done",
                        },
                    )

                # Compile path for items without stored options
                repeat_items = [
                    ParsedItemRequest(
                        item_query=item["name"],
                        quantity=item["qty"],
                    )
                    for item in compile_add_items
                ]
                repeat_request = ParsedRequest(
                    operations=[ParsedOperation(intent="add_items", items=repeat_items)],
                    confidence=1.0,
                )

                _menu_for_compile = await fetch_menu_items()
                try:
                    _cart_raw = await get_cart(cart_id=cart_id)
                except Exception:
                    _cart_raw = {"cart_id": cart_id, "cart": []}

                _compile_results = []
                for _cop in repeat_request.operations:
                    _compile_results.extend(
                        await compile_operation(_cop, session, _cart_raw, _menu_for_compile)
                    )

                exec_result = await execute_compiled_operations(
                    compile_results=_compile_results,
                    session_id=session_id,
                    cart_id=cart_id,
                    session=session,
                    auth_cookie=auth_cookie,
                )
                if session is not None:
                    session["cart_id"] = exec_result.cart_id
                _final_reply = (
                    " ".join(direct_reply_parts) + " " + exec_result.reply
                    if direct_reply_parts else exec_result.reply
                )
                update_last_action(session_id, normalized_message, _final_reply, intent)
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=_final_reply,
                    intent=exec_result.intent_for_response or "repeat_order",
                    cart_updated=exec_result.cart_updated or bool(direct_reply_parts),
                    cart_id=exec_result.cart_id,
                    defaults_used=exec_result.defaults_used,
                    suggestions=exec_result.suggestions,
                    metadata={"normalized_message": normalized_message, **exec_result.metadata},
                )

            # ── Compile + execute path ────────────────────────────────────
            parsed_request = _resolved_to_parsed_request(resolved, intent, session, normalized_message)
            if parsed_request is None or not parsed_request.operations:
                return ChatMessageResponse(
                    session_id=session_id, status="ok",
                    reply="I'm not sure what you'd like to add.",
                    intent="add_items", cart_updated=False, cart_id=cart_id,
                    defaults_used=[], suggestions=[],
                    metadata={"normalized_message": normalized_message, "pipeline_stage": "add_items_missing"},
                )

            _menu_for_compile = await fetch_menu_items()
            try:
                _cart_raw = await get_cart(cart_id=cart_id)
            except Exception:
                _cart_raw = {"cart_id": cart_id, "cart": []}
            _compile_results = []
            for _cop in parsed_request.operations:
                _compile_results.extend(
                    await compile_operation(_cop, session, _cart_raw, _menu_for_compile)
                )
            _log_add_items_compile_results(
                session_id=session_id,
                normalized_message=normalized_message,
                parsed_request=parsed_request,
                compile_results=_compile_results,
            )

            exec_result = await execute_compiled_operations(
                compile_results=_compile_results,
                session_id=session_id,
                cart_id=cart_id,
                session=session,
                auth_cookie=auth_cookie,
            )

            if session is not None:
                session["cart_id"] = exec_result.cart_id
                session["pending_clarification"] = None
                if not exec_result.needs_followup:
                    set_session_stage(session_id, None)

            update_last_action(
                session_id, normalized_message, exec_result.reply,
                exec_result.intent_for_response or intent,
            )

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=exec_result.reply,
                intent=exec_result.intent_for_response or intent,
                cart_updated=exec_result.cart_updated,
                cart_id=exec_result.cart_id,
                defaults_used=exec_result.defaults_used,
                suggestions=exec_result.suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "size_upgrade": exec_result.size_upgrade,
                    **exec_result.metadata,
                },
            )

        # Safety net — should not be reached after the pipeline routes properly.
        logger.warning({"stage": "unhandled_intent", "intent": intent, "normalized_message": normalized_message})
        fallback_reply = await generate_fallback_reply(
            normalized_message,
            reason="unknown_intent",
        )
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=fallback_reply or "I'm not sure how to help with that yet.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "fallback_response",
                "fallback_source": "llm" if fallback_reply else "static",
            },
        )

    except (ExpressAPIError, httpx.RequestError) as e:
        return ChatMessageResponse(
            session_id=session_id,
            status="error",
            reply="I'm having trouble reaching the cafe system right now. Please try again in a moment.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "error": str(e),
                "pipeline_stage": "backend_unavailable",
            },
        )
    except Exception as e:
        logger.exception(
            {
                "stage": "unexpected_error",
                "error": str(e),
            }
        )
        return ChatMessageResponse(
            session_id=session_id,
            status="error",
            reply="Something went wrong while processing your request.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "error": str(e),
                "pipeline_stage": "unexpected_error",
            },
        )
