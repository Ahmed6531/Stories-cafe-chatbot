import logging
import re
import httpx
from difflib import SequenceMatcher

from app.schemas.chat import ChatMessageResponse
from app.services.fallback_assistant import generate_fallback_reply
from app.services.llm_interpreter import try_interpret_message, _extract_add_items_from_message
from app.services.session_store import (
    Session,
    get_session,
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

NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}


def extract_quantity_value(message: str) -> int | None:
    words = str(message or "").lower().split()
    for word in words:
        if word.isdigit():
            return int(word)
    for word in words:
        if word in NUMBER_WORDS:
            return NUMBER_WORDS[word]
    return None


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


def _lower_text(value) -> str:
    return str(value or "").lower().strip()


def _is_beverage_like(item: dict | None) -> bool:
    if not item:
        return False
    hay = f"{_lower_text(item.get('category'))} {_lower_text(item.get('subcategory'))}"
    return any(
        word in hay
        for word in [
            "beverage",
            "beverages",
            "mixed beverages",
            "coffee",
            "black coffee",
            "tea",
            "drink",
            "drinks",
            "latte",
            "frap",
        ]
    )


def _is_food_like(item: dict | None) -> bool:
    if not item:
        return False
    hay = f"{_lower_text(item.get('category'))} {_lower_text(item.get('subcategory'))}"
    return any(
        word in hay
        for word in [
            "pastry",
            "pastries",
            "dessert",
            "desserts",
            "bakery",
            "cake",
            "cakes",
            "cookie",
            "cookies",
            "muffin",
            "muffins",
            "croissant",
            "croissants",
            "roll",
            "rolls",
        ]
    )


def _is_recordable_combo_pair(anchor_item: dict | None, suggested_item: dict | None) -> bool:
    anchor_is_beverage = _is_beverage_like(anchor_item)
    anchor_is_food = _is_food_like(anchor_item)
    suggested_is_beverage = _is_beverage_like(suggested_item)
    suggested_is_food = _is_food_like(suggested_item)

    if not (anchor_is_beverage or anchor_is_food):
        return False
    if not (suggested_is_beverage or suggested_is_food):
        return False

    return (anchor_is_beverage and suggested_is_food) or (anchor_is_food and suggested_is_beverage)


def _looks_like_clear_cart_command(message: str) -> bool:
    """Detect typo variants of clear-cart commands (e.g., 'lear cart')."""
    normalized = " ".join(str(message or "").lower().split())
    if not normalized:
        return False

    tokens = re.findall(r"[a-z0-9]+", normalized)
    if "cart" not in tokens:
        return False

    action_words = {"clear", "empty", "reset", "delete", "remove"}
    ignore = {"cart", "my", "the", "please", "pls"}

    for token in tokens:
        if token in ignore:
            continue
        for action in action_words:
            if SequenceMatcher(None, token, action).ratio() >= 0.8:
                return True

    return False


def detect_special_command(message: str) -> str | None:
    message = message.lower()

    # Route ice cream queries to describe_item so they can be properly handled
    # (either with "No ice cream, but frozen yogurt" or availability check)
    if any(word in message for word in ["add", "get", "order", "want", "i want"]):
        tokens = message.split()
        for i, token in enumerate(tokens):
            if token == "ice" and i + 1 < len(tokens):
                next_token = tokens[i + 1]
                if SequenceMatcher(None, next_token, "cream").ratio() >= 0.72:
                    return "describe_item"

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
    ) or _looks_like_clear_cart_command(message):
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

    from app.services.menu_details import DETAIL_TRIGGER_PHRASES
    if any(phrase in message for phrase in DETAIL_TRIGGER_PHRASES):
        if any(
            phrase in message
            for phrase in [
                "recommend", "suggest", "suggestions", "recommendations",
                "recommend me", "what do you recommend", "any suggestions",
                "any recommendation", "what should i get", "good today",
                "what's good", "whats good", "surprise", "popular",
                "what do you have",
            ]
        ):
            return "recommendation_query"
        return "describe_item"

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
    has_quantity_word = any(word in NUMBER_WORDS for word in message.split())
    customization_hints = [
        "milk", "sugar", "shot", "size", "small", "medium", "large",
        "skim", "full fat", "regular milk", "whole milk", "almond", "oat",
        "soy", "coconut", "lactose", "decaf", "vanilla", "caramel",
        "mocha", "hazelnut", "whipped", "drizzle", "flavor", "topping",
    ]

    from app.services.menu_details import DETAIL_TRIGGER_PHRASES
    if any(phrase in message for phrase in DETAIL_TRIGGER_PHRASES):
        if any(
            phrase in message
            for phrase in [
                "recommend", "suggest", "suggestions", "recommendations",
                "what's good", "whats good", "popular", "surprise me",
                "what should i get",
            ]
        ):
            return "recommendation_query"
        return "describe_item"


    if any(word in message for word in ["remove", "delete"]):
        return "remove_item"
    if "set" in message or "update" in message:
        return "update_quantity"
    if any(word in message for word in ["change", "modify", "switch"]) and (
        " to " in message or any(hint in message for hint in customization_hints)
    ):
        return "update_quantity"
    if (has_digit or has_quantity_word) and any(word in message for word in ["change", "make"]):
        return "update_quantity"
    if "cart" in message:
        return "view_cart"
    if any(phrase in message for phrase in ["checkout", "check out", "place order", "pay now"]):
        return "checkout"
    if any(word in message for word in ["add", "get", "order", "want"]):
        return "add_items"

    return "unknown"


def _has_fuzzy_phrase(message: str, phrases: set[str], threshold: float = 0.84) -> bool:
    """Return True when a phrase is present exactly or as a close typo variant."""
    msg = " ".join(str(message or "").lower().split())
    if not msg:
        return False

    tokens = msg.split()
    for phrase in phrases:
        normalized_phrase = " ".join(str(phrase or "").lower().split())
        if not normalized_phrase:
            continue
        if normalized_phrase in msg:
            return True

        phrase_tokens = normalized_phrase.split()
        if not phrase_tokens or len(tokens) < len(phrase_tokens):
            continue

        window_size = len(phrase_tokens)
        for i in range(len(tokens) - window_size + 1):
            window = " ".join(tokens[i : i + window_size])
            if SequenceMatcher(None, window, normalized_phrase).ratio() >= threshold:
                return True

    return False


def extract_item_query(message: str, default_quantity: int | None = 1):
    message = message.lower()

    words = message.split()
    quantity = extract_quantity_value(message)
    if quantity is None:
        quantity = default_quantity

    ignore_words = {
        "a",
        "add",
        "an",
        "cart",
        "change",
        "delete",
        "from",
        "get",
        "hmm",
        "i",
        "it",
        "make",
        "me",
        "my",
        "only",
        "okay",
        "ok",
        "order",
        "please",
        "quantity",
        "remove",
        "set",
        "the",
        "to",
        "update",
        "want",
        "yeah",
        "yep",
    }

    item_words = [
        w for w in words
        if w not in ignore_words and not w.isdigit() and w not in NUMBER_WORDS
    ]
    item_query = " ".join(item_words)

    return item_query, quantity


def remember_last_item_query(session: Session | None, message: str) -> None:
    if session is None:
        return

    item_query, _ = extract_item_query(message, default_quantity=None)
    item_query = " ".join(str(item_query or "").strip().split())
    if not item_query:
        return

    generic_queries = {
        "menu",
        "options",
        "option",
        "item",
        "items",
        "something",
        "anything",
        "it",
        "that",
        "this",
    }
    if item_query in generic_queries:
        return

    session["last_item_query"] = item_query




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
    if session is None:
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
    follow_up_filler_words = {
        "hmm",
        "hm",
        "okay",
        "ok",
        "yeah",
        "yep",
        "yes",
        "sure",
        "please",
        "pls",
        "add",
        "get",
        "order",
        "want",
        "to",
        "me",
        "a",
        "an",
        "the",
    }

    def _is_follow_up_reference(item_name: str | None) -> bool:
        normalized_name = (item_name or "").strip().lower()
        if not normalized_name:
            return True
        if normalized_name in follow_up_item_names:
            return True

        cleaned_tokens = [
            token for token in normalized_name.split()
            if token and token not in follow_up_filler_words
        ]
        if not cleaned_tokens:
            return True

        cleaned_name = " ".join(cleaned_tokens)
        return cleaned_name in follow_up_item_names

    if requested_items:
        current_item = requested_items[0]
        current_item_name = current_item.get("item_name")
        current_quantity = current_item.get("quantity")
        if not _is_follow_up_reference(current_item_name):
            return requested_items
        if current_quantity is not None and str(current_item_name or "").strip().lower() not in follow_up_item_names:
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

        current_item_name = current_item.get("item_name")
        current_quantity = current_item.get("quantity")
        if current_quantity is None:
            current_quantity = interpretation.get("quantity")

        if not _is_follow_up_reference(current_item_name) and current_quantity is None:
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


def get_menu_detail_variants(menu_detail: dict | None) -> list[dict]:
    """Return normalized variant groups from a menu detail payload.
    
    After 'categories became a model', the backend returns variantGroupDetails.
    Falls back to older structures (variants, variantGroups) for compatibility.
    """
    if not isinstance(menu_detail, dict):
        return []

    def _is_group_active(group: dict) -> bool:
        # New structure may carry activity both on the group and nested category.
        if group.get("isActive") is False:
            return False

        category = group.get("category")
        if isinstance(category, dict) and category.get("isActive") is False:
            return False

        category_model = group.get("categoryModel")
        if isinstance(category_model, dict) and category_model.get("isActive") is False:
            return False

        return True

    # New structure: backend populates full group objects in variantGroupDetails
    variant_group_details = menu_detail.get("variantGroupDetails")
    if isinstance(variant_group_details, list):
        return [
            group
            for group in variant_group_details
            if isinstance(group, dict) and _is_group_active(group)
        ]

    # Old structure: variants (if API returned this before)
    variants = menu_detail.get("variants")
    if isinstance(variants, list):
        return [
            group
            for group in variants
            if isinstance(group, dict) and _is_group_active(group)
        ]

    # Fallback: variantGroups might be full objects in legacy payloads
    variant_groups = menu_detail.get("variantGroups")
    if isinstance(variant_groups, list):
        return [
            group
            for group in variant_groups
            if isinstance(group, dict) and _is_group_active(group)
        ]

    return []


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

    variants = get_menu_detail_variants(menu_detail)
    if not variants:
        return []

    variant_options: list[tuple[dict, dict]] = []
    for group in variants:
        if not isinstance(group, dict):
            continue
        options = group.get("options")
        if not isinstance(options, list):
            continue
        for option in options:
            if (
                isinstance(option, dict)
                and option.get("name")
                and option.get("isActive", True) is not False
            ):
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
    if option.get("isActive", True) is False:
        return 0

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
) -> tuple[list[dict], str, list[str]]:
    if not isinstance(requested_item, dict):
        return [], "", []

    selected_options: list[dict] = []
    instruction_parts: list[str] = []
    unsupported_customizations: list[str] = []
    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}

    # Auto-select single active options so one-choice groups don't trigger
    # user clarification (e.g., items like tea with one required variant).
    for group in get_menu_detail_variants(menu_detail):
        if not isinstance(group, dict):
            continue
        raw_options = group.get("options")
        if not isinstance(raw_options, list):
            continue

        active_options = [
            opt for opt in raw_options
            if isinstance(opt, dict) and opt.get("name") and opt.get("isActive", True) is not False
        ]
        if len(active_options) == 1:
            append_selected_option(selected_options, active_options[0].get("name"))

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
            unsupported_customizations.append(str(size_value).strip())
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
            unsupported_customizations.append(str(milk_value).strip())

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
            unsupported_customizations.append(str(sugar_value).strip())

    addons = requested_item.get("addons")
    if isinstance(addons, list):
        # Track selections per group to respect maxSelections constraint
        group_selections: dict[str, list[str]] = {}
        
        for addon in addons:
            addon_candidates = expand_candidates(addon, ADDON_CANDIDATES)
            matched_addon = find_variant_option(
                menu_detail,
                addon_candidates,
                allow_contains=True,
            )
            if matched_addon:
                # Find which group this option belongs to
                option_group = None
                for group in get_menu_detail_variants(menu_detail):
                    if not isinstance(group, dict):
                        continue
                    group_options = group.get("options", [])
                    if any(opt.get("name") == matched_addon.get("name") for opt in group_options if isinstance(opt, dict)):
                        option_group = group
                        break
                
                # Check maxSelections constraint
                max_selections = None
                if option_group:
                    max_selections = option_group.get("maxSelections")
                    group_id = normalize_modifier_text(option_group.get("name") or "")
                    
                    # Initialize group tracking if needed
                    if group_id not in group_selections:
                        group_selections[group_id] = []
                    
                    # Only add if we haven't exceeded maxSelections
                    if max_selections is None or len(group_selections[group_id]) < max_selections:
                        append_selected_option(selected_options, matched_addon.get("name"))
                        group_selections[group_id].append(matched_addon.get("name"))
                    else:
                        # Exceeded maxSelections - add to instructions instead
                        add_unique_phrase(instruction_parts, str(addon))
                else:
                    # If we can't find the group, add it (fallback)
                    append_selected_option(selected_options, matched_addon.get("name"))
            else:
                add_unique_phrase(instruction_parts, str(addon))
                unsupported_customizations.append(str(addon).strip())

    add_unique_phrase(instruction_parts, requested_item.get("instructions"))

    # Preserve first occurrence order while removing empties/duplicates.
    normalized_seen: set[str] = set()
    unique_unsupported: list[str] = []
    for value in unsupported_customizations:
        cleaned = str(value or "").strip()
        key = normalize_modifier_text(cleaned)
        if not cleaned or not key or key in normalized_seen:
            continue
        normalized_seen.add(key)
        unique_unsupported.append(cleaned)

    return selected_options, "; ".join(instruction_parts), unique_unsupported


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


async def process_chat_message(
    session_id: str,
    message: str,
    cart_id: str | None = None,
    session: Session | None = None,
) -> ChatMessageResponse:

    # Ensure we always have a persistent session object across turns for
    # clarification flows (e.g., "add croissant" -> "cheese").
    if session is None:
        session = get_session(session_id)

    from app.utils.normalize import normalize_user_message
    from app.services.tools import (
        add_item_to_cart,
        observe_combo,
        remove_from_cart,
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
        extract_recommendation_category,
        extract_recommendation_query_terms,
        filter_by_category,
    )
    from app.services.http_client import ExpressAPIError
    from app.services.item_clarification import (
        apply_customization_response,
        apply_smart_defaults,
        build_customization_prompt,
        build_customization_suggestions,
        build_defaults_confirmation_prompt,
        build_defaults_confirmation_suggestions,
        build_menu_choice_prompt,
        build_menu_choice_suggestions,
        collect_missing_variant_groups,
        find_ambiguous_menu_matches,
        get_menu_detail_variants,
        _is_frozen_yogurt,
        resolve_menu_choice,
    )
    from app.services.upsell import get_upsell_suggestions
    from app.services.upsell import record_turn

    if session is not None and cart_id is None:
        cart_id = session["cart_id"]

    # Count every incoming chat message as a turn so upsell cooldown
    # behaves correctly even through multi-turn clarification flows.
    record_turn(session_id)

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
        llm_result = try_interpret_message(normalized_message, context=session.get("history", []) if session else [])

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

    if (
        intent in {"unknown", "describe_item"}
        and re.search(r"\b(suggest|recommend)\b", normalized_message)
    ):
        interpretation["intent"] = "recommendation_query"
        intent = "recommendation_query"

    last_stage = get_session_stage(session_id)
    bare_affirmations = {"yes", "yep", "ok", "okay", "sure", "sounds good", "do it", "go ahead"}
    explicit_confirm = {"confirm", "confirm order", "proceed", "place it", "let's go"}
    stripped_message = normalized_message.strip()
    if stripped_message in explicit_confirm or (
        stripped_message in bare_affirmations and last_stage == "checkout_summary"
    ) or (
        last_stage == "checkout_summary" and intent == "checkout"
    ):
        interpretation["intent"] = "confirm_checkout"
        interpretation["items"] = []
        interpretation["fallback_needed"] = False
        intent = "confirm_checkout"

    # Handle affirmations to recommendation requests
    if (
        stripped_message in bare_affirmations
        and last_stage == "recommendation_requested"
    ):
        interpretation["intent"] = "recommendation_query"
        interpretation["items"] = []
        interpretation["fallback_needed"] = False
        intent = "recommendation_query"
        set_session_stage(session_id, None)

    if (
        last_stage == "update_quantity_missing"
        and session is not None
        and intent != "update_quantity"
    ):
        qty_from_followup = extract_quantity_value(normalized_message)
        session_items = session.get("last_items") if isinstance(session.get("last_items"), list) else []
        last_item = session_items[0] if session_items and isinstance(session_items[0], dict) else None
        if qty_from_followup is not None and last_item:
            patched_item = {
                "item_name": last_item.get("item_name"),
                "quantity": qty_from_followup,
                "size": last_item.get("size"),
                "options": last_item.get("options") if isinstance(last_item.get("options"), dict) else {"milk": None, "sugar": None},
                "addons": last_item.get("addons") if isinstance(last_item.get("addons"), list) else [],
                "instructions": last_item.get("instructions") if isinstance(last_item.get("instructions"), str) else "",
            }
            interpretation = {
                "intent": "update_quantity",
                "items": [patched_item],
                "confidence": 1.0,
                "fallback_needed": False,
            }
            intent = "update_quantity"

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
            "none",
            "nothing",
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
        fuzzy_abandon_phrases = {phrase for phrase in abandon_phrases if phrase not in {"have", "rather"}}
        has_abandon_phrase = _has_fuzzy_phrase(stripped_message, fuzzy_abandon_phrases) or any(
            phrase in stripped_message for phrase in abandon_phrases
        )

        # Standalone abandon (e.g. "nevermind") should cancel clarification
        # immediately instead of looping back into another customization prompt.
        # If a new intent is already detected in the same message
        # (e.g. "nevermind do u have cinnamon rolls"), do not return early.
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
            has_abandon_phrase
            and (is_fresh_command or explicit_new_command)
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
            interpretation = {
                "intent": "add_items",
                "items": [base_item, *carry_requested_items],
                "confidence": 1.0,
                "fallback_needed": False,
                "_resolved_clarification": True,
                "_carried_successful_items": carry_successful_items,
            }
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

            interpretation = {
                "intent": "add_items",
                "items": [updated_item, *carry_requested_items],
                "confidence": 1.0,
                "fallback_needed": False,
                "_resolved_clarification": True,
                "_carried_successful_items": carry_successful_items,
            }
            intent = "add_items"
            session["pending_clarification"] = None
            set_session_stage(session_id, None)

        elif clarification_type == "defaults_confirmation":
            base_item = dict(pending_clarification.get("requested_item") or {})
            menu_det = pending_clarification.get("menu_detail")
            original_item = dict(pending_clarification.get("original_item") or base_item)
            item_display_name = pending_clarification.get("item_query") or base_item.get("item_name") or "this item"

            _DEFAULTS_OK = {
                "no", "nope", "nah", "no thanks", "no change",
                "looks good", "looks great", "looks perfect",
                "add it", "add as is", "add as-is",
                "sounds good", "sounds great", "perfect",
                "ok", "okay", "fine", "that's fine", "that's great",
                "go ahead", "yes please", "please add it",
                "looks good add it", "that works", "great",
            }
            _CHANGE_ONLY = {"change it", "change", "actually", "no wait", "wait", "edit it"}

            stripped = normalized_message.strip().lower()

            if stripped in _DEFAULTS_OK:
                resolved_cart_id = cart_id

                menu_item_id = None
                if isinstance(menu_det, dict):
                    menu_item_id = menu_det.get("id") or menu_det.get("_id")

                matched_item = None
                if menu_item_id is None:
                    menu_items = await fetch_menu_items()
                    matched_item = await find_menu_item_by_name(menu_items, item_display_name)
                    if matched_item:
                        menu_item_id = matched_item.get("id") or matched_item.get("_id")

                if menu_item_id is None:
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="error",
                        reply=f"I couldn't add {item_display_name} right now.",
                        intent="add_items",
                        cart_updated=False,
                        cart_id=resolved_cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "defaults_confirmation_menu_item_id_missing",
                        },
                    )

                selected_options, instructions, _ = map_requested_item_to_selected_options(base_item, menu_det)
                qty = int(base_item.get("quantity") or 1)
                cart_result = await add_item_to_cart(
                    menu_item_id=menu_item_id,
                    qty=qty,
                    selected_options=selected_options,
                    instructions=instructions,
                    cart_id=resolved_cart_id,
                )

                resolved_cart_id = cart_result["cart_id"]
                item_name_for_reply = (
                    (matched_item or {}).get("name")
                    or (menu_det or {}).get("name")
                    or item_display_name
                )
                cart_summary = build_cart_summary(cart_result.get("cart", []))
                reply_text = f"Added {qty} {item_name_for_reply} to your cart."
                if cart_summary:
                    reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

                # Keep upsell behavior consistent with regular add flow.
                menu_items = await fetch_menu_items()
                upsell_candidates = await get_upsell_suggestions(
                    session_id=session_id,
                    intent="add_items",
                    cart_items=cart_result.get("cart", []),
                    menu_items=menu_items,
                    anchor_menu_item=matched_item if isinstance(matched_item, dict) else (menu_det if isinstance(menu_det, dict) else None),
                )
                upsell_pick = next(
                    (
                        s
                        for s in upsell_candidates
                        if s.get("type") == "upsell"
                        and s.get("item_name")
                    ),
                    None,
                )
                if upsell_pick:
                    reply_text += f"\n\nWould you like to add {upsell_pick.get('item_name')}?"
                    if upsell_pick.get("fun_fact"):
                        reply_text += f"\n{upsell_pick.get('fun_fact')}"
                upsell_response_suggestions = [upsell_pick] if upsell_pick else []

                session["pending_clarification"] = None
                set_session_stage(session_id, None)
                session["last_items"] = [base_item]
                session["last_intent"] = "add_items"
                session["cart_id"] = resolved_cart_id

                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply_text,
                    intent="add_items",
                    cart_updated=True,
                    cart_id=resolved_cart_id,
                    defaults_used=[],
                    suggestions=upsell_response_suggestions,
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": [base_item],
                        "cart": cart_result.get("cart", []),
                        "pipeline_stage": "defaults_confirmation_add_done",
                    },
                )

            elif stripped in _CHANGE_ONLY:
                all_missing = collect_missing_variant_groups(original_item, menu_det)
                session["pending_clarification"] = {
                    "type": "item_customization",
                    "requested_item": base_item,
                    "menu_detail": menu_det,
                    "remaining_requested_items": carry_requested_items,
                    "already_added_items": carry_successful_items,
                }
                session["last_items"] = [base_item]
                session["last_intent"] = "add_items"
                set_session_stage(session_id, "item_customization")
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=build_customization_prompt(item_display_name, all_missing) if all_missing
                          else f"Sure! What would you like to change about your {item_display_name}?",
                    intent="add_items",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=build_customization_suggestions(all_missing),
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "defaults_confirmation_change_requested",
                    },
                )

            else:
                updated_item = apply_customization_response(base_item, normalized_message, menu_det)
                remaining = collect_missing_variant_groups(updated_item, menu_det)
                still_required = [g for g in remaining if bool(g.get("isRequired"))]
                if still_required:
                    session["pending_clarification"] = {
                        "type": "item_customization",
                        "requested_item": updated_item,
                        "menu_detail": menu_det,
                    }
                    session["last_items"] = [updated_item]
                    session["last_intent"] = "add_items"
                    set_session_stage(session_id, "item_customization")
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_customization_prompt(item_display_name, still_required),
                        intent="add_items",
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=build_customization_suggestions(still_required),
                        metadata={
                            "normalized_message": normalized_message,
                            "pipeline_stage": "defaults_confirmation_still_required",
                        },
                    )
                else:
                    interpretation = {
                        "intent": "add_items",
                        "items": [updated_item],
                        "confidence": 1.0,
                        "fallback_needed": False,
                        "_resolved_clarification": True,
                    }
                    intent = "add_items"
                    session["pending_clarification"] = None
                    set_session_stage(session_id, None)

    # Recovery path: if the session stage says we're customizing an item but
    # pending_clarification was lost, apply the response to the last item.
    if (
        not isinstance(pending_clarification, dict)
        and session is not None
        and get_session_stage(session_id) in {"item_customization", "defaults_confirmation"}
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

                interpretation = {
                    "intent": "add_items",
                    "items": [updated_item],
                    "confidence": 1.0,
                    "fallback_needed": False,
                    "_resolved_clarification": True,
                }
                intent = "add_items"
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

    import re as _re
    _add_it_clean = _re.sub(r"[^a-z0-9\s]", "", normalized_message.strip().lower())
    _add_it_clean = _re.sub(r"\s+", " ", _add_it_clean).strip()
    # Strip trailing filler words so "add it please" → "add it"
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
            interpretation = {
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
                "fallback_needed": False,
            }
            intent = "add_items"

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
            existing_cart = await get_cart(cart_id=cart_id)
            if not existing_cart["cart"]:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Your cart is already empty.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=existing_cart["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "clear_cart_already_empty",
                    },
                )

            cart_result = await clear_cart(cart_id=cart_id)
            if session is not None:
                session["last_items"] = []
                session["last_intent"] = None
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

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
            cart_result = await get_cart(cart_id=cart_id)
            cart_items = cart_result["cart"]
            menu_items = await fetch_menu_items()

            # Extract any category hint from the message ("drinks", "food", etc.)
            rec_category = extract_recommendation_category(normalized_message)
            rec_query_terms = extract_recommendation_query_terms(normalized_message)
            
            # If the user just said "yes" to a recommendation request, use stored query
            if not rec_category and not rec_query_terms and session and session.get("last_recommendation_query"):
                rec_category = session.get("last_recommendation_query")
                # Normalize "ice cream" queries to "yogurt" since that's what we offer
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

            # Filter by requested category and explicit query terms when specified
            if rec_category or rec_query_terms:
                all_suggestions = filter_by_category(
                    all_suggestions,
                    rec_category,
                    menu_items_by_name,
                    rec_query_terms,
                )

                # If strict term filtering yields nothing within the suggestions
                # pool (popular/complementary/upsell), search ALL menu items
                # by those terms before falling back to generic category.
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
                        # Last resort: category-only from suggestion pool.
                        all_suggestions = filter_by_category(
                            raw_suggestions,
                            rec_category,
                            menu_items_by_name,
                            [],
                        )
                        used_broad_category_fallback = bool(all_suggestions)

            # If user asked for a specific thing (e.g. "ice cream") but no
            # category was detected, still provide related picks instead of
            # a generic cart-dependent fallback.
            if not all_suggestions and rec_query_terms and not rec_category:
                # Search all menu items by term first.
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
                elif rec_query_terms:
                    requested = " ".join(rec_query_terms)
                    reply_text = f"I couldn't find specific matches for {requested} right now — try another item name from the menu."
                else:
                    reply_text = "I can help with suggestions once you add an item to your cart."

            # Clear the stored recommendation query now that we've generated recommendations
            if session and "last_recommendation_query" in session:
                del session["last_recommendation_query"]

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
                    session["last_item_query"] = described_item.strip()
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
            if quantity is None:
                quantity = extract_quantity_value(normalized_message)
                if quantity is not None and isinstance(target_item, dict):
                    target_item["quantity"] = quantity

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

            customization_hints = [
                "milk", "sugar", "shot", "size",
                "small", "medium", "med", "large",
                "skim", "full fat", "regular milk", "whole milk",
                "almond", "oat", "soy", "coconut", "lactose",
                "decaf", "vanilla", "caramel", "mocha", "hazelnut",
                "whipped", "drizzle", "flavor", "topping",
            ]
            has_customization_hint = any(hint in normalized_message for hint in customization_hints)

            if quantity is None and has_customization_hint and requested_item_has_customization(target_item):
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

                menu_item_id = matched_cart_item.get("menuItemId")
                if menu_item_id is None:
                    menu_items = await fetch_menu_items()
                    matched_menu_item = await find_menu_item_by_name(menu_items, matched_cart_item.get("name", item_query))
                    if matched_menu_item:
                        menu_item_id = matched_menu_item.get("id") or matched_menu_item.get("_id")

                if menu_item_id is None:
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="error",
                        reply="I found your item, but I couldn't apply those customizations right now.",
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_result["cart_id"],
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "matched_item": matched_cart_item,
                            "pipeline_stage": "menu_item_id_missing_for_customization_update",
                        },
                    )

                menu_detail = await fetch_menu_item_detail(menu_item_id)
                selected_options, instructions, _ = map_requested_item_to_selected_options(target_item, menu_detail)
                current_qty = int(matched_cart_item.get("qty") or 1)

                removed = await remove_item_from_cart(line_id=line_id, cart_id=cart_result["cart_id"])
                updated_cart_result = await add_item_to_cart(
                    menu_item_id=menu_item_id,
                    qty=current_qty,
                    selected_options=selected_options,
                    instructions=instructions,
                    cart_id=removed["cart_id"],
                )
                set_session_stage(session_id, None)

                cart_summary = build_cart_summary(updated_cart_result["cart"])
                reply_text = f"Updated {matched_cart_item.get('name', item_query)} with your new customization."
                if cart_summary:
                    reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply_text,
                    intent="update_item",
                    cart_updated=True,
                    cart_id=updated_cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "matched_item": matched_cart_item,
                        "cart": updated_cart_result["cart"],
                        "pipeline_stage": "update_item_customization_done",
                    },
                )

            if quantity is None or quantity < 1:
                matched_for_prompt = await find_menu_item_by_name(cart_result["cart"], item_query)
                prompt_item_name = (
                    matched_for_prompt.get("name", item_query)
                    if isinstance(matched_for_prompt, dict)
                    else item_query
                )
                if session is not None:
                    session["last_items"] = [target_item]
                    session["last_intent"] = "update_quantity"
                set_session_stage(session_id, "update_quantity_missing")
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"What quantity should I set for {prompt_item_name}?",
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
            set_session_stage(session_id, None)
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
            from_clarification = bool(interpretation.get("_resolved_clarification"))
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

            carried_successful_items = interpretation.get("_carried_successful_items")
            successful_items = [
                item for item in (carried_successful_items or []) if isinstance(item, dict)
            ]
            failed_items = []
            last_matched_item = None
            cart_result = None
            current_cart_id = cart_id
            multi_item_request = len(requested_items) > 1

            for index, requested_item in enumerate(requested_items):
                item_query = requested_item.get("item_name")
                quantity = requested_item.get("quantity") or 1
                remaining_requested_items = requested_items[index + 1 :]

                ambiguous_matches = [] if from_clarification else find_ambiguous_menu_matches(menu_items, item_query or "")
                if ambiguous_matches:
                    if session is not None:
                        session["pending_clarification"] = {
                            "type": "menu_choice",
                            "item_query": item_query,
                            "requested_item": requested_item,
                            "remaining_requested_items": remaining_requested_items,
                            "already_added_items": list(successful_items),
                            "candidates": [
                                {"id": item.get("id"), "name": item.get("name")}
                                for item in ambiguous_matches
                            ],
                        }
                        session["last_items"] = [requested_item]
                        session["last_intent"] = "add_items"
                    set_session_stage(session_id, "menu_choice")
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_menu_choice_prompt(item_query or "item", ambiguous_matches),
                        intent="add_items",
                        cart_updated=False,
                        cart_id=current_cart_id,
                        defaults_used=[],
                        suggestions=build_menu_choice_suggestions(ambiguous_matches),
                        metadata={
                            "normalized_message": normalized_message,
                            "requested_items": requested_items,
                            "pipeline_stage": "add_item_needs_menu_choice",
                        },
                    )

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

                menu_detail = await fetch_menu_item_detail(menu_item_id)

                if not from_clarification:
                    _, _, preliminary_unsupported = map_requested_item_to_selected_options(
                        requested_item,
                        menu_detail,
                    )
                    if preliminary_unsupported:
                        from app.services.menu_details import build_item_detail_reply

                        item_display_name = matched_item.get("name") or requested_item.get("item_name") or "This item"
                        if len(preliminary_unsupported) == 1:
                            unsupported_text = preliminary_unsupported[0]
                            prefix = f"{item_display_name} has no {unsupported_text} option."
                        else:
                            unsupported_text = ", ".join(preliminary_unsupported[:-1]) + f" and {preliminary_unsupported[-1]}"
                            prefix = f"{item_display_name} has no {unsupported_text} options."

                        item_detail_text = build_item_detail_reply(
                            menu_detail if isinstance(menu_detail, dict) else matched_item
                        )
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=f"{prefix}\n\n{item_detail_text}",
                            intent="add_items",
                            cart_updated=False,
                            cart_id=current_cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "requested_items": requested_items,
                                "unsupported_customizations": preliminary_unsupported,
                                "pipeline_stage": "add_item_unsupported_customization_precheck",
                            },
                        )

                missing_variant_groups = [] if from_clarification else collect_missing_variant_groups(requested_item, menu_detail)
                if missing_variant_groups and not from_clarification:
                    item_display_name = matched_item.get("name", requested_item.get("item_name", "this item"))
                    clarification_item = {
                        **requested_item,
                        "item_name": item_display_name,
                        "quantity": quantity,
                    }

                    if _is_frozen_yogurt(menu_detail):
                        # Frozen yogurt keeps the old full-clarification flow
                        if session is not None:
                            session["pending_clarification"] = {
                                "type": "item_customization",
                                "requested_item": clarification_item,
                                "menu_detail": menu_detail,
                                "remaining_requested_items": remaining_requested_items,
                                "already_added_items": list(successful_items),
                            }
                            session["last_items"] = [clarification_item]
                            session["last_intent"] = "add_items"
                        set_session_stage(session_id, "item_customization")
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_customization_prompt(item_display_name, missing_variant_groups),
                            intent="add_items",
                            cart_updated=False,
                            cart_id=current_cart_id,
                            defaults_used=[],
                            suggestions=build_customization_suggestions(missing_variant_groups),
                            metadata={
                                "normalized_message": normalized_message,
                                "requested_items": requested_items,
                                "pipeline_stage": "add_item_needs_customization",
                            },
                        )

                    # Smart defaults path (everything except frozen yogurt)
                    updated_defaults_item, applied_labels, still_required = apply_smart_defaults(
                        clarification_item, menu_detail
                    )

                    if still_required:
                        # Defaults applied for size/milk; still ask for other required groups
                        if session is not None:
                            session["pending_clarification"] = {
                                "type": "item_customization",
                                "requested_item": updated_defaults_item,
                                "menu_detail": menu_detail,
                                "remaining_requested_items": remaining_requested_items,
                                "already_added_items": list(successful_items),
                            }
                            session["last_items"] = [updated_defaults_item]
                            session["last_intent"] = "add_items"
                        set_session_stage(session_id, "item_customization")
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_customization_prompt(item_display_name, still_required),
                            intent="add_items",
                            cart_updated=False,
                            cart_id=current_cart_id,
                            defaults_used=applied_labels,
                            suggestions=build_customization_suggestions(still_required),
                            metadata={
                                "normalized_message": normalized_message,
                                "requested_items": requested_items,
                                "pipeline_stage": "add_item_needs_customization",
                            },
                        )

                    if applied_labels:
                        if not multi_item_request:
                            # Single-item request: ask for confirmation after applying defaults.
                            if session is not None:
                                session["pending_clarification"] = {
                                    "type": "defaults_confirmation",
                                    "requested_item": updated_defaults_item,
                                    "original_item": clarification_item,
                                    "menu_detail": menu_detail,
                                    "applied_labels": applied_labels,
                                    "item_query": item_display_name,
                                }
                                session["last_items"] = [updated_defaults_item]
                                session["last_intent"] = "add_items"
                            set_session_stage(session_id, "defaults_confirmation")
                            return ChatMessageResponse(
                                session_id=session_id,
                                status="ok",
                                reply=build_defaults_confirmation_prompt(
                                    item_display_name,
                                    applied_labels,
                                    user_customizations={
                                        "options": clarification_item.get("options", {}),
                                        "addons": clarification_item.get("addons", []),
                                        "instructions": clarification_item.get("instructions", ""),
                                    },
                                ),
                                intent="add_items",
                                cart_updated=False,
                                cart_id=current_cart_id,
                                defaults_used=applied_labels,
                                suggestions=build_defaults_confirmation_suggestions(),
                                metadata={
                                    "normalized_message": normalized_message,
                                    "requested_items": requested_items,
                                    "pipeline_stage": "add_item_defaults_applied",
                                },
                            )
                        # Multi-item request: apply defaults and continue processing remaining items.
                        requested_item = updated_defaults_item
                    # else: only addon/sugar groups were missing — fall through to add

                selected_options, instructions, unsupported_customizations = map_requested_item_to_selected_options(
                    requested_item,
                    menu_detail,
                )

                if unsupported_customizations:
                    from app.services.menu_details import build_item_detail_reply

                    item_display_name = matched_item.get("name") or requested_item.get("item_name") or "This item"
                    if len(unsupported_customizations) == 1:
                        unsupported_text = unsupported_customizations[0]
                        prefix = f"{item_display_name} has no {unsupported_text} option."
                    else:
                        unsupported_text = ", ".join(unsupported_customizations[:-1]) + f" and {unsupported_customizations[-1]}"
                        prefix = f"{item_display_name} has no {unsupported_text} options."

                    item_detail_text = build_item_detail_reply(menu_detail if isinstance(menu_detail, dict) else matched_item)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=f"{prefix}\n\n{item_detail_text}",
                        intent="add_items",
                        cart_updated=False,
                        cart_id=current_cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "requested_items": requested_items,
                            "unsupported_customizations": unsupported_customizations,
                            "pipeline_stage": "add_item_unsupported_customization",
                        },
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

                menu_items_by_id = {
                    int(item.get("id")): item
                    for item in menu_items
                    if isinstance(item, dict) and item.get("id") is not None
                }
                anchor_menu_item_ids = sorted(
                    {
                        int(item.get("menuItemId"))
                        for item in cart_result["cart"]
                        if isinstance(item, dict) and item.get("menuItemId") is not None
                        and int(item.get("menuItemId")) != int(menu_item_id)
                    }
                )
                filtered_anchor_menu_item_ids = [
                    anchor_id
                    for anchor_id in anchor_menu_item_ids
                    if _is_recordable_combo_pair(menu_items_by_id.get(anchor_id), matched_item)
                ]
                if filtered_anchor_menu_item_ids:
                    await observe_combo(filtered_anchor_menu_item_ids, int(menu_item_id))

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
            # Ask each suggester for a broader candidate pool, then filter down here
            # so previous upsells do not accidentally exhaust the current response.
            popular = suggest_popular_items(featured_items, limit=6)
            complementary = suggest_complementary_items(menu_items, last_matched_item, limit=6)

            upsell = await get_upsell_suggestions(
                session_id=session_id,
                intent=intent,
                cart_items=cart_result["cart"],
                menu_items=menu_items,
                anchor_menu_item=last_matched_item,
            )

            suggestions = popular + complementary + upsell
            added_item_names = {item["matched_name"].lower() for item in successful_items}

            session = get_session(session_id)
            upsell_shown: list[str] = session.setdefault("upsell_shown", [])
            upsell_history = {
                name.strip().lower()
                for name in upsell_shown
                if isinstance(name, str) and name.strip()
            }

            filtered_suggestions = []
            filtered_names: set[str] = set()
            for suggestion in suggestions:
                suggestion_name = (suggestion.get("item_name") or "").strip().lower()
                if (
                    not suggestion_name
                    or suggestion_name in added_item_names
                    or suggestion_name in upsell_history
                    or suggestion_name in filtered_names
                ):
                    continue

                filtered_suggestions.append(suggestion)
                filtered_names.add(suggestion_name)

                if len(filtered_suggestions) == 2:
                    break

            # Pick upsell directly from upsell candidates so response caps on
            # generic suggestions do not hide upsell opportunities.
            upsell_pick = next(
                (
                    s
                    for s in upsell
                    if s.get("type") == "upsell"
                    and s.get("item_name")
                    and (s.get("item_name") or "").strip().lower() not in added_item_names
                    and (s.get("item_name") or "").strip().lower() not in upsell_history
                ),
                None,
            )
            if not upsell_pick:
                upsell_pick = next(
                    (
                        s
                        for s in filtered_suggestions
                        if s.get("type") == "upsell"
                        and s.get("item_name")
                    ),
                    None,
                )

            # Track only shown upsell names (not popular/complementary names).
            if upsell_pick:
                shown_name = (upsell_pick.get("item_name") or "").strip().lower()
                if shown_name and shown_name not in upsell_history:
                    upsell_shown.append(shown_name)
                    upsell_history.add(shown_name)

            cart_summary = build_cart_summary(cart_result["cart"])
            suggestion_lines = [f"- {s['item_name']}" for s in filtered_suggestions]

            def _added_item_customization_parts(item: dict) -> list[str]:
                parts: list[str] = []
                seen: set[str] = set()

                for opt in item.get("selected_options") or []:
                    if not isinstance(opt, dict):
                        continue
                    name = str(opt.get("name") or "").strip()
                    key = name.lower()
                    if name and key not in seen:
                        seen.add(key)
                        parts.append(name)

                instructions = str(item.get("instructions") or "").strip()
                key = instructions.lower()
                if instructions and key not in seen:
                    parts.append(instructions)

                return parts

            def _format_added_item_confirmation(item: dict) -> str:
                qty = int(item.get("quantity") or 1)
                name = item.get("matched_name") or "item"
                custom_parts = _added_item_customization_parts(item)
                prefix = f"{qty}x {name}" if qty > 1 else name
                if custom_parts:
                    return f"{prefix} with {', '.join(custom_parts)}"
                return prefix

            def _join_natural(parts: list[str]) -> str:
                if not parts:
                    return ""
                if len(parts) == 1:
                    return parts[0]
                if len(parts) == 2:
                    return f"{parts[0]} and {parts[1]}"
                return ", ".join(parts[:-1]) + f", and {parts[-1]}"

            if len(successful_items) == 1 and not failed_items:
                added_item = successful_items[0]
                reply_text = (
                    f"Added {added_item['quantity']} {added_item['matched_name']} to your cart.\n\n"
                    f"Your cart now contains:\n{cart_summary}"
                )
            else:
                any_customized = any(
                    _added_item_customization_parts(item)
                    for item in successful_items
                )
                if len(successful_items) >= 2 and any_customized:
                    confirmations = [
                        _format_added_item_confirmation(item)
                        for item in successful_items
                    ]
                    reply_parts = [
                        f"Got it! {_join_natural(confirmations)}. Want to change anything?"
                    ]
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

            if upsell_pick and last_matched_item:
                context_name = (
                    (upsell_pick.get("anchor_item_name") or "").strip()
                    or last_matched_item.get("name")
                    or successful_items[0]["matched_name"]
                )
                reply_text += f"\n\nWould you like to add {upsell_pick.get('item_name')}?"
                if upsell_pick.get("fun_fact"):
                    reply_text += f"\n{upsell_pick.get('fun_fact')}"
            upsell_response_suggestions = [upsell_pick] if upsell_pick else []

            if session is not None:
                session["cart_id"] = current_cart_id
                session["last_items"] = list(requested_items)
                session["last_intent"] = "add_items"
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent="add_items",
                cart_updated=True,
                cart_id=current_cart_id,
                defaults_used=[],
                suggestions=upsell_response_suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "added_items": successful_items,
                    "failed_items": failed_items,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "add_items_done",
                },
            )

        if intent in {"unknown", "recommendation_query"}:
            remember_last_item_query(session, normalized_message)

        fallback_reply = await generate_fallback_reply(normalized_message)
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
