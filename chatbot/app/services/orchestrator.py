import logging
import re
import httpx

from app.schemas.chat import ChatMessageResponse
from app.services.llm_interpreter import try_interpret_message, _extract_add_items_from_message
from app.services.session_store import (
    Session,
    get_session_stage,
    set_session_stage,
    get_checkout_initiated,
    set_checkout_initiated,
)

logger = logging.getLogger(__name__)

SIZE_CANDIDATES = {
    "small": ["small"],
    "medium": ["medium", "med"],
    "large": ["large"],
}

MILK_CANDIDATES = {
    "almond milk": ["almond milk"],
    "oat milk": ["oat milk"],
    "soy milk": ["soy milk"],
    "skim milk": ["skim milk"],
    "whole milk": ["whole milk", "full fat"],
    "regular milk": ["regular milk", "whole milk", "full fat"],
    "full fat": ["full fat", "whole milk", "regular milk"],
    "lactose free": ["lactose free"],
    "coconut milk": ["coconut milk"],
}

ADDON_CANDIDATES = {
    "extra shot": ["extra shot", "add shot"],
    "add shot": ["add shot", "extra shot"],
    "vanilla syrup": ["vanilla syrup", "vanilla"],
    "caramel syrup": ["caramel syrup", "caramel"],
    "caramel sugar free": ["caramel sugar free"],
    "vanilla sugar free": ["vanilla sugar free"],
    "hazelnut": ["hazelnut"],
    "white mocha": ["white mocha"],
    "mocha": ["mocha"],
    "whipped cream": ["whipped cream"],
    "caramel drizzle": ["caramel drizzle"],
    "chocolate drizzle": ["chocolate drizzle"],
    "chocolate chips": ["chocolate chips"],
    "decaf": ["decaf", "decaffe", "shot decaffe"],
    "yirgacheffe shot": ["yirgacheffe shot"],
    "extra bag": ["extra bag"],
}


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


def detect_special_command(message: str) -> str | None:
    message = message.lower()

    if any(
        phrase in message
        for phrase in [
            "clear cart",
            "empty cart",
            "remove all",
            "start over",
            "reset cart",
            "clear my cart",
            "delete my cart",
            "empty my cart",
            "delete cart",
        ]
    ):
        return "clear_cart"
    if any(
        phrase in message
        for phrase in [
            "checkout",
            "check out",
            "place order",
            "pay now",
            "confirm order",
            "proceed to pay",
            "i want to pay",
        ]
    ):
        return "checkout"
    if any(
        phrase in message
        for phrase in [
            "recommend",
            "suggest",
            "good today",
            "what's good",
            "whats good",
            "surprise",
            "popular",
            "what do you have",
        ]
    ):
        return "recommendation_query"

    return None


def has_mixed_intent(message: str) -> bool:
    message = message.lower()
    has_add = bool(
        re.search(
            r"\b(add|get|order)\b|want to (?:add|order)|would like to (?:add|order)",
            message,
        )
    )
    has_remove = bool(re.search(r"\b(remove|delete)\b", message))
    has_update = bool(re.search(r"\b(set|update)\b", message)) or (
        any(char.isdigit() for char in message)
        and bool(re.search(r"\b(change|make)\b", message))
    )

    return sum([has_add, has_remove, has_update]) > 1


def detect_intent(message: str) -> str:
    message = message.lower()
    has_digit = any(char.isdigit() for char in message)

    if any(word in message for word in ["remove", "delete"]):
        return "remove_item"
    if "set" in message or "update" in message:
        return "update_quantity"
    if has_digit and any(word in message for word in ["change", "make"]):
        return "update_quantity"
    if "cart" in message:
        return "view_cart"
    if any(phrase in message for phrase in ["checkout", "check out", "place order", "pay now"]):
        return "checkout"
    if any(word in message for word in ["add", "get", "order", "want"]):
        return "add_items"

    return "unknown"


def extract_item_query(message: str, default_quantity: int | None = 1):
    message = message.lower()

    words = message.split()
    quantity = default_quantity

    for word in words:
        if word.isdigit():
            quantity = int(word)

    ignore_words = {
        "a",
        "add",
        "an",
        "cart",
        "change",
        "delete",
        "from",
        "get",
        "i",
        "it",
        "make",
        "me",
        "my",
        "only",
        "order",
        "please",
        "quantity",
        "remove",
        "set",
        "the",
        "to",
        "update",
        "want",
    }

    item_words = [w for w in words if w not in ignore_words and not w.isdigit()]
    item_query = " ".join(item_words)

    return item_query, quantity


def extract_requested_items(interpretation: dict) -> list[dict]:
    items = interpretation.get("items")
    normalized_items = []
    default_quantity = 1 if interpretation.get("intent") in {"add_item", "add_items"} else None

    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue

            item_name = (item.get("item_name") or "").strip()
            if not item_name:
                continue

            quantity = item.get("quantity")
            if quantity is None and default_quantity is not None:
                quantity = default_quantity

            normalized_items.append(
                {
                    "item_name": item_name,
                    "quantity": quantity,
                    "size": item.get("size"),
                    "options": item.get("options")
                    if isinstance(item.get("options"), dict)
                    else {"milk": None, "sugar": None},
                    "addons": item.get("addons")
                    if isinstance(item.get("addons"), list)
                    else [],
                    "instructions": item.get("instructions")
                    if isinstance(item.get("instructions"), str)
                    else "",
                }
            )

    if normalized_items:
        return normalized_items

    legacy_item_name = (interpretation.get("item_name") or "").strip()
    if not legacy_item_name:
        return []

    legacy_quantity = interpretation.get("quantity")
    if legacy_quantity is None and default_quantity is not None:
        legacy_quantity = default_quantity

    return [
        {
            "item_name": legacy_item_name,
            "quantity": legacy_quantity,
            "size": interpretation.get("size"),
            "options": interpretation.get("options")
            if isinstance(interpretation.get("options"), dict)
            else {"milk": None, "sugar": None},
            "addons": interpretation.get("addons")
            if isinstance(interpretation.get("addons"), list)
            else [],
            "instructions": interpretation.get("instructions")
            if isinstance(interpretation.get("instructions"), str)
            else "",
        }
    ]


def resolve_requested_items_from_session(
    intent: str,
    requested_items: list[dict],
    interpretation: dict,
    session: Session | None,
) -> list[dict]:
    if session is None or intent not in {"update_quantity", "remove_item"}:
        return requested_items

    session_items = session.get("last_items")
    if not isinstance(session_items, list) or not session_items:
        return requested_items

    session_item = session_items[0]
    if not isinstance(session_item, dict):
        return requested_items

    session_item_name = (session_item.get("item_name") or "").strip()
    if not session_item_name:
        return requested_items

    if requested_items:
        current_item = requested_items[0]
        if (current_item.get("item_name") or "").strip():
            return requested_items
    else:
        raw_items = interpretation.get("items")
        if isinstance(raw_items, list) and raw_items:
            current_item = raw_items[0] if isinstance(raw_items[0], dict) else {}
        else:
            current_item = {
                "item_name": interpretation.get("item_name"),
                "quantity": interpretation.get("quantity"),
                "size": interpretation.get("size"),
                "options": interpretation.get("options"),
                "addons": interpretation.get("addons"),
                "instructions": interpretation.get("instructions"),
            }

        if (current_item.get("item_name") or "").strip():
            return requested_items

    current_quantity = current_item.get("quantity")
    current_size = current_item.get("size")
    current_options = current_item.get("options")
    current_addons = current_item.get("addons")
    current_instructions = current_item.get("instructions")
    session_options = session_item.get("options")
    options = current_options if isinstance(current_options, dict) else session_options
    if not isinstance(options, dict):
        options = {"milk": None, "sugar": None}
    addons = current_addons if isinstance(current_addons, list) else session_item.get("addons", [])
    if not isinstance(addons, list):
        addons = []
    instructions = current_instructions if isinstance(current_instructions, str) else session_item.get("instructions", "")
    if not isinstance(instructions, str):
        instructions = ""

    return [
        {
            "item_name": session_item_name,
            "quantity": current_quantity if current_quantity is not None else (
                session_item.get("quantity") if intent == "remove_item" else None
            ),
            "size": current_size if current_size is not None else session_item.get("size"),
            "options": options,
            "addons": addons,
            "instructions": instructions,
        }
    ]


def resolve_add_items_from_session(
    requested_items: list[dict],
    interpretation: dict,
    session: Session | None,
) -> list[dict]:
    if session is None or not interpretation.get("fallback_needed", False):
        return requested_items

    follow_up_item_names = {
        "same one",
        "another one",
        "one more",
        "more",
        "another",
        "item",
        "it",
        "that",
        "this",
    }

    if requested_items:
        current_item = requested_items[0]
        current_item_name = (current_item.get("item_name") or "").strip().lower()
        if current_item_name and current_item_name not in follow_up_item_names:
            return requested_items
    else:
        raw_items = interpretation.get("items")
        if isinstance(raw_items, list) and raw_items:
            current_item = raw_items[0] if isinstance(raw_items[0], dict) else {}
        else:
            current_item = {
                "item_name": interpretation.get("item_name"),
                "quantity": interpretation.get("quantity"),
                "size": interpretation.get("size"),
                "options": interpretation.get("options"),
                "addons": interpretation.get("addons"),
                "instructions": interpretation.get("instructions"),
            }

        current_item_name = (current_item.get("item_name") or "").strip().lower()
        current_quantity = current_item.get("quantity")
        if current_quantity is None:
            current_quantity = interpretation.get("quantity")

        if (
            current_item_name
            and current_item_name not in follow_up_item_names
            and current_quantity is None
        ):
            return requested_items

    session_items = session.get("last_items")
    if not isinstance(session_items, list) or not session_items:
        return requested_items

    session_item = session_items[0]
    if not isinstance(session_item, dict):
        return requested_items

    session_item_name = (session_item.get("item_name") or "").strip()
    if not session_item_name:
        return requested_items

    current_size = current_item.get("size")
    current_options = current_item.get("options")
    current_addons = current_item.get("addons")
    current_instructions = current_item.get("instructions")
    session_options = session_item.get("options")
    options = current_options if isinstance(current_options, dict) else session_options
    if not isinstance(options, dict):
        options = {"milk": None, "sugar": None}
    session_addons = session_item.get("addons") if isinstance(session_item.get("addons"), list) else []
    addons = current_addons if isinstance(current_addons, list) else session_addons
    if not isinstance(addons, list):
        addons = []
    session_instructions = session_item.get("instructions") if isinstance(session_item.get("instructions"), str) else ""
    instructions = current_instructions if isinstance(current_instructions, str) else session_instructions
    if not isinstance(instructions, str):
        instructions = ""
    quantity = current_item.get("quantity")
    if quantity is None:
        quantity = interpretation.get("quantity")
    if quantity is None:
        quantity = 1

    return [
        {
            "item_name": session_item_name,
            "quantity": quantity,
            "size": current_size if current_size is not None else session_item.get("size"),
            "options": options,
            "addons": addons,
            "instructions": instructions,
        }
    ]


def is_invalid_fallback_query(item_query: str) -> bool:
    if not item_query:
        return True

    words = item_query.split()
    return len(words) > 6


def validate_requested_items(
    message: str,
    intent: str,
    requested_items: list[dict],
    fallback_needed: bool,
) -> bool:
    if has_mixed_intent(message):
        return False

    if intent in {"add_item", "add_items"}:
        if not requested_items:
            return False

        if any(not (item.get("item_name") or "").strip() for item in requested_items):
            return False

        if any((item.get("quantity") or 0) < 1 for item in requested_items):
            return False

        if any(" and " in (item.get("item_name") or "").lower() for item in requested_items):
            return False

        if fallback_needed and any(is_invalid_fallback_query(item.get("item_name", "")) for item in requested_items):
            return False

    if intent in {"update_quantity", "remove_item"}:
        if not requested_items:
            return False
        if not (requested_items[0].get("item_name") or "").strip():
            return False
        if len(requested_items) > 1:
            return False

    return True


def normalize_modifier_text(value: str | None) -> str:
    if value is None:
        return ""

    normalized = re.sub(r"[^a-z0-9\s]+", " ", str(value).lower())
    return " ".join(normalized.split())


def add_unique_phrase(parts: list[str], value: str | None) -> None:
    if not isinstance(value, str):
        return

    cleaned_value = value.strip()
    normalized_value = normalize_modifier_text(cleaned_value)
    if not cleaned_value or not normalized_value:
        return

    if any(normalize_modifier_text(existing) == normalized_value for existing in parts):
        return

    parts.append(cleaned_value)


def expand_candidates(raw_value: str | None, candidate_map: dict[str, list[str]]) -> list[str]:
    normalized_value = normalize_modifier_text(raw_value)
    if not normalized_value:
        return []

    candidates = [normalized_value]
    for key, aliases in candidate_map.items():
        normalized_key = normalize_modifier_text(key)
        normalized_aliases = [normalize_modifier_text(alias) for alias in aliases]
        if normalized_value == normalized_key or normalized_value in normalized_aliases:
            candidates.extend(normalized_aliases)

    unique_candidates = []
    seen = set()
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.add(candidate)
            unique_candidates.append(candidate)

    return unique_candidates


def build_customization_instruction_parts(requested_item: dict) -> list[str]:
    parts: list[str] = []
    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}

    add_unique_phrase(parts, requested_item.get("size"))
    add_unique_phrase(parts, options.get("milk"))
    add_unique_phrase(parts, options.get("sugar"))

    addons = requested_item.get("addons")
    if isinstance(addons, list):
        for addon in addons:
            add_unique_phrase(parts, addon)

    add_unique_phrase(parts, requested_item.get("instructions"))
    return parts


def requested_item_has_customization(requested_item: dict) -> bool:
    return bool(build_customization_instruction_parts(requested_item))


def iter_variant_options(menu_detail: dict | None) -> list[tuple[dict, dict]]:
    if not isinstance(menu_detail, dict):
        return []

    variants = menu_detail.get("variants")
    if not isinstance(variants, list):
        return []

    variant_options: list[tuple[dict, dict]] = []
    for group in variants:
        if not isinstance(group, dict):
            continue
        options = group.get("options")
        if not isinstance(options, list):
            continue
        for option in options:
            if isinstance(option, dict) and option.get("name"):
                variant_options.append((group, option))

    return variant_options


def score_variant_option(
    group: dict,
    option: dict,
    candidates: list[str],
    *,
    group_keywords: list[str] | None = None,
    preferred_size: str | None = None,
    allow_contains: bool = True,
    enforce_preferred_size: bool = False,
) -> int:
    option_name = normalize_modifier_text(option.get("name"))
    if not option_name:
        return 0

    group_name = normalize_modifier_text(group.get("name"))
    if group_keywords and not any(keyword in group_name for keyword in group_keywords):
        return 0

    option_sizes = [size for size in ("small", "medium", "large") if size in option_name]
    if enforce_preferred_size and option_sizes:
        if not preferred_size or preferred_size not in option_sizes:
            return 0

    score = 0
    for candidate in candidates:
        if not candidate:
            continue
        if option_name == candidate:
            score = max(score, 100)
        elif allow_contains and (candidate in option_name or option_name in candidate):
            score = max(score, 80)

    if score and preferred_size and preferred_size in option_name:
        score += 5

    is_active = option.get("isActive")
    if score and is_active is False:
        score -= 2

    return score


def find_variant_option(
    menu_detail: dict | None,
    candidates: list[str],
    *,
    group_keywords: list[str] | None = None,
    preferred_size: str | None = None,
    allow_contains: bool = True,
    enforce_preferred_size: bool = False,
) -> dict | None:
    best_option = None
    best_score = 0

    for group, option in iter_variant_options(menu_detail):
        score = score_variant_option(
            group,
            option,
            candidates,
            group_keywords=group_keywords,
            preferred_size=preferred_size,
            allow_contains=allow_contains,
            enforce_preferred_size=enforce_preferred_size,
        )
        if score > best_score:
            best_score = score
            best_option = option

    return best_option


def append_selected_option(selected_options: list[dict], option_name: str | None) -> None:
    if not isinstance(option_name, str) or not option_name.strip():
        return

    option_key = normalize_modifier_text(option_name)
    for existing in selected_options:
        existing_name = existing.get("optionName") if isinstance(existing, dict) else None
        if normalize_modifier_text(existing_name) == option_key:
            return

    selected_options.append({"optionName": option_name.strip()})


def map_requested_item_to_selected_options(
    requested_item: dict,
    menu_detail: dict | None,
) -> tuple[list[dict], str]:
    if not isinstance(requested_item, dict):
        return [], ""

    selected_options: list[dict] = []
    instruction_parts: list[str] = []
    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}

    resolved_size = None
    size_value = requested_item.get("size")
    if isinstance(size_value, str) and size_value.strip():
        size_candidates = expand_candidates(size_value, SIZE_CANDIDATES)
        preferred_size = next(
            (candidate for candidate in size_candidates if candidate in {"small", "medium", "large"}),
            size_candidates[0] if size_candidates else None,
        )
        matched_size = find_variant_option(
            menu_detail,
            size_candidates,
            group_keywords=["size"],
            allow_contains=True,
        )
        if matched_size:
            append_selected_option(selected_options, matched_size.get("name"))
            resolved_size = normalize_modifier_text(matched_size.get("name")) or preferred_size
        else:
            add_unique_phrase(instruction_parts, size_value)
            resolved_size = preferred_size

    milk_value = options.get("milk")
    if isinstance(milk_value, str) and milk_value.strip():
        milk_candidates = expand_candidates(milk_value, MILK_CANDIDATES)
        if resolved_size:
            milk_candidates.extend(
                f"{candidate} {resolved_size}"
                for candidate in list(milk_candidates)
            )
        matched_milk = find_variant_option(
            menu_detail,
            milk_candidates,
            group_keywords=["milk"],
            preferred_size=resolved_size,
            allow_contains=True,
            enforce_preferred_size=True,
        )
        if matched_milk:
            append_selected_option(selected_options, matched_milk.get("name"))
        else:
            add_unique_phrase(instruction_parts, milk_value)

    sugar_value = options.get("sugar")
    if isinstance(sugar_value, str) and sugar_value.strip():
        matched_sugar = find_variant_option(
            menu_detail,
            [normalize_modifier_text(sugar_value)],
            allow_contains=False,
        )
        if matched_sugar:
            append_selected_option(selected_options, matched_sugar.get("name"))
        else:
            add_unique_phrase(instruction_parts, sugar_value)

    addons = requested_item.get("addons")
    if isinstance(addons, list):
        for addon in addons:
            addon_candidates = expand_candidates(addon, ADDON_CANDIDATES)
            matched_addon = find_variant_option(
                menu_detail,
                addon_candidates,
                allow_contains=True,
            )
            if matched_addon:
                append_selected_option(selected_options, matched_addon.get("name"))
            else:
                add_unique_phrase(instruction_parts, str(addon))

    add_unique_phrase(instruction_parts, requested_item.get("instructions"))

    return selected_options, "; ".join(instruction_parts)


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


async def process_chat_message(
    session_id: str,
    message: str,
    cart_id: str | None = None,
    session: Session | None = None,
) -> ChatMessageResponse:

    from app.utils.normalize import normalize_user_message
    from app.services.tools import (
        add_item_to_cart,
        clear_cart,
        fetch_featured_items,
        fetch_menu_item_detail,
        fetch_menu_items,
        find_menu_item_by_name,
        get_cart,
        remove_item_from_cart,
        update_cart_item_quantity,
    )
    from app.services.suggestions import (
        suggest_complementary_items,
        suggest_popular_items,
    )
    from app.services.http_client import ExpressAPIError

    if session is not None and cart_id is None:
        cart_id = session["cart_id"]

    normalized_message = normalize_user_message(message)
    special_command = detect_special_command(normalized_message)
    fallback_intent = detect_intent(normalized_message)

    if special_command is not None:
        logger.info(
            {
                "stage": "special_command_detected",
                "normalized_message": normalized_message,
                "intent": special_command,
            }
        )
        interpretation = {
            "intent": special_command,
            "items": [],
            "confidence": 1.0,
            "fallback_needed": False,
        }
        intent = special_command
    else:
        llm_result = try_interpret_message(normalized_message)

        if llm_result:
            interpretation = llm_result
            intent = interpretation.get("intent", fallback_intent or "unknown")

            if fallback_intent in {"remove_item", "update_quantity"} and intent == "add_items":
                interpretation["intent"] = fallback_intent
                intent = fallback_intent
        else:
            intent = fallback_intent
            
            if fallback_intent == "add_items":
                fallback_items = _extract_add_items_from_message(normalized_message)
            else:
                default_quantity = 1 if fallback_intent == "add_items" else None
                item_query, quantity = extract_item_query(
                    normalized_message,
                    default_quantity=default_quantity,
                )
                fallback_items = []
                if item_query:
                    fallback_items.append(
                        {
                            "item_name": item_query,
                            "quantity": quantity,
                            "size": None,
                            "options": {
                                "milk": None,
                                "sugar": None,
                            },
                            "addons": [],
                            "instructions": "",
                        }
                    )

            interpretation = {
                "intent": fallback_intent,
                "items": fallback_items,
                "confidence": 0.0,
                "fallback_needed": True,
            }
            intent = interpretation["intent"]

    if (
        interpretation.get("intent") == "unknown"
        and interpretation.get("fallback_needed", False)
        and any(char.isdigit() for char in normalized_message)
        and any(word in normalized_message for word in ["make", "change", "set", "update"])
    ):
        interpretation["intent"] = "update_quantity"
        intent = "update_quantity"

    if (
        interpretation.get("intent") == "unknown"
        and interpretation.get("fallback_needed", False)
        and session is not None
        and isinstance(session.get("last_items"), list)
        and session.get("last_items")
        and any(phrase in normalized_message.lower() for phrase in ["another one", "same one", "one more", "more", "another"])
    ):
        interpretation["intent"] = "add_items"
        intent = "add_items"

    last_stage = get_session_stage(session_id)
    bare_affirmations = {"yes", "yep", "ok", "okay", "sure", "sounds good", "do it", "go ahead"}
    explicit_confirm = {"confirm", "confirm order", "proceed", "place it", "let's go"}
    stripped_message = normalized_message.strip()
    if stripped_message in explicit_confirm or (
        stripped_message in bare_affirmations and last_stage == "checkout_summary"
    ):
        interpretation["intent"] = "confirm_checkout"
        interpretation["items"] = []
        interpretation["fallback_needed"] = False
        intent = "confirm_checkout"

    try:
        if intent in {"add_item", "add_items", "update_quantity", "remove_item"} and has_mixed_intent(normalized_message):
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="I didn't understand that. Can you clarify?",
                intent="unknown",
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "mixed_intent_detected",
                },
            )

        if intent == "clear_cart":
            cart_result = await clear_cart(cart_id=cart_id)
            if session is not None:
                session["last_items"] = []
                session["last_intent"] = None

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
            suggestions = suggest_popular_items(featured_items)
            suggestion_lines = [f"- {item['item_name']}" for item in suggestions if item.get("item_name")]

            if suggestion_lines:
                reply_text = "Here are some items you might like:\n" + "\n".join(suggestion_lines)
            else:
                reply_text = "Here are some items you might like!"

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
                    "pipeline_stage": "recommendation_done",
                },
            )

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
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Ready to checkout? Here's your order summary.",
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

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Great! Taking you to checkout now.",
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
            cart_result = await get_cart(cart_id=cart_id)
            requested_items = extract_requested_items(interpretation)
            requested_items = resolve_requested_items_from_session(
                intent,
                requested_items,
                interpretation,
                session,
            )
            if not validate_requested_items(
                normalized_message,
                intent,
                requested_items,
                interpretation.get("fallback_needed", False),
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "update_validation_failed",
                    },
                )

            target_item = requested_items[0] if requested_items else {}
            item_query = target_item.get("item_name")
            quantity = target_item.get("quantity")

            if not item_query:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please tell me which item in your cart you'd like to update.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "update_item_missing",
                    },
                )

            if quantity is None or quantity < 1:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"What quantity should I set for {item_query}?",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "update_quantity_missing",
                    },
                )

            matched_cart_item = await find_menu_item_by_name(cart_result["cart"], item_query)
            if not matched_cart_item:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"I couldn't find {item_query} in your cart.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "cart_item_not_found",
                    },
                )

            line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
            if line_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I found the item in your cart, but I couldn't update it right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "matched_item": matched_cart_item,
                        "pipeline_stage": "cart_line_id_missing",
                    },
                )

            updated_cart_result = await update_cart_item_quantity(
                line_id=line_id,
                qty=quantity,
                cart_id=cart_result["cart_id"],
            )
            cart_summary = build_cart_summary(updated_cart_result["cart"])
            reply_text = f"Updated {matched_cart_item.get('name', item_query)} to quantity {quantity}."

            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=True,
                cart_id=updated_cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "matched_item": matched_cart_item,
                    "cart": updated_cart_result["cart"],
                    "pipeline_stage": "update_quantity_done",
                },
            )

        if intent == "remove_item":
            cart_result = await get_cart(cart_id=cart_id)
            requested_items = extract_requested_items(interpretation)
            requested_items = resolve_requested_items_from_session(
                intent,
                requested_items,
                interpretation,
                session,
            )
            if not validate_requested_items(
                normalized_message,
                intent,
                requested_items,
                interpretation.get("fallback_needed", False),
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "remove_validation_failed",
                    },
                )

            target_item = requested_items[0] if requested_items else {}
            item_query = target_item.get("item_name")
            quantity = target_item.get("quantity")

            if not item_query:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please tell me which item you'd like to remove from your cart.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "remove_item_missing",
                    },
                )

            matched_cart_item = await find_menu_item_by_name(cart_result["cart"], item_query)
            if not matched_cart_item:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"I couldn't find {item_query} in your cart.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "cart_item_not_found",
                    },
                )

            line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
            if line_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I found the item in your cart, but I couldn't remove it right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "matched_item": matched_cart_item,
                        "pipeline_stage": "cart_line_id_missing",
                    },
                )

            current_qty = matched_cart_item.get("qty") or 0

            if quantity and quantity > 0 and current_qty > quantity:
                updated_cart_result = await update_cart_item_quantity(
                    line_id=line_id,
                    qty=current_qty - quantity,
                    cart_id=cart_result["cart_id"],
                )
                cart_summary = build_cart_summary(updated_cart_result["cart"])
                reply_text = (
                    f"Removed {quantity} {matched_cart_item.get('name', item_query)} from your cart."
                )
            else:
                updated_cart_result = await remove_item_from_cart(
                    line_id=line_id,
                    cart_id=cart_result["cart_id"],
                )
                cart_summary = build_cart_summary(updated_cart_result["cart"])
                reply_text = f"Removed {matched_cart_item.get('name', item_query)} from your cart."

            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"
            else:
                reply_text += "\n\nYour cart is now empty."

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=True,
                cart_id=updated_cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "matched_item": matched_cart_item,
                    "cart": updated_cart_result["cart"],
                    "pipeline_stage": "remove_item_done",
                },
            )

        if intent in {"add_item", "add_items"}:
            menu_items = await fetch_menu_items()
            requested_items = extract_requested_items(interpretation)
            requested_items = resolve_add_items_from_session(
                requested_items,
                interpretation,
                session,
            )
            if not validate_requested_items(
                normalized_message,
                intent,
                requested_items,
                interpretation.get("fallback_needed", False),
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "add_validation_failed",
                    },
                )

            if not requested_items:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I'm not sure what item you'd like to add.",
                    intent="add_items",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "add_items_missing",
                    },
                )

            if interpretation.get("fallback_needed") and any(
                is_invalid_fallback_query(item.get("item_name", ""))
                for item in requested_items
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "fallback_query_invalid",
                    },
                )

            successful_items = []
            failed_items = []
            last_matched_item = None
            cart_result = None
            current_cart_id = cart_id

            for requested_item in requested_items:
                item_query = requested_item.get("item_name")
                quantity = requested_item.get("quantity") or 1

                matched_item = await find_menu_item_by_name(menu_items, item_query or "")
                if not matched_item:
                    failed_items.append(_build_failed_item(item_query, "not found on the menu"))
                    continue

                menu_item_id = matched_item.get("id") or matched_item.get("_id")
                if menu_item_id is None:
                    failed_items.append(
                        _build_failed_item(
                            item_query or matched_item.get("name", "item"),
                            "missing menu item id",
                        )
                    )
                    continue

                menu_detail = None
                if requested_item_has_customization(requested_item):
                    menu_detail = await fetch_menu_item_detail(menu_item_id)

                selected_options, instructions = map_requested_item_to_selected_options(
                    requested_item,
                    menu_detail,
                )

                try:
                    cart_result = await add_item_to_cart(
                        menu_item_id=menu_item_id,
                        qty=quantity,
                        selected_options=selected_options,
                        instructions=instructions,
                        cart_id=current_cart_id,
                    )
                except ExpressAPIError as add_err:
                    err_lower = str(add_err).lower()
                    is_unavailable = "unavailable" in err_lower or "not available" in err_lower
                    failed_message = (
                        "currently unavailable"
                        if is_unavailable
                        else "could not add right now"
                    )
                    failed_item_name = matched_item.get("name") or item_query
                    failed_items.append(_build_failed_item(failed_item_name, failed_message))
                    logger.warning(
                        {
                            "stage": "add_item_failed",
                            "normalized_message": normalized_message,
                            "item_name": failed_item_name,
                            "menu_item_id": menu_item_id,
                            "cart_id": current_cart_id,
                            "unavailable": is_unavailable,
                            "error": str(add_err),
                        }
                    )
                    continue

                current_cart_id = cart_result["cart_id"]
                last_matched_item = matched_item
                successful_items.append(
                    {
                        "requested_name": item_query,
                        "matched_name": matched_item.get("name", "item"),
                        "quantity": quantity,
                        "matched_item": matched_item,
                        "selected_options": selected_options,
                        "instructions": instructions,
                    }
                )

            if not successful_items:
                if interpretation.get("fallback_needed") and failed_items and all(
                    item.get("message") == "not found on the menu" for item in failed_items
                ):
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply="I didn't understand that. Can you clarify?",
                        intent="unknown",
                        cart_updated=False,
                        cart_id=current_cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "requested_items": requested_items,
                            "failed_items": failed_items,
                            "pipeline_stage": "fallback_query_unmatched",
                        },
                    )

                if len(failed_items) == 1 and failed_items[0].get("message") == "not found on the menu":
                    reply_text = f"I could not find '{failed_items[0]['item_name']}' on the menu."
                else:
                    failed_lines = [_format_failed_item_line(item) for item in failed_items if item]
                    reply_text = "I couldn't add these items."
                    if failed_lines:
                        reply_text += "\n" + "\n".join(failed_lines)

                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply_text,
                    intent="add_items",
                    cart_updated=False,
                    cart_id=current_cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "failed_items": failed_items,
                        "pipeline_stage": "add_items_failed",
                    },
                )

            featured_items = await fetch_featured_items()
            popular = suggest_popular_items(featured_items)
            complementary = suggest_complementary_items(menu_items, last_matched_item)

            suggestions = popular + complementary
            added_item_names = {item["matched_name"].lower() for item in successful_items}

            filtered_suggestions = [
                s for s in suggestions
                if s.get("item_name", "").lower() not in added_item_names
            ]

            cart_summary = build_cart_summary(cart_result["cart"])
            suggestion_lines = [f"- {s['item_name']}" for s in filtered_suggestions]
            suggestion_text = "\n".join(suggestion_lines)

            if len(successful_items) == 1 and not failed_items:
                added_item = successful_items[0]
                reply_text = (
                    f"Added {added_item['quantity']} {added_item['matched_name']} to your cart.\n\n"
                    f"Your cart now contains:\n{cart_summary}"
                )
            else:
                added_lines = [
                    f"- {item['quantity']}x {item['matched_name']}"
                    for item in successful_items
                ]
                reply_parts = [
                    "Added these items to your cart:\n" + "\n".join(added_lines)
                ]

                if failed_items:
                    failed_lines = [_format_failed_item_line(item) for item in failed_items if item]
                    if failed_lines:
                        reply_parts.append(
                            "I couldn't add these items:\n"
                            + "\n".join(failed_lines)
                        )

                if cart_summary:
                    reply_parts.append(f"Your cart now contains:\n{cart_summary}")

                reply_text = "\n\n".join(reply_parts)

            if suggestion_lines:
                reply_text += f"\n\nYou might also like:\n{suggestion_text}"

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent="add_items",
                cart_updated=True,
                cart_id=current_cart_id,
                defaults_used=[],
                suggestions=filtered_suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "added_items": successful_items,
                    "failed_items": failed_items,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "add_items_done",
                },
            )

        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="I'm not sure how to help with that yet.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "fallback_response",
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
