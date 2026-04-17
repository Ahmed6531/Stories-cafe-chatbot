# app/services/orchestrator.py

import logging
import re
import httpx
from difflib import SequenceMatcher

from app.schemas.chat import ChatMessageResponse
from app.services.fallback_assistant import generate_fallback_reply
from app.services.intent_pipeline import resolve_intent
from app.services.item_clarification import get_menu_detail_variants
from app.services.llm_interpreter import _extract_json_object, _generate_gemini_content_async
from app.utils.static_replies import STATIC_REPLY_TABLE
from app.services.session_store import (
    Session,
    clear_guided_order_session,
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
    set_guided_order_optional_groups,
    set_guided_order_quantity,
    set_guided_order_required_groups,
    set_guided_order_selections,
    set_guided_order_step,
    set_checkout_initiated,
    update_last_action,
    get_pending_operations,
    set_pending_operations,
    get_pending_operations_context,
    set_pending_operations_context,
    clear_pending_operations,
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

GUIDED_SKIP_WORDS = frozenset({"none", "skip", "nothing", "no"})
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
TOKEN_EQUIVALENTS = {
    "not": "no",
    "without": "no",
    "warmed": "warming",
    "warm": "warming",
    "unwarmed": "no warming",
    "iced": "ice",
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


def is_menu_item_available(menu_item: dict | None) -> bool:
    if not isinstance(menu_item, dict):
        return False
    return menu_item.get("isAvailable") is not False


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




def normalize_modifier_text(value: str | None) -> str:
    if value is None:
        return ""

    normalized = re.sub(r"[^a-z0-9\s]+", " ", str(value).lower())
    return " ".join(normalized.split())


def get_variant_group_label(group: dict | None) -> str:
    if not isinstance(group, dict):
        return ""
    return (
        str(group.get("customerLabel") or "").strip()
        or str(group.get("name") or "").strip()
        or str(group.get("adminName") or "").strip()
    )


def get_variant_group_key(group: dict | None) -> str:
    label = normalize_modifier_text(get_variant_group_label(group))
    if "size" in label:
        return "size"
    if "milk" in label:
        return "milk"
    if "sugar" in label:
        return "sugar"
    if (
        "topping" in label
        or "flavor" in label
        or "espresso" in label
        or "add on" in label
        or "add-on" in label
    ):
        return "addons"
    return "other"


def _extract_option_name(option: dict | None) -> str:
    if not isinstance(option, dict):
        return ""
    return str(option.get("optionName") or option.get("name") or "").strip()


def cart_item_to_requested_item(cart_item: dict, menu_detail: dict | None) -> dict:
    requested_item = {
        "item_name": cart_item.get("name") or "",
        "quantity": int(cart_item.get("qty") or 1),
        "size": None,
        "options": {"milk": None, "sugar": None},
        "addons": [],
        "instructions": str(cart_item.get("instructions") or "").strip(),
    }

    selected_options = cart_item.get("selectedOptions") if isinstance(cart_item.get("selectedOptions"), list) else []
    if not selected_options:
        return requested_item

    option_name_to_group: dict[str, dict] = {}
    for group, option in iter_variant_options(menu_detail):
        option_name = normalize_modifier_text(option.get("name"))
        if option_name:
            option_name_to_group[option_name] = group

    seen_addons: set[str] = set()
    for selected_option in selected_options:
        option_name = _extract_option_name(selected_option)
        normalized_option_name = normalize_modifier_text(option_name)
        if not normalized_option_name:
            continue

        group = option_name_to_group.get(normalized_option_name)
        group_key = get_variant_group_key(group)
        if group_key == "size":
            requested_item["size"] = option_name
        elif group_key == "milk":
            requested_item["options"]["milk"] = option_name
        elif group_key == "sugar":
            requested_item["options"]["sugar"] = option_name
        else:
            if normalized_option_name not in seen_addons:
                seen_addons.add(normalized_option_name)
                requested_item["addons"].append(option_name)

    return requested_item


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
    if base_instructions and override_instructions:
        if normalize_modifier_text(base_instructions) == normalize_modifier_text(override_instructions):
            merged["instructions"] = base_instructions
        else:
            merged["instructions"] = f"{base_instructions}; {override_instructions}".strip("; ")
    else:
        merged["instructions"] = override_instructions or base_instructions

    return merged




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


def split_instruction_fragments(value: str | None) -> list[str]:
    if not isinstance(value, str):
        return []

    return [
        fragment.strip()
        for fragment in re.split(r"[;,]+", value)
        if fragment and fragment.strip()
    ]


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


def guided_group_name(group: dict | None) -> str:
    if not isinstance(group, dict):
        return ""
    return str(
        group.get("customerLabel")
        or group.get("name")
        or group.get("adminName")
        or ""
    ).strip()


def iter_variant_options(menu_detail: dict | None) -> list[tuple[dict, dict]]:
    if not isinstance(menu_detail, dict):
        return []

    variant_options: list[tuple[dict, dict]] = []
    for group in get_menu_detail_variants(menu_detail):
        if not isinstance(group, dict):
            continue
        for option in active_variant_options(group):
            if isinstance(option, dict) and option.get("name"):
                variant_options.append((group, option))

    return variant_options


def _tokenize_modifier(value: str) -> set[str]:
    normalized = normalize_modifier_text(value)
    if not normalized:
        return set()

    expanded_tokens: list[str] = []
    for token in normalized.split():
        replacement = TOKEN_EQUIVALENTS.get(token, token)
        expanded_tokens.extend(replacement.split())

    return set(expanded_tokens)


def _best_token_overlap(option_name: str | None, candidates: list[str]) -> tuple[int, float, float]:
    option_tokens = _tokenize_modifier(option_name or "")
    best_overlap_count = 0
    best_candidate_ratio = 0.0
    best_option_ratio = 0.0

    for candidate in candidates:
        candidate_tokens = _tokenize_modifier(candidate)
        if not candidate_tokens or not option_tokens:
            continue
        overlap = candidate_tokens & option_tokens
        overlap_count = len(overlap)
        candidate_ratio = overlap_count / len(candidate_tokens)
        option_ratio = overlap_count / len(option_tokens)
        if (
            overlap_count > best_overlap_count
            or (
                overlap_count == best_overlap_count
                and (candidate_ratio > best_candidate_ratio or option_ratio > best_option_ratio)
            )
        ):
            best_overlap_count = overlap_count
            best_candidate_ratio = candidate_ratio
            best_option_ratio = option_ratio

    return best_overlap_count, best_candidate_ratio, best_option_ratio


def _phrase_contains_whole(lhs: str, rhs: str) -> bool:
    if not lhs or not rhs:
        return False
    pattern = rf"(?<![a-z0-9]){re.escape(lhs)}(?![a-z0-9])"
    return bool(re.search(pattern, rhs))


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

    group_name = normalize_modifier_text(get_variant_group_label(group))
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
        elif allow_contains and (
            _phrase_contains_whole(candidate, option_name)
            or _phrase_contains_whole(option_name, candidate)
        ):
            score = max(score, 80)
        else:
            candidate_tokens = _tokenize_modifier(candidate)
            option_tokens = _tokenize_modifier(option_name)
            if candidate_tokens and option_tokens:
                overlap = candidate_tokens & option_tokens
                candidate_ratio = len(overlap) / len(candidate_tokens)
                option_ratio = len(overlap) / len(option_tokens)
                if candidate_ratio >= 0.6 or option_ratio >= 0.6:
                    score = max(score, 60)

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
    best_overlap = (0, 0.0, 0.0)

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
        overlap = _best_token_overlap(option.get("name"), candidates)
        if (
            score > best_score
            or (
                score == best_score
                and score > 0
                and overlap > best_overlap
            )
        ):
            best_score = score
            best_option = option
            best_overlap = overlap

    return best_option


def append_selected_option(
    selected_options: list[dict],
    option_name: str | None,
    group_name: str | None = None,
) -> None:
    if not isinstance(option_name, str) or not option_name.strip():
        return

    option_key = normalize_modifier_text(option_name)
    for existing in selected_options:
        existing_name = existing.get("optionName") if isinstance(existing, dict) else None
        if normalize_modifier_text(existing_name) == option_key:
            return

    entry: dict = {"optionName": option_name.strip()}
    if group_name and str(group_name).strip():
        entry["groupName"] = str(group_name).strip()
    selected_options.append(entry)


def find_closest_variant_suggestion(
    menu_detail: dict | None,
    unmatched_fragment: str,
    threshold: int = 40,
) -> str | None:
    best_name = None
    best_score = threshold
    normalized_fragment = normalize_modifier_text(unmatched_fragment)
    if not normalized_fragment:
        return None

    for group, option in iter_variant_options(menu_detail):
        score = score_variant_option(
            group,
            option,
            candidates=[normalized_fragment],
            allow_contains=True,
        )
        if score <= 0:
            overlap_count, candidate_ratio, option_ratio = _best_token_overlap(
                option.get("name"),
                [normalized_fragment],
            )
            if overlap_count > 0 and (candidate_ratio >= 0.34 or option_ratio >= 0.34):
                score = 41
        if score > best_score:
            best_score = score
            best_name = option.get("name")

    return best_name


def active_variant_options(group: dict) -> list[dict]:
    options = group.get("options") if isinstance(group, dict) else None
    if not isinstance(options, list):
        return []
    all_options = [
        option
        for option in options
        if isinstance(option, dict) and option.get("name")
    ]
    active_options = [
        option
        for option in all_options
        if option.get("isActive") is not False
    ]
    return active_options if active_options else all_options


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


def _group_max_selections(group: dict) -> int | None:
    if not isinstance(group, dict):
        return 1

    value = group.get("maxSelections", group.get("max"))
    if value in (None, "", False):
        return None if group.get("multiSelect") else 1

    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 1


def _selection_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _selection_summary_parts(selections: dict) -> list[str]:
    parts: list[str] = []
    if not isinstance(selections, dict):
        return parts

    for value in selections.values():
        parts.extend(_selection_list(value))
    return parts


def _build_selected_options_from_selections(selections: dict) -> list[dict]:
    selected_options: list[dict] = []
    for option_name in _selection_summary_parts(selections):
        append_selected_option(selected_options, option_name)
    return selected_options


def _find_guided_group(groups: list[dict], group_name: str | None) -> dict | None:
    normalized_query = normalize_modifier_text(group_name)
    if not normalized_query:
        return None

    best_group = None
    best_score = 0
    query_tokens = set(normalized_query.split())

    for group in groups:
        candidate_name = normalize_modifier_text(guided_group_name(group))
        if not candidate_name:
            continue
        if candidate_name == normalized_query:
            return group

        score = 0
        if normalized_query in candidate_name or candidate_name in normalized_query:
            score = 80
        else:
            candidate_tokens = set(candidate_name.split())
            overlap = query_tokens & candidate_tokens
            if query_tokens and candidate_tokens:
                if len(overlap) / len(query_tokens) >= 0.6 or len(overlap) / len(candidate_tokens) >= 0.6:
                    score = 60

        if score > best_score:
            best_score = score
            best_group = group

    return best_group


def _find_group_for_option_name(groups: list[dict], option_name: str) -> tuple[dict, str] | tuple[None, None]:
    normalized_option = normalize_modifier_text(option_name)
    if not normalized_option:
        return None, None

    for group in groups:
        for option in active_variant_options(group):
            candidate_name = option.get("name")
            if normalize_modifier_text(candidate_name) == normalized_option:
                return group, candidate_name

    return None, None


def _match_option_records_for_group(group: dict, user_message: str) -> list[tuple[dict, int]]:
    normalized_message = normalize_modifier_text(user_message)
    if not normalized_message:
        return []

    matches: list[tuple[dict, int, tuple[int, float, float]]] = []
    for option in active_variant_options(group):
        score = score_variant_option(
            group,
            option,
            candidates=[normalized_message],
            allow_contains=True,
        )
        if score > 0:
            matches.append((option, score, _best_token_overlap(option.get("name"), [normalized_message])))

    matches.sort(
        key=lambda entry: (
            -entry[1],
            -entry[2][0],
            -entry[2][1],
            -entry[2][2],
            normalize_modifier_text(entry[0].get("name")),
        )
    )
    return [(option, score) for option, score, _overlap in matches]


def _match_option_names_for_group(group: dict, user_message: str) -> list[str]:
    max_selections = _group_max_selections(group)
    option_names: list[str] = []

    for option, _score in _match_option_records_for_group(group, user_message):
        option_name = option.get("name")
        if not isinstance(option_name, str) or not option_name.strip():
            continue
        if any(normalize_modifier_text(existing) == normalize_modifier_text(option_name) for existing in option_names):
            continue
        option_names.append(option_name.strip())
        if max_selections is not None and len(option_names) >= max_selections:
            break

    return option_names


def _set_group_selection(selections: dict, group: dict, option_names: list[str], *, replace: bool) -> list[str]:
    group_name = guided_group_name(group)
    if not isinstance(group_name, str) or not group_name.strip():
        return []

    clean_names = [name.strip() for name in option_names if isinstance(name, str) and name.strip()]
    if not clean_names:
        return []

    max_selections = _group_max_selections(group)
    existing_names = [] if replace else _selection_list(selections.get(group_name))
    combined_names: list[str] = []
    for name in [*existing_names, *clean_names]:
        if any(normalize_modifier_text(existing) == normalize_modifier_text(name) for existing in combined_names):
            continue
        combined_names.append(name)
        if max_selections is not None and len(combined_names) >= max_selections:
            break

    if max_selections == 1:
        selections[group_name] = combined_names[0]
    else:
        selections[group_name] = combined_names
    return clean_names


def _build_group_options_text(group: dict) -> str:
    return ", ".join(
        option.get("name", "")
        for option in active_variant_options(group)
        if option.get("name")
    )


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


def _phase3_heuristic(
    normalized_message: str,
    optional_groups: list[dict],
    current_selections: dict,
) -> dict | None:
    del current_selections
    msg = _normalize_whitespace(normalized_message)
    if not msg:
        return None

    # ── Finalize words ────────────────────────────────────────────────
    phase3_done_words = frozenset({
        "done", "add it", "add to cart", "add", "skip", "none",
        "yes", "yep", "yeah", "that's it", "nothing else",
        "looks good", "perfect", "great", "no", "nope",
        "no thanks", "nothing", "that is all", "that's all",
        "that will be all", "that'll be all", "i'm good",
        "im good", "all good", "i think that's it",
        "i think thats it",
    })
    if msg in phase3_done_words:
        return {
            "action": "finalize",
            "group_name": None,
            "selections": [],
            "reply_hint": None,
        }

    # ── Check if message ends with a finalize signal after an option ──
    # e.g. "almond milk large, that is all" or "yirgacheffe shot done"
    finalize_suffixes = (
        ", that is all", ", that's all", ", done", " that is all",
        " that's all", " and that's it", " and that is it",
        " and done", ", and done", " i'm good", " im good",
        " all good", " nothing else",
    )
    msg_without_suffix = msg
    has_finalize_suffix = False
    for suffix in finalize_suffixes:
        if msg.endswith(suffix):
            msg_without_suffix = msg[: -len(suffix)].strip().rstrip(",").strip()
            has_finalize_suffix = True
            break

    # ── Change/swap modifier patterns ────────────────────────────────
    # Normalize swap/change/make/update language to expose the target
    # e.g. "swap the milk to almond milk large" → "almond milk large"
    # e.g. "change size to medium" → "medium"
    # e.g. "make it large instead" → "large"
    # e.g. "actually oat milk" → "oat milk"
    change_patterns = [
        r"(?:swap|change|update|switch)\s+(?:the\s+)?(?:\w+\s+)?to\s+(?:be\s+)?(.+)",
        r"(?:make\s+it|set\s+it\s+to|set\s+to)\s+(.+?)(?:\s+instead)?$",
        r"(?:actually|instead)\s+(.+)",
        r"(?:i\s+(?:want|d\s+like|would\s+like))\s+(.+?)(?:\s+instead)?$",
    ]

    import re as _re
    extracted_target = None
    for pattern in change_patterns:
        m = _re.search(pattern, msg_without_suffix)
        if m:
            extracted_target = _normalize_whitespace(m.group(1))
            break

    # Work with either the extracted target or the full message
    search_text = extracted_target or msg_without_suffix

    normalized_search = normalize_modifier_text(search_text)

    # ── Exact option name match ───────────────────────────────────────
    for group in optional_groups:
        for option in active_variant_options(group):
            option_name = option.get("name", "")
            if normalize_modifier_text(option_name) == normalized_search:
                result = {
                    "action": "change" if extracted_target else "select",
                    "group_name": guided_group_name(group),
                    "selections": [option_name],
                    "reply_hint": None,
                }
                if has_finalize_suffix:
                    result["action"] = "finalize_after_select"
                return result

    # ── Fuzzy option name match (token overlap) ───────────────────────
    # Catches "almond milk large" matching "Almond Milk Large" etc.
    best_match_option = None
    best_match_group = None
    best_score = 0

    for group in optional_groups:
        for option in active_variant_options(group):
            option_score = score_variant_option(
                group,
                option,
                candidates=[normalized_search],
                allow_contains=True,
            )
            if option_score > best_score:
                best_score = option_score
                best_match_option = option
                best_match_group = group

    if best_match_option and best_score >= 60:
        option_name = best_match_option.get("name", "")
        result = {
            "action": "change" if extracted_target else "select",
            "group_name": guided_group_name(best_match_group),
            "selections": [option_name],
            "reply_hint": None,
        }
        if has_finalize_suffix:
            result["action"] = "finalize_after_select"
        return result

    # ── Query patterns ────────────────────────────────────────────────
    for group in optional_groups:
        normalized_group_name = normalize_modifier_text(
            guided_group_name(group)
        )
        if not normalized_group_name or normalized_group_name not in normalized_search:
            continue
        if any(
            token in normalized_search
            for token in ("what", "which", "options", "have", "available")
        ):
            return {
                "action": "query_options",
                "group_name": guided_group_name(group),
                "selections": [],
                "reply_hint": (
                    f"For {guided_group_name(group)}: "
                    f"{_build_group_options_text(group)}."
                ),
            }

    # If message ends with a finalize suffix but we couldn't match the
    # option, treat the whole thing as unclear so the LLM can handle it
    if has_finalize_suffix and not best_match_option:
        return None

    return None


def _guided_group_rank(group_name: str) -> tuple[int, str]:
    normalized_name = normalize_modifier_text(group_name)
    if "size" in normalized_name:
        return (0, normalized_name)
    if "milk" in normalized_name:
        return (1, normalized_name)
    if any(keyword in normalized_name for keyword in ("extra", "addon", "add on", "topping", "syrup")):
        return (3, normalized_name)
    return (2, normalized_name)


def build_guided_order_groups(menu_detail: dict | None) -> tuple[list[dict], list[dict]]:
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
        group_copy["options"] = active_options
        groups.append(group_copy)

    groups.sort(key=lambda group: _guided_group_rank(guided_group_name(group)))
    required_groups = [group for group in groups if _is_required_guided_group(group)]
    optional_groups = [group for group in groups if not _is_required_guided_group(group)]
    return required_groups, optional_groups


def build_guided_order_prompt(
    item_name: str,
    group: dict,
    *,
    include_item_name: bool = False,
    allow_skip: bool = True,
) -> str:
    option_names = _build_group_options_text(group)
    group_name = (guided_group_name(group) or "option").lower()
    max_selections = _group_max_selections(group)
    count_hint = ""
    if max_selections and max_selections > 1:
        count_hint = f" You can choose up to {max_selections}."

    base_prompt = (
        f"What {group_name} would you like for your {item_name}? Options: {option_names}.{count_hint}"
        if include_item_name
        else f"What {group_name} would you like? Options: {option_names}.{count_hint}"
    )
    if allow_skip:
        return f"{base_prompt} Say 'skip' to use the default."
    return base_prompt


def build_optional_review_prompt(
    item_name: str,
    current_selections: dict,
    optional_groups: list[dict],
) -> str:
    summary_parts = _selection_summary_parts(current_selections)
    summary = ", ".join(summary_parts) if summary_parts else "no customizations yet"

    lines = [f"Got it! Here's what I have for your {item_name}: {summary}."]
    lines.append("Would you like to customize anything else?")

    for group in optional_groups:
        group_label = group.get("name") or "Option"
        max_selections = _group_max_selections(group)
        count_hint = f" (up to {max_selections})" if max_selections and max_selections > 1 else ""
        option_names = _build_group_options_text(group)
        lines.append(f"- {group_label}{count_hint}: {option_names}")

    lines.append("Say 'done' or 'add to cart' to add as is, or tell me what you'd like.")
    return "\n".join(lines)


def build_guided_instructions_prompt(item_name: str | None = None) -> str:
    if item_name:
        return f"Any special instructions for your {item_name}? Say 'none' to skip."
    return "Any special instructions? Say 'none' to skip."


def build_modifier_candidates_from_menu_detail(
    menu_detail: dict | None,
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
    """
    Builds size, milk, and addon candidate maps dynamically from the
    item's actual variant group data.

    Returns:
        (size_candidates, milk_candidates, addon_candidates)

    Each map is: {canonical_option_name: [alias1, alias2, ...]}

    Falls back to the hardcoded module-level constants if menu_detail
    is None or has no variant groups.
    """
    if not isinstance(menu_detail, dict):
        return SIZE_CANDIDATES, MILK_CANDIDATES, ADDON_CANDIDATES

    variants = get_menu_detail_variants(menu_detail)
    if not variants:
        return SIZE_CANDIDATES, MILK_CANDIDATES, ADDON_CANDIDATES

    size_candidates: dict[str, list[str]] = {}
    milk_candidates: dict[str, list[str]] = {}
    addon_candidates: dict[str, list[str]] = {}

    for group in variants:
        if not isinstance(group, dict):
            continue

        group_key = get_variant_group_key(group)
        options = active_variant_options(group)

        for option in options:
            option_name = str(option.get("name") or "").strip()
            if not option_name:
                continue

            normalized_name = normalize_modifier_text(option_name)
            if not normalized_name:
                continue

            # Build aliases: the option name itself plus common
            # abbreviations and partial matches
            aliases = [normalized_name]

            # Add individual tokens as aliases for multi-word options
            # e.g. "Almond Milk Small" → also matches "almond", "almond milk"
            tokens = normalized_name.split()
            if len(tokens) > 1:
                # Add progressively shorter prefixes
                for i in range(1, len(tokens)):
                    prefix = " ".join(tokens[:i])
                    if len(prefix) >= 3:
                        aliases.append(prefix)

            # Size-specific abbreviations
            if group_key == "size":
                if "small" in normalized_name:
                    aliases.extend(["small", "sm", "smol"])
                if "medium" in normalized_name:
                    aliases.extend(["medium", "med", "meduim"])
                if "large" in normalized_name:
                    aliases.extend(["large", "lg"])
                size_candidates[option_name] = list(dict.fromkeys(aliases))

            # Milk-specific aliases
            elif group_key == "milk":
                if "full fat" in normalized_name or "whole" in normalized_name:
                    aliases.extend([
                        "full fat", "whole milk", "regular milk",
                        "full cream", "full", "regular",
                    ])
                if "skim" in normalized_name:
                    aliases.extend(["skim", "skimmed", "low fat"])
                if "almond" in normalized_name:
                    aliases.extend(["almond", "almond milk"])
                if "oat" in normalized_name:
                    aliases.extend(["oat", "oat milk"])
                if "soy" in normalized_name:
                    aliases.extend(["soy", "soy milk"])
                if "coconut" in normalized_name:
                    aliases.extend(["coconut", "coconut milk"])
                if "lactose" in normalized_name:
                    aliases.extend(["lactose free", "no lactose"])
                milk_candidates[option_name] = list(dict.fromkeys(aliases))

            # Everything else is an addon
            else:
                if "decaf" in normalized_name or "decaffe" in normalized_name:
                    aliases.extend(["decaf", "decaffe", "shot decaffe"])
                if "extra shot" in normalized_name or "add shot" in normalized_name:
                    aliases.extend(["extra shot", "add shot", "shot"])
                if "vanilla" in normalized_name:
                    aliases.extend(["vanilla", "vanilla syrup"])
                if "caramel" in normalized_name and "sugar free" not in normalized_name:
                    aliases.extend(["caramel", "caramel syrup"])
                if "hazelnut" in normalized_name:
                    aliases.append("hazelnut")
                if "whipped" in normalized_name:
                    aliases.extend(["whipped cream", "whip"])
                if "yirgacheffe" in normalized_name:
                    aliases.extend(["yirgacheffe", "yirgacheffe shot"])
                addon_candidates[option_name] = list(dict.fromkeys(aliases))

    # If any map is empty fall back to hardcoded constants
    # so items with unusual group structures still work
    return (
        size_candidates or SIZE_CANDIDATES,
        milk_candidates or MILK_CANDIDATES,
        addon_candidates or ADDON_CANDIDATES,
    )


def map_requested_item_to_selected_options(
    requested_item: dict,
    menu_detail: dict | None,
) -> tuple[list[dict], str, list[dict]]:
    if not isinstance(requested_item, dict):
        return [], "", []

    # Build modifier candidates dynamically from this item's variant data
    # Falls back to module-level constants if menu_detail is unavailable
    _size_candidates, _milk_candidates, _addon_candidates = (
        build_modifier_candidates_from_menu_detail(menu_detail)
    )

    selected_options: list[dict] = []
    instruction_parts: list[str] = []
    unmatched_suggestions: list[dict] = []
    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}

    def record_unmatched_modifier(fragment: str | None) -> None:
        if not isinstance(fragment, str) or not fragment.strip():
            return

        add_unique_phrase(instruction_parts, fragment)
        unmatched_suggestions.append(
            {
                "fragment": fragment.strip(),
                "suggestion": find_closest_variant_suggestion(menu_detail, fragment),
            }
        )

    resolved_size = None
    size_value = requested_item.get("size")
    if isinstance(size_value, str) and size_value.strip():
        size_candidates = expand_candidates(size_value, _size_candidates)
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
            append_selected_option(
                selected_options,
                matched_size.get("name"),
                get_variant_group_label(
                    next(
                        (g for g, o in iter_variant_options(menu_detail)
                         if o.get("name") == matched_size.get("name")),
                        None,
                    )
                ),
            )
            resolved_size = normalize_modifier_text(matched_size.get("name")) or preferred_size
        else:
            record_unmatched_modifier(size_value)
            resolved_size = preferred_size

    milk_value = options.get("milk")
    if isinstance(milk_value, str) and milk_value.strip():
        milk_candidates = expand_candidates(milk_value, _milk_candidates)
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
            append_selected_option(
                selected_options,
                matched_milk.get("name"),
                get_variant_group_label(
                    next(
                        (g for g, o in iter_variant_options(menu_detail)
                         if o.get("name") == matched_milk.get("name")),
                        None,
                    )
                ),
            )
        else:
            record_unmatched_modifier(milk_value)

    sugar_value = options.get("sugar")
    if isinstance(sugar_value, str) and sugar_value.strip():
        matched_sugar = find_variant_option(
            menu_detail,
            [normalize_modifier_text(sugar_value)],
            allow_contains=False,
        )
        if matched_sugar:
            append_selected_option(
                selected_options,
                matched_sugar.get("name"),
                get_variant_group_label(
                    next(
                        (g for g, o in iter_variant_options(menu_detail)
                         if o.get("name") == matched_sugar.get("name")),
                        None,
                    )
                ),
            )
        else:
            record_unmatched_modifier(sugar_value)

    addons = requested_item.get("addons")
    if isinstance(addons, list):
        # Track selections per group to respect maxSelections constraint
        group_selections: dict[str, list[str]] = {}
        
        for addon in addons:
            addon_candidates = expand_candidates(addon, _addon_candidates)
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
                    group_id = normalize_modifier_text(get_variant_group_label(option_group))
                    
                    # Initialize group tracking if needed
                    if group_id not in group_selections:
                        group_selections[group_id] = []
                    
                    # Only add if we haven't exceeded maxSelections
                    if max_selections is None or len(group_selections[group_id]) < max_selections:
                        append_selected_option(
                            selected_options,
                            matched_addon.get("name"),
                            get_variant_group_label(option_group) if option_group else None,
                        )
                        group_selections[group_id].append(matched_addon.get("name"))
                    else:
                        # Exceeded maxSelections - add to instructions instead
                        add_unique_phrase(instruction_parts, str(addon))
                else:
                    # If we can't find the group, add it (fallback)
                    append_selected_option(selected_options, matched_addon.get("name"))
            else:
                record_unmatched_modifier(str(addon))

    for fragment in split_instruction_fragments(requested_item.get("instructions")):
        matched_instruction = find_variant_option(
            menu_detail,
            [normalize_modifier_text(fragment)],
            allow_contains=True,
        )
        if matched_instruction:
            append_selected_option(
                selected_options,
                matched_instruction.get("name"),
                get_variant_group_label(
                    next(
                        (g for g, o in iter_variant_options(menu_detail)
                         if o.get("name") == matched_instruction.get("name")),
                        None,
                    )
                ),
            )
        else:
            record_unmatched_modifier(fragment)

    return selected_options, "; ".join(instruction_parts), unmatched_suggestions


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

    item_id = get_guided_order_item_id(session_id)
    item_name = get_guided_order_item_name(session_id)
    quantity = get_guided_order_quantity(session_id)
    selections = get_guided_order_selections(session_id)

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

    selected_options = _build_selected_options_from_selections(selections)

    try:
        cart_result = await add_item_to_cart(
            menu_item_id=item_id,
            qty=quantity,
            selected_options=selected_options,
            instructions=instructions_text,
            cart_id=cart_id,
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

    cart_summary = build_cart_summary(cart_result["cart"])
    summary_parts = _selection_summary_parts(selections)
    if instructions_text:
        summary_parts.append(instructions_text)
    selection_summary = ", ".join(summary_parts)
    summary_suffix = f" ({selection_summary})" if selection_summary else ""

    clear_guided_order_session(session_id)
    set_session_stage(session_id, None)

    reply_text = f"Added {quantity}x {item_name}{summary_suffix} to your cart."
    if cart_summary:
        reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

    # Check if there are pending operations to drain
    pending_ops = get_pending_operations(session_id)
    if pending_ops:
        accumulated = [reply_text]
        drain_response = await _drain_pending_operations(
            session_id=session_id,
            cart_id=cart_result["cart_id"],
            session=get_session(session_id),
            auth_cookie=None,
            normalized_message=normalized_message,
            accumulated_replies=accumulated,
        )
        if drain_response:
            return drain_response

    return ChatMessageResponse(
        session_id=session_id,
        status="ok",
        reply=reply_text,
        intent=intent,
        cart_updated=True,
        cart_id=cart_result["cart_id"],
        defaults_used=[],
        suggestions=[],
        metadata={
            "normalized_message": normalized_message,
            "guided_order_item_id": item_id,
            "guided_order_item_name": item_name,
            "guided_order_selections": selections,
            "guided_order_instructions": instructions_text,
            "cart": cart_result["cart"],
            "pipeline_stage": pipeline_stage,
        },
    )


async def _interpret_phase3_response(
    user_message: str,
    item_name: str,
    optional_groups: list[dict],
    current_selections: dict,
) -> dict:
    groups_lines = []
    for group in optional_groups:
        option_names = _build_group_options_text(group)
        max_selections = _group_max_selections(group)
        max_hint = f" (max {max_selections})" if max_selections else ""
        groups_lines.append(f"- {group.get('name', 'Option')}{max_hint}: {option_names}")

    current_lines = []
    for group_name, value in (current_selections or {}).items():
        display_value = ", ".join(_selection_list(value))
        if display_value:
            current_lines.append(f"- {group_name}: {display_value}")

    prompt = f"""
You are interpreting a customer's reply during a cafe ordering customization flow.

The customer is customizing: {item_name}

Available optional groups and their options:
{chr(10).join(groups_lines) if groups_lines else "- None"}

Current selections already made:
{chr(10).join(current_lines) if current_lines else "- None"}

Customer message: "{user_message}"

Return ONLY valid JSON with this schema:
{{
  "action": string,
  "group_name": string or null,
  "selections": [string],
  "reply_hint": string or null
}}

Valid action values:
- "finalize": customer is done customizing
- "select": customer named one or more options to add
- "change": customer wants to replace a selection
- "query_options": customer is asking what options exist for a group
- "query_max": customer is asking how many they can pick
- "unclear": none of the above

Rules:
- Only use exact option names from the available list in "selections".
- Never invent option names.
- If the customer names multiple matching options, include all of them.
- "done", "add it", "add to cart", "that's it", "nothing else", "looks good", "perfect", "yes", "no", "nope" alone mean "finalize".
"""
    raw_text = await _generate_gemini_content_async(prompt, timeout=10.0)
    parsed = _extract_json_object(raw_text or "")
    if not isinstance(parsed, dict):
        return {
            "action": "unclear",
            "group_name": None,
            "selections": [],
            "reply_hint": None,
        }

    parsed.setdefault("group_name", None)
    parsed.setdefault("selections", [])
    parsed.setdefault("reply_hint", None)
    if not isinstance(parsed.get("selections"), list):
        parsed["selections"] = []
    if parsed.get("action") not in {"finalize", "select", "change", "query_options", "query_max", "unclear"}:
        parsed["action"] = "unclear"
    return parsed


def _is_recordable_combo_pair(anchor_item: dict | None, new_item: dict | None) -> bool:
    """
    Returns True if two menu items are worth recording as a combo pair.
    Excludes cases where either item is missing or they are the same item.
    """
    if not isinstance(anchor_item, dict) or not isinstance(new_item, dict):
        return False
    anchor_id = anchor_item.get("id") or anchor_item.get("_id")
    new_id = new_item.get("id") or new_item.get("_id")
    if anchor_id is None or new_id is None:
        return False
    return str(anchor_id) != str(new_id)


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


def _build_op_failure_reply(item_name: str | None, failure_reason: str | None) -> str:
    clean_name = (item_name or "that item").strip() or "that item"
    if failure_reason == "out_of_stock":
        return f"{clean_name} is out of stock right now."
    if failure_reason == "not_found":
        return f"I couldn't find {clean_name} on the menu."
    if failure_reason == "missing_id":
        return f"I found {clean_name} but couldn't add it right now."
    if failure_reason == "api_error":
        return f"Something went wrong adding {clean_name} — want to try again?"
    return f"I couldn't process {clean_name} right now."


def _sort_operations_by_priority(operations: list[dict]) -> list[dict]:
    """
    Enforces execution order regardless of LLM message order:
      1. clear_cart        — always first
      2. remove_item       — immediate, in LLM order
      3. update_quantity   — immediate, in LLM order
      4. add_items         — in LLM order, may trigger guided ordering
      5. view_cart         — after all adds
      6. checkout          — always last

    Any other intent preserves its original LLM position between
    add_items and view_cart.
    """
    PRIORITY = {
        "clear_cart": 0,
        "remove_item": 1,
        "update_quantity": 2,
        "add_items": 3,
        "view_cart": 4,
        "checkout": 5,
        "confirm_checkout": 5,
    }
    DEFAULT_PRIORITY = 3

    indexed = list(enumerate(operations))
    indexed.sort(key=lambda entry: (
        PRIORITY.get(entry[1].get("intent"), DEFAULT_PRIORITY),
        entry[0],  # preserve LLM order within same priority tier
    ))
    return [op for _, op in indexed]


async def _execute_single_op(
    op_intent: str,
    op_items: list,
    session_id: str,
    cart_id: str | None,
    session,
    auth_cookie: str | None,
    normalized_message: str,
) -> dict:
    """
    Execute a single operation from a multi_op dispatch.

    Handles add_items, remove_item, and update_quantity using minimal logic
    (no guided ordering, no clarification flows, no upsell).  Any other intent
    returns a no-op result.

    Returns a dict with keys: reply (str|None), cart_updated (bool), cart_id (str|None),
    failed (bool), failure_reason (str|None).
    """
    from app.services.http_client import ExpressAPIError
    from app.services.tools import (
        add_item_to_cart,
        fetch_menu_item_detail,
        fetch_menu_items,
        find_menu_item_by_name,
        get_cart,
        remove_item_from_cart,
        update_cart_item_quantity,
    )

    if op_intent == "add_items":
        if not op_items:
            return {"reply": None, "cart_updated": False, "cart_id": cart_id, "failed": False, "failure_reason": None}

        menu_items = await fetch_menu_items()
        successful_names: list[str] = []
        failed_names: list[str] = []
        current_cart_id = cart_id

        for requested_item in op_items:
            item_query = requested_item.get("item_name")
            quantity = int(requested_item.get("quantity") or 1)

            matched_item = await find_menu_item_by_name(menu_items, item_query or "")
            if not matched_item:
                failed_names.append(item_query or "item")
                continue
            if not is_menu_item_available(matched_item):
                failed_names.append(matched_item.get("name") or item_query or "item")
                continue

            menu_item_id = matched_item.get("id") or matched_item.get("_id")
            if menu_item_id is None:
                failed_names.append(item_query or "item")
                continue

            menu_detail = await fetch_menu_item_detail(menu_item_id)
            if menu_detail is None:
                failed_names.append(matched_item.get("name") or item_query or "item")
                continue

            from app.services.item_clarification import apply_smart_defaults
            requested_item, applied_labels, _ = apply_smart_defaults(
                requested_item, menu_detail
            )

            # ── Phase B: menu-aware modifier enrichment ───────────────────────
            _exec_req_groups, _exec_opt_groups = build_guided_order_groups(menu_detail)
            has_guided_groups = bool(_exec_req_groups or _exec_opt_groups)
            # Phase B only runs when:
            # 1. The classification LLM left size AND milk as null (it
            #    didn't extract customizations during classification)
            # 2. The message contains non-trivial modifier language
            #    beyond simple add phrases
            _classification_missed_modifiers = (
                not requested_item.get("size")
                and not (requested_item.get("options") or {}).get("milk")
                and not requested_item.get("addons")
            )
            _STRONG_MODIFIER_SIGNALS = (
                " with ", " without ", "no ", "swap ", "instead ",
                "replace ", "change the ", "oat ", "almond ", "soy ",
                "coconut ", "lactose ", "skim ", "full fat ",
                "granola", "honey", "topping", "spread", "dressing",
                "sauce", "drizzle", "whipped", "decaf", "yirgacheffe",
                "shot ", "extra ", "syrup ",
            )
            _has_modifier_signal = any(
                signal in f" {normalized_message.lower()} "
                for signal in _STRONG_MODIFIER_SIGNALS
            )

            if has_guided_groups and _has_modifier_signal and _classification_missed_modifiers:
                from app.services.llm_interpreter import extract_modifiers_for_item
                try:
                    enriched_modifiers = await extract_modifiers_for_item(
                        message=normalized_message,
                        item_name=matched_item.get("name") or item_query,
                        menu_detail=menu_detail,
                        timeout=8.0,
                    )
                    if enriched_modifiers.get("size") and not requested_item.get("size"):
                        requested_item = dict(requested_item)
                        requested_item["size"] = enriched_modifiers["size"]
                    if enriched_modifiers.get("options"):
                        current_opts = dict(requested_item.get("options") or {})
                        enriched_opts = enriched_modifiers["options"]
                        if enriched_opts.get("milk") and not current_opts.get("milk"):
                            current_opts["milk"] = enriched_opts["milk"]
                        if enriched_opts.get("sugar") and not current_opts.get("sugar"):
                            current_opts["sugar"] = enriched_opts["sugar"]
                        requested_item = dict(requested_item)
                        requested_item["options"] = current_opts
                    if enriched_modifiers.get("addons"):
                        existing_addons = list(requested_item.get("addons") or [])
                        for addon in enriched_modifiers["addons"]:
                            if addon not in existing_addons:
                                existing_addons.append(addon)
                        requested_item = dict(requested_item)
                        requested_item["addons"] = existing_addons
                    if (
                        enriched_modifiers.get("instructions")
                        and not requested_item.get("instructions")
                    ):
                        requested_item = dict(requested_item)
                        requested_item["instructions"] = enriched_modifiers["instructions"]
                except Exception as _enrich_err:
                    logger.warning({
                        "stage": "modifier_enrichment_failed",
                        "item": item_query,
                        "error": str(_enrich_err),
                    })

            selected_options, instructions, _ = map_requested_item_to_selected_options(
                requested_item, menu_detail
            )

            try:
                cart_result = await add_item_to_cart(
                    menu_item_id=menu_item_id,
                    qty=quantity,
                    selected_options=selected_options,
                    instructions=instructions,
                    cart_id=current_cart_id,
                )
                current_cart_id = cart_result["cart_id"]
                item_display_name = matched_item.get("name") or item_query or "item"
                if applied_labels:
                    defaults_text = ", ".join(applied_labels)
                    successful_names.append(f"{item_display_name} ({defaults_text})")
                else:
                    successful_names.append(item_display_name)
            except ExpressAPIError:
                failed_names.append(matched_item.get("name") or item_query or "item")

        if successful_names:
            reply = "Added " + ", ".join(successful_names) + " to your cart."
        elif failed_names:
            reply = "Couldn't add " + ", ".join(failed_names) + "."
        else:
            reply = None

        return {
            "reply": reply,
            "cart_updated": bool(successful_names),
            "cart_id": current_cart_id,
            "failed": bool(failed_names and not successful_names),
            "failure_reason": None,
        }

    if op_intent == "remove_item":
        if not op_items:
            return {"reply": None, "cart_updated": False, "cart_id": cart_id, "failed": False, "failure_reason": None}

        target_item = op_items[0]
        item_query = target_item.get("item_name")
        quantity = target_item.get("quantity")

        if not item_query:
            return {"reply": None, "cart_updated": False, "cart_id": cart_id, "failed": False, "failure_reason": None}

        cart_result = await get_cart(cart_id=cart_id)
        matched_cart_item = await find_menu_item_by_name(cart_result["cart"], item_query)

        if not matched_cart_item:
            return {
                "reply": f"Couldn't find {item_query} in your cart.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "not_found",
            }

        line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
        if line_id is None:
            return {
                "reply": f"Couldn't remove {item_query} right now.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "missing_id",
            }

        current_qty = matched_cart_item.get("qty") or 0
        if quantity and quantity > 0 and current_qty > quantity:
            updated = await update_cart_item_quantity(
                line_id=line_id,
                qty=current_qty - quantity,
                cart_id=cart_result["cart_id"],
            )
            reply = f"Removed {quantity} {matched_cart_item.get('name', item_query)} from your cart."
        else:
            updated = await remove_item_from_cart(
                line_id=line_id,
                cart_id=cart_result["cart_id"],
            )
            reply = f"Removed {matched_cart_item.get('name', item_query)} from your cart."

        return {
            "reply": reply,
            "cart_updated": True,
            "cart_id": updated["cart_id"],
            "failed": False,
            "failure_reason": None,
        }

    if op_intent == "update_quantity":
        if not op_items:
            return {"reply": None, "cart_updated": False, "cart_id": cart_id, "failed": False, "failure_reason": None}

        target_item = op_items[0]
        item_query = target_item.get("item_name")
        quantity = target_item.get("quantity")

        if not item_query or quantity is None or int(quantity) < 1:
            return {"reply": None, "cart_updated": False, "cart_id": cart_id, "failed": False, "failure_reason": None}

        quantity = int(quantity)
        cart_result = await get_cart(cart_id=cart_id)
        matched_cart_item = await find_menu_item_by_name(cart_result["cart"], item_query)

        if not matched_cart_item:
            return {
                "reply": f"Couldn't find {item_query} in your cart.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "not_found",
            }

        line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
        if line_id is None:
            return {
                "reply": f"Couldn't update {item_query} right now.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "missing_id",
            }

        updated = await update_cart_item_quantity(
            line_id=line_id,
            qty=quantity,
            cart_id=cart_result["cart_id"],
        )
        reply = f"Updated {matched_cart_item.get('name', item_query)} to quantity {quantity}."

        return {
            "reply": reply,
            "cart_updated": True,
            "cart_id": updated["cart_id"],
            "failed": False,
            "failure_reason": None,
        }

    if op_intent == "update_item":
        if not op_items:
            return {
                "reply": None,
                "cart_updated": False,
                "cart_id": cart_id,
                "failed": False,
                "failure_reason": None,
            }

        target_item = op_items[0]
        item_query = target_item.get("item_name")

        if not item_query:
            return {
                "reply": None,
                "cart_updated": False,
                "cart_id": cart_id,
                "failed": False,
                "failure_reason": None,
            }

        cart_result = await get_cart(cart_id=cart_id)
        logger.warning({
            "stage": "update_item_debug",
            "item_query": item_query,
            "cart_item_names": [
                i.get("name") for i in cart_result.get("cart", [])
            ],
            "matched": bool(matched_cart_item)
                if 'matched_cart_item' in dir() else "not yet evaluated",
        })
        matched_cart_item = await find_menu_item_by_name(
            cart_result["cart"], item_query
        )
        logger.warning({
            "stage": "update_item_match_result",
            "item_query": item_query,
            "matched_cart_item_name": matched_cart_item.get("name")
                if matched_cart_item else None,
            "matched_cart_item_keys": list(matched_cart_item.keys())
                if matched_cart_item else None,
            "menu_item_id": matched_cart_item.get("menuItemId")
                if matched_cart_item else None,
            "line_id": (
                matched_cart_item.get("lineId")
                or matched_cart_item.get("_id")
            ) if matched_cart_item else None,
        })

        if not matched_cart_item:
            return {
                "reply": f"Couldn't find {item_query} in your cart.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "not_found",
            }

        line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
        if line_id is None:
            return {
                "reply": f"Couldn't update {item_query} right now.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "missing_id",
            }

        menu_item_id = matched_cart_item.get("menuItemId")
        if menu_item_id is None:
            menu_items = await fetch_menu_items()
            matched_menu_item = await find_menu_item_by_name(
                menu_items,
                matched_cart_item.get("name", item_query),
            )
            if matched_menu_item:
                menu_item_id = (
                    matched_menu_item.get("id")
                    or matched_menu_item.get("_id")
                )

        if menu_item_id is None:
            return {
                "reply": f"Couldn't apply those changes to {item_query} right now.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "menu_item_id_missing",
            }

        menu_detail = await fetch_menu_item_detail(menu_item_id)
        current_requested_item = cart_item_to_requested_item(
            matched_cart_item, menu_detail
        )

        removal_instructions = str(
            target_item.get("instructions") or ""
        ).strip().lower()
        removal_tokens: set[str] = set()
        if removal_instructions:
            for fragment in split_instruction_fragments(removal_instructions):
                cleaned = re.sub(
                    r"\b(remove|no|without|take out|strip)\b",
                    "",
                    fragment,
                ).strip()
                if cleaned:
                    removal_tokens.add(normalize_modifier_text(cleaned))

        if removal_tokens:
            current_requested_item["addons"] = [
                addon
                for addon in (current_requested_item.get("addons") or [])
                if normalize_modifier_text(addon) not in removal_tokens
            ]
            for opt_key in ("milk", "sugar"):
                opt_val = (
                    current_requested_item.get("options") or {}
                ).get(opt_key)
                if opt_val and normalize_modifier_text(opt_val) in removal_tokens:
                    current_requested_item["options"][opt_key] = None

        merged_item = merge_requested_item_customizations(
            current_requested_item, target_item, menu_detail
        )
        selected_options, instructions, _unmatched = (
            map_requested_item_to_selected_options(merged_item, menu_detail)
        )

        current_qty = int(matched_cart_item.get("qty") or 1)

        try:
            removed = await remove_item_from_cart(
                line_id=line_id,
                cart_id=cart_result["cart_id"],
            )
            updated = await add_item_to_cart(
                menu_item_id=menu_item_id,
                qty=current_qty,
                selected_options=selected_options,
                instructions=instructions,
                cart_id=removed["cart_id"],
            )
        except ExpressAPIError:
            return {
                "reply": f"Couldn't update {item_query} right now.",
                "cart_updated": False,
                "cart_id": cart_result["cart_id"],
                "failed": True,
                "failure_reason": "api_error",
            }

        new_parts = build_customization_instruction_parts(merged_item)
        if new_parts:
            reply = (
                f"Updated {matched_cart_item.get('name', item_query)} "
                f"— now: {', '.join(new_parts)}."
            )
        else:
            reply = f"Updated {matched_cart_item.get('name', item_query)}."

        return {
            "reply": reply,
            "cart_updated": True,
            "cart_id": updated["cart_id"],
            "failed": False,
            "failure_reason": None,
        }

    # Any other intent in a multi_op context is a no-op
    return {"reply": None, "cart_updated": False, "cart_id": cart_id, "failed": False, "failure_reason": None}


async def _drain_pending_operations(
    session_id: str,
    cart_id: str | None,
    session,
    auth_cookie: str | None,
    normalized_message: str,
    accumulated_replies: list[str],
) -> "ChatMessageResponse | None":
    """
    Drains the pending_operations queue after a guided order completes.

    Executes immediate ops (remove, update, clear) right away.
    If the next op needs guided ordering, starts that flow and returns
    the guided ordering prompt — remaining ops stay in the queue.
    For view_cart and checkout, delegates to a minimal inline handler.

    Returns a ChatMessageResponse if the drain produces a reply,
    or None if the queue was empty.

    accumulated_replies contains reply parts already collected this turn
    (e.g. the "Added Latte (Medium)" confirmation from the just-completed
    guided order). New replies are appended and joined into the final reply.
    """
    from app.services.tools import (
        add_item_to_cart,
        fetch_menu_item_detail,
        fetch_menu_items,
        find_menu_item_by_name,
        get_cart,
        remove_item_from_cart,
        update_cart_item_quantity,
    )
    from app.services.item_clarification import apply_smart_defaults

    ops = get_pending_operations(session_id)
    if not ops:
        return None

    while ops:
        op = ops[0]
        op_intent = op.get("intent")
        op_items = op.get("items") or []

        # Immediate ops — execute and continue draining
        if op_intent in {"remove_item", "update_quantity", "clear_cart"}:
            ops.pop(0)
            set_pending_operations(session_id, ops)
            op_result = await _execute_single_op(
                op_intent=op_intent,
                op_items=op_items,
                session_id=session_id,
                cart_id=cart_id,
                session=session,
                auth_cookie=auth_cookie,
                normalized_message=normalized_message,
            )
            if op_result.get("cart_id"):
                cart_id = op_result["cart_id"]
            if op_result.get("reply"):
                accumulated_replies.append(op_result["reply"])
            continue

        # add_items — check if guided ordering needed
        if op_intent == "add_items":
            if not op_items:
                ops.pop(0)
                set_pending_operations(session_id, ops)
                continue

            requested_item = op_items[0]
            item_query = requested_item.get("item_name") or ""
            menu_items = await fetch_menu_items()
            matched_item = await find_menu_item_by_name(menu_items, item_query)

            if not matched_item or not is_menu_item_available(matched_item):
                # Can't add — record failure, continue drain
                failure_reason = "not_found" if not matched_item else "out_of_stock"
                accumulated_replies.append(
                    _build_op_failure_reply(item_query, failure_reason)
                )
                ops.pop(0)
                set_pending_operations(session_id, ops)
                continue

            menu_item_id = matched_item.get("id") or matched_item.get("_id")
            if menu_item_id is None:
                accumulated_replies.append(
                    _build_op_failure_reply(item_query, "missing_id")
                )
                ops.pop(0)
                set_pending_operations(session_id, ops)
                continue

            menu_detail = await fetch_menu_item_detail(menu_item_id)
            if menu_detail is None:
                accumulated_replies.append(
                    _build_op_failure_reply(item_query, "missing_id")
                )
                ops.pop(0)
                set_pending_operations(session_id, ops)
                continue

            has_customization = requested_item_has_customization(requested_item)
            required_groups, optional_groups = build_guided_order_groups(menu_detail)
            has_guided_groups = bool(required_groups or optional_groups)
            should_guide = not has_customization and has_guided_groups

            if should_guide:
                # Pop this op from queue — guided ordering will finalize it
                ops.pop(0)
                set_pending_operations(session_id, ops)

                # Set up guided ordering session exactly like the single-op path
                quantity = int(requested_item.get("quantity") or 1)
                set_guided_order_item_id(session_id, menu_item_id)
                set_guided_order_item_name(session_id, matched_item.get("name"))
                set_guided_order_quantity(session_id, quantity)
                set_guided_order_required_groups(session_id, required_groups)
                set_guided_order_optional_groups(session_id, optional_groups)
                set_guided_order_selections(session_id, {})
                set_session_stage(session_id, "guided_ordering")
                set_guided_order_step(session_id, 0)

                if required_groups:
                    set_guided_order_phase(session_id, 1)
                    set_guided_order_groups(session_id, required_groups)
                    first_group = required_groups[0]
                    guided_reply = build_guided_order_prompt(
                        matched_item.get("name", "your item"),
                        first_group,
                        include_item_name=True,
                        allow_skip=False,
                    )
                    current_group = first_group.get("name")
                elif len(optional_groups) == 1:
                    set_guided_order_phase(session_id, 3)
                    set_guided_order_groups(session_id, optional_groups)
                    first_group = optional_groups[0]
                    guided_reply = build_guided_order_prompt(
                        matched_item.get("name", "your item"),
                        first_group,
                        include_item_name=True,
                        allow_skip=True,
                    )
                    current_group = first_group.get("name")
                else:
                    set_guided_order_phase(session_id, 2)
                    set_guided_order_groups(session_id, optional_groups)
                    guided_reply = build_optional_review_prompt(
                        matched_item.get("name", "your item"),
                        {},
                        optional_groups,
                    )
                    current_group = None

                # Prepend any accumulated replies so the user sees the full
                # context of what happened before the guided ordering prompt
                if accumulated_replies:
                    full_reply = " ".join(accumulated_replies) + " " + guided_reply
                else:
                    full_reply = guided_reply

                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=full_reply,
                    intent="guided_order_response",
                    cart_updated=bool(accumulated_replies),
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "guided_ordering_start_from_queue",
                        "current_group": current_group,
                        "guided_order_item_id": menu_item_id,
                        "guided_order_item_name": matched_item.get("name"),
                        "pending_ops_remaining": len(ops),
                    },
                )
            else:
                # No guided ordering needed — apply smart defaults and add
                requested_item, applied_labels, _ = apply_smart_defaults(
                    requested_item, menu_detail
                )
                selected_options, instructions, _ = map_requested_item_to_selected_options(
                    requested_item, menu_detail
                )
                quantity = int(requested_item.get("quantity") or 1)
                try:
                    cart_result = await add_item_to_cart(
                        menu_item_id=menu_item_id,
                        qty=quantity,
                        selected_options=selected_options,
                        instructions=instructions,
                        cart_id=cart_id,
                    )
                    cart_id = cart_result["cart_id"]
                    item_display = matched_item.get("name") or item_query
                    if applied_labels:
                        accumulated_replies.append(
                            f"Added {item_display} "
                            f"({', '.join(applied_labels)}) to your cart."
                        )
                    else:
                        accumulated_replies.append(
                            f"Added {item_display} to your cart."
                        )
                except Exception:
                    accumulated_replies.append(
                        _build_op_failure_reply(item_query, "api_error")
                    )
                ops.pop(0)
                set_pending_operations(session_id, ops)
                continue

        # view_cart — execute inline
        if op_intent == "view_cart":
            ops.pop(0)
            set_pending_operations(session_id, ops)
            try:
                cart_result = await get_cart(cart_id=cart_id)
                summary = build_cart_summary(cart_result["cart"])
                cart_id = cart_result["cart_id"]
                if summary:
                    accumulated_replies.append(
                        f"Here's your cart:\n{summary}"
                    )
                else:
                    accumulated_replies.append("Your cart is empty.")
            except Exception:
                accumulated_replies.append(
                    "I couldn't load your cart right now."
                )
            continue

        # checkout / confirm_checkout — always last
        if op_intent in {"checkout", "confirm_checkout"}:
            ops.pop(0)
            set_pending_operations(session_id, ops)

            try:
                cart_result = await get_cart(cart_id=cart_id)
            except Exception:
                accumulated_replies.append(
                    "I couldn't reach checkout right now."
                )
                break

            if not cart_result["cart"]:
                accumulated_replies.append(
                    "Your cart is empty — nothing to checkout."
                )
                break

            # If any previous op failed, warn before proceeding
            has_prior_failure = any(
                "out of stock" in r or "couldn't" in r.lower()
                for r in accumulated_replies
            )
            if has_prior_failure:
                cart_summary = build_cart_summary(cart_result["cart"])
                accumulated_replies.append(
                    f"Your cart has: {cart_summary}. "
                    f"Still want to checkout?"
                )
                set_session_stage(session_id, "checkout_summary")
                # Store pending checkout confirmation in session
                set_pending_operations_context(session_id, {
                    "awaiting_checkout_confirmation": True,
                    "reply_parts": accumulated_replies,
                })
                break
            else:
                _build_bill(cart_result["cart"])
                set_session_stage(session_id, "checkout_summary")
                accumulated_replies.append(
                    "Ready to checkout? Here's your order summary."
                )
                break

        # Unknown intent in queue — skip
        ops.pop(0)
        set_pending_operations(session_id, ops)

    # Queue fully drained or paused for guided ordering
    if not ops:
        clear_pending_operations(session_id)

    if accumulated_replies:
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=" ".join(accumulated_replies),
            intent="multi_op",
            cart_updated=True,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "pending_ops_drained",
            },
        )
    return None


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
        observe_combo,
        remove_from_cart,
        clear_cart,
        fetch_my_orders,
        fetch_featured_items,
        fetch_menu_item_detail,
        fetch_menu_items,
        fetch_my_orders,
        find_menu_item_by_name,
        get_cart,
        remove_item_from_cart,
        update_cart_item_quantity,
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
        apply_smart_defaults,
        build_customization_prompt,
        build_customization_suggestions,
        build_defaults_confirmation_prompt,
        build_defaults_confirmation_suggestions,
        build_menu_choice_prompt,
        build_menu_choice_suggestions,
        collect_missing_variant_groups,
        find_ambiguous_menu_matches,
        _is_frozen_yogurt,
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
        if pending_ops:
            # Build natural language description of remaining ops
            op_descriptions: list[str] = []
            for pending_op in pending_ops:
                pending_intent = pending_op.get("intent")
                pending_items = pending_op.get("items") or []
                if pending_intent == "add_items" and pending_items:
                    names = [
                        item.get("item_name") or "item"
                        for item in pending_items
                        if isinstance(item, dict)
                    ]
                    for name in names:
                        op_descriptions.append(f"add a {name}")
                elif pending_intent == "remove_item" and pending_items:
                    name = pending_items[0].get("item_name") or "item"
                    op_descriptions.append(f"remove the {name}")
                elif pending_intent == "update_quantity" and pending_items:
                    name = pending_items[0].get("item_name") or "item"
                    qty = pending_items[0].get("quantity")
                    op_descriptions.append(
                        f"update {name} to {qty}" if qty else f"update {name}"
                    )
                elif pending_intent == "view_cart":
                    op_descriptions.append("view your cart")
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

    if not _skip_resolve and current_stage == "guided_ordering" and normalized_phrase in GUIDED_DEFAULT_ALL_WORDS:
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
            clear_guided_order_session(session_id)
            set_session_stage(session_id, None)
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
                        suggestions=[],
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

        # Recovery path: if session stage says we're customizing but pending_clarification was lost
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

        if intent == "multi_op":
            operations = resolved.get("operations") or []
            operations = _sort_operations_by_priority(operations)

            collected_replies: list[str] = []
            cart_updated = False
            queued_ops: list[dict] = []
            reached_guided = False

            for op in operations:
                op_intent = op.get("intent")
                op_items = op.get("items") or []

                # Once we hit an add that needs guided ordering, queue
                # everything from this point forward
                if reached_guided:
                    queued_ops.append(op)
                    continue

                # Immediate ops — always execute inline
                if op_intent in {"remove_item", "update_quantity", "clear_cart"}:
                    op_result = await _execute_single_op(
                        op_intent=op_intent,
                        op_items=op_items,
                        session_id=session_id,
                        cart_id=cart_id,
                        session=session,
                        auth_cookie=auth_cookie,
                        normalized_message=normalized_message,
                    )
                    if op_result.get("reply"):
                        collected_replies.append(op_result["reply"])
                    if op_result.get("cart_updated"):
                        cart_updated = True
                    if op_result.get("cart_id"):
                        cart_id = op_result["cart_id"]
                    continue

                # add_items — check if guided ordering needed
                if op_intent == "add_items":
                    if not op_items:
                        continue

                    requested_item = op_items[0]
                    item_query = requested_item.get("item_name") or ""
                    menu_items_check = await fetch_menu_items()
                    matched_check = await find_menu_item_by_name(
                        menu_items_check, item_query
                    )

                    if matched_check and is_menu_item_available(matched_check):
                        menu_item_id_check = (
                            matched_check.get("id") or matched_check.get("_id")
                        )
                        menu_detail_check = (
                            await fetch_menu_item_detail(menu_item_id_check)
                            if menu_item_id_check
                            else None
                        )
                        if menu_detail_check:
                            has_cust = requested_item_has_customization(
                                requested_item
                            )
                            req_grps, opt_grps = build_guided_order_groups(
                                menu_detail_check
                            )
                            needs_guided = (
                                not has_cust and bool(req_grps or opt_grps)
                            )
                            if needs_guided:
                                # Queue this op and everything after it
                                queued_ops.append(op)
                                reached_guided = True
                                continue

                    # No guided ordering needed — execute immediately
                    op_result = await _execute_single_op(
                        op_intent=op_intent,
                        op_items=op_items,
                        session_id=session_id,
                        cart_id=cart_id,
                        session=session,
                        auth_cookie=auth_cookie,
                        normalized_message=normalized_message,
                    )
                    if op_result.get("reply"):
                        collected_replies.append(op_result["reply"])
                    if op_result.get("cart_updated"):
                        cart_updated = True
                    if op_result.get("cart_id"):
                        cart_id = op_result["cart_id"]
                    continue

                # view_cart and checkout — always queue behind adds
                queued_ops.append(op)

            # If we have queued ops, store them and start draining
            if queued_ops:
                set_pending_operations(session_id, queued_ops)
                set_pending_operations_context(session_id, {
                    "original_message": normalized_message,
                    "reply_parts": list(collected_replies),
                })
                drain_response = await _drain_pending_operations(
                    session_id=session_id,
                    cart_id=cart_id,
                    session=session,
                    auth_cookie=auth_cookie,
                    normalized_message=normalized_message,
                    accumulated_replies=collected_replies,
                )
                if drain_response:
                    return drain_response

            # No queued ops — all executed inline
            final_reply = (
                " ".join(collected_replies)
                if collected_replies
                else "I couldn't process that request. Could you try again?"
            )
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=final_reply,
                intent="multi_op",
                cart_updated=cart_updated,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "multi_op_execution",
                    "op_count": len(operations),
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

                drain_response = await _drain_pending_operations(
                    session_id=session_id,
                    cart_id=cart_id,
                    session=session,
                    auth_cookie=auth_cookie,
                    normalized_message=normalized_message,
                    accumulated_replies=accumulated,
                )
                if drain_response:
                    return drain_response

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
            item_id = get_guided_order_item_id(session_id)
            item_name = get_guided_order_item_name(session_id)
            selections = get_guided_order_selections(session_id)
            quantity = get_guided_order_quantity(session_id)
            phase = get_guided_order_phase(session_id)
            step = get_guided_order_step(session_id)
            required_groups = get_guided_order_required_groups(session_id)
            optional_groups = get_guided_order_optional_groups(session_id)

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

            current_response = normalized_message
            if phase == 1:
                if not required_groups:
                    phase = 3 if len(optional_groups) == 1 else (2 if optional_groups else 4)
                    set_guided_order_phase(session_id, phase)
                    set_guided_order_step(session_id, 0)
                    set_guided_order_groups(session_id, optional_groups if optional_groups else [])
                elif step >= len(required_groups):
                    if optional_groups:
                        set_guided_order_phase(session_id, 2)
                        set_guided_order_groups(session_id, optional_groups)
                        set_guided_order_step(session_id, 0)
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_optional_review_prompt(item_name, selections, optional_groups),
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

                    set_guided_order_phase(session_id, 4)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_guided_instructions_prompt(item_name),
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
                else:
                    current_group = required_groups[step]
                    if current_response in GUIDED_SKIP_WORDS or current_response == "no thanks":
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=(
                                f"This one is required - please choose from: "
                                f"{_build_group_options_text(current_group)}."
                            ),
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "current_group": current_group.get("name"),
                                "pipeline_stage": "guided_ordering_required_clarify",
                            },
                        )

                    matched_names = _match_option_names_for_group(current_group, current_response)
                    if not matched_names:
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=(
                                f"I didn't catch that. For {(current_group.get('name') or 'this option').lower()}, "
                                f"you can choose: {_build_group_options_text(current_group)}."
                            ),
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "current_group": current_group.get("name"),
                                "pipeline_stage": "guided_ordering_clarify",
                            },
                        )

                    _set_group_selection(selections, current_group, matched_names, replace=True)
                    set_guided_order_selections(session_id, selections)
                    next_step = step + 1

                    if next_step >= len(required_groups):
                        if optional_groups:
                            set_guided_order_phase(session_id, 2)
                            set_guided_order_groups(session_id, optional_groups)
                            set_guided_order_step(session_id, 0)
                            return ChatMessageResponse(
                                session_id=session_id,
                                status="ok",
                                reply=build_optional_review_prompt(item_name, selections, optional_groups),
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

                        set_guided_order_phase(session_id, 4)
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=build_guided_instructions_prompt(item_name),
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

                    set_guided_order_step(session_id, next_step)
                    set_guided_order_groups(session_id, required_groups)
                    next_group = required_groups[next_step]
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_guided_order_prompt(
                            item_name,
                            next_group,
                            include_item_name=False,
                            allow_skip=False,
                        ),
                        intent=intent,
                        cart_updated=False,
                        cart_id=cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "guided_order_item_id": item_id,
                            "guided_order_item_name": item_name,
                            "current_group": next_group.get("name"),
                            "pipeline_stage": "guided_ordering_continue",
                        },
                    )

            if phase == 2:
                if current_response in GUIDED_DONE_WORDS:
                    set_guided_order_phase(session_id, 4)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_guided_instructions_prompt(item_name),
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

                phase = 3
                set_guided_order_phase(session_id, 3)
                set_guided_order_groups(session_id, optional_groups)

            if phase == 3:
                if not optional_groups:
                    set_guided_order_phase(session_id, 4)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_guided_instructions_prompt(item_name),
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

                heuristic_result = _phase3_heuristic(
                    normalized_message,
                    optional_groups,
                    selections,
                )
                if heuristic_result is not None:
                    interpretation = heuristic_result
                else:
                    interpretation = await _interpret_phase3_response(
                        user_message=normalized_message,
                        item_name=item_name,
                        optional_groups=optional_groups,
                        current_selections=selections,
                    )
                action = interpretation.get("action")

                if action == "finalize_after_select":
                    # Apply the selection then immediately finalize
                    raw_selections = [
                        str(s).strip()
                        for s in (interpretation.get("selections") or [])
                        if str(s).strip()
                    ]
                    if raw_selections:
                        target_group = _find_guided_group(
                            optional_groups, interpretation.get("group_name")
                        )
                        if target_group:
                            valid_names = []
                            for sel in raw_selections:
                                g, canon = _find_group_for_option_name(
                                    [target_group], sel
                                )
                                if g and canon:
                                    valid_names.append(canon)
                            if valid_names:
                                _set_group_selection(
                                    selections, target_group, valid_names, replace=True
                                )
                                set_guided_order_selections(session_id, selections)
                    # Now finalize — move to instructions phase
                    set_guided_order_phase(session_id, 4)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_guided_instructions_prompt(item_name),
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

                if action == "finalize":
                    set_guided_order_phase(session_id, 4)
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply=build_guided_instructions_prompt(item_name),
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

                if action == "query_options":
                    target_group = _find_guided_group(optional_groups, interpretation.get("group_name"))
                    if target_group:
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=f"For {target_group.get('name', 'that option').lower()}: {_build_group_options_text(target_group)}.",
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "guided_ordering_phase3_query",
                            },
                        )
                    if interpretation.get("reply_hint"):
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=str(interpretation.get("reply_hint")),
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "guided_ordering_phase3_query",
                            },
                        )

                if action == "query_max":
                    target_group = _find_guided_group(optional_groups, interpretation.get("group_name"))
                    if target_group:
                        max_selections = _group_max_selections(target_group)
                        if max_selections and max_selections > 1:
                            reply_text = f"You can add up to {max_selections} {target_group.get('name', 'items').lower()}."
                        elif max_selections == 1:
                            reply_text = f"You can choose 1 {target_group.get('name', 'item').lower()}."
                        else:
                            reply_text = f"You can add multiple {target_group.get('name', 'items').lower()}."

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
                                "pipeline_stage": "guided_ordering_phase3_query",
                            },
                        )
                    if interpretation.get("reply_hint"):
                        return ChatMessageResponse(
                            session_id=session_id,
                            status="ok",
                            reply=str(interpretation.get("reply_hint")),
                            intent=intent,
                            cart_updated=False,
                            cart_id=cart_id,
                            defaults_used=[],
                            suggestions=[],
                            metadata={
                                "normalized_message": normalized_message,
                                "pipeline_stage": "guided_ordering_phase3_query",
                            },
                        )

                if action in {"select", "change"}:
                    raw_selections = [
                        str(selection).strip()
                        for selection in (interpretation.get("selections") or [])
                        if str(selection).strip()
                    ]
                    matched_display: list[str] = []
                    target_group = _find_guided_group(optional_groups, interpretation.get("group_name"))

                    if target_group:
                        valid_names = []
                        for selection_name in raw_selections:
                            group_match, canonical_name = _find_group_for_option_name([target_group], selection_name)
                            if group_match and canonical_name:
                                valid_names.append(canonical_name)

                        if valid_names:
                            matched_display.extend(
                                _set_group_selection(
                                    selections,
                                    target_group,
                                    valid_names,
                                    replace=(action == "change"),
                                )
                            )
                    else:
                        for selection_name in raw_selections:
                            group_match, canonical_name = _find_group_for_option_name(optional_groups, selection_name)
                            if group_match and canonical_name:
                                matched_display.extend(
                                    _set_group_selection(
                                        selections,
                                        group_match,
                                        [canonical_name],
                                        replace=(action == "change"),
                                    )
                                )

                    # If no match in optional_groups, check required_groups
                    # This handles mid-flow changes to already-answered required
                    # options (e.g. "actually make it medium" after choosing small)
                    if not matched_display:
                        for selection_name in raw_selections:
                            req_group_match, req_canonical = _find_group_for_option_name(
                                required_groups, selection_name
                            )
                            if req_group_match and req_canonical:
                                matched_display.extend(
                                    _set_group_selection(
                                        selections,
                                        req_group_match,
                                        [req_canonical],
                                        replace=True,
                                    )
                                )

                    # Also handle size changes passed via the size field directly
                    # (LLM puts size in item.size, not in selections list)
                    size_value = None
                    for item in (resolved.get("items") or []):
                        if isinstance(item, dict) and item.get("size"):
                            size_value = item.get("size")
                            break
                    if size_value:
                        size_group = _find_guided_group(
                            required_groups, "size"
                        )
                        if size_group:
                            matched_names = _match_option_names_for_group(
                                size_group, size_value
                            )
                            if matched_names:
                                _set_group_selection(
                                    selections, size_group, matched_names, replace=True
                                )
                                set_guided_order_selections(session_id, selections)

                    if matched_display:
                        set_guided_order_selections(session_id, selections)
                        matched_text = ", ".join(matched_display)
                        if not required_groups and len(optional_groups) == 1:
                            set_guided_order_phase(session_id, 4)
                            return ChatMessageResponse(
                                session_id=session_id,
                                status="ok",
                                reply=build_guided_instructions_prompt(item_name),
                                intent=intent,
                                cart_updated=False,
                                cart_id=cart_id,
                                defaults_used=[],
                                suggestions=[],
                                metadata={
                                    "normalized_message": normalized_message,
                                    "pipeline_stage": "guided_ordering_instructions",
                                    "selections_added": matched_display,
                                },
                            )
                        reply_text = (
                            f"Updated {matched_text}. Anything else to customize, or say 'done' to add to cart."
                            if action == "change"
                            else f"Added {matched_text}! Anything else to customize, or say 'done' to add to cart."
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
                                "pipeline_stage": "guided_ordering_phase3_select",
                                "selections_added": matched_display,
                            },
                        )

                    # Handle structured fields from LLM item dict (size, milk)
                    # that bypass the selections list
                    guided_items = resolved.get("items") or []
                    for guided_item in guided_items:
                        if not isinstance(guided_item, dict):
                            continue

                        # Size change
                        size_val = guided_item.get("size")
                        if size_val:
                            size_group = _find_guided_group(required_groups, "size")
                            if size_group:
                                matched = _match_option_names_for_group(size_group, size_val)
                                if matched:
                                    _set_group_selection(
                                        selections, size_group, matched, replace=True
                                    )
                                    matched_display.extend(matched)

                        # Milk change
                        milk_val = (guided_item.get("options") or {}).get("milk")
                        if milk_val:
                            milk_group = _find_guided_group(
                                required_groups + optional_groups, "milk"
                            )
                            if milk_group:
                                matched = _match_option_names_for_group(milk_group, milk_val)
                                if matched:
                                    _set_group_selection(
                                        selections, milk_group, matched, replace=True
                                    )
                                    matched_display.extend(matched)

                    if matched_display:
                        set_guided_order_selections(session_id, selections)

                optional_group_names = ", ".join(
                    group.get("name", "")
                    for group in optional_groups
                    if group.get("name")
                )
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=(
                        f"I can help you customize: {optional_group_names}. "
                        f"Say 'done' when you're ready to add to cart."
                    ),
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "guided_ordering_phase3_unclear",
                    },
                )

            instructions_text = "" if current_response in GUIDED_SKIP_WORDS or current_response == "no thanks" else normalized_message
            return await _finalize_guided_order(
                session_id,
                cart_id,
                normalized_message,
                add_item_to_cart=add_item_to_cart,
                instructions_text=instructions_text,
                pipeline_stage="guided_ordering_done",
                intent=intent,
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

            update_last_action(session_id, normalized_message, "Your cart is now empty.", intent, action_data={"cleared": True})

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

        if intent == "repeat_last_order":
            completed_order_items: list[dict] = []

            recent_orders = await fetch_my_orders(auth_cookie=auth_cookie, limit=20)
            if recent_orders:
                for order in recent_orders:
                    if not isinstance(order, dict):
                        continue
                    if str(order.get("status") or "").strip().lower() == "cancelled":
                        continue
                    order_items = order.get("items")
                    if not isinstance(order_items, list) or not order_items:
                        continue

                    normalized_lines: list[dict] = []
                    for line in order_items:
                        if not isinstance(line, dict):
                            continue
                        menu_item_id = line.get("menuItemId")
                        qty = int(line.get("qty") or 1)
                        if menu_item_id is None or qty < 1:
                            continue
                        normalized_lines.append(
                            {
                                "menuItemId": menu_item_id,
                                "qty": qty,
                                "selectedOptions": line.get("selectedOptions") if isinstance(line.get("selectedOptions"), list) else [],
                                "instructions": str(line.get("instructions") or ""),
                                "name": str(line.get("name") or "").strip(),
                            }
                        )

                    if normalized_lines:
                        completed_order_items = normalized_lines
                        break

            if not completed_order_items and session is not None:
                snapshot = session.get("last_checked_out_items")
                if isinstance(snapshot, list):
                    completed_order_items = [item for item in snapshot if isinstance(item, dict)]

            cart_result = await get_cart(cart_id=cart_id)
            if not completed_order_items:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I couldn't find a past checked-out order for your account yet.If you are not logged in please do so I can complete your request.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "repeat_last_order_missing_snapshot",
                        "used_order_history": bool(recent_orders),
                    },
                )

            current_cart_id = cart_result["cart_id"]
            updated_cart = cart_result.get("cart", [])
            repeated_lines = 0
            failed_lines: list[str] = []

            for item in completed_order_items:
                menu_item_id = item.get("menuItemId")
                qty = int(item.get("qty") or 1)
                if menu_item_id is None or qty < 1:
                    failed_lines.append(str(item.get("name") or "item"))
                    continue

                selected_options = item.get("selectedOptions") if isinstance(item.get("selectedOptions"), list) else []
                instructions = str(item.get("instructions") or "")

                try:
                    add_result = await add_item_to_cart(
                        menu_item_id=menu_item_id,
                        qty=qty,
                        selected_options=selected_options,
                        instructions=instructions,
                        cart_id=current_cart_id,
                    )
                    current_cart_id = add_result["cart_id"]
                    updated_cart = add_result.get("cart", updated_cart)
                    repeated_lines += 1
                except ExpressAPIError:
                    failed_lines.append(str(item.get("name") or "item"))

            if repeated_lines == 0:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I couldn't repeat your last order right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=current_cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "repeat_last_order_failed",
                        "failed_lines": failed_lines,
                    },
                )

            cart_summary = build_cart_summary(updated_cart)
            reply_text = "Done, I repeated your last order."
            if failed_lines:
                reply_text += "\n\nI couldn't repeat: " + ", ".join(failed_lines)
            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

            if session is not None:
                session["last_intent"] = intent
                session["cart_id"] = current_cart_id
                set_session_stage(session_id, None)

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=True,
                cart_id=current_cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "repeat_last_order_done",
                    "repeated_lines": repeated_lines,
                    "failed_lines": failed_lines,
                    "cart": updated_cart,
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
                reply_text += "\n\nAsk me about any category and I'll show you what's available!"
            else:
                reply_text = "We have a wide selection of food and drinks. What are you in the mood for?"

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
            category_query = ((resolved.get("items") or [{}])[0].get("category") or "").strip().lower()
            menu_items = await fetch_menu_items()

            matched = []
            for item in menu_items:
                if not item.get("isAvailable", True):
                    continue
                cat = item.get("category")
                cat_name = (cat.get("name") if isinstance(cat, dict) else str(cat or "")).lower()
                if category_query and (category_query in cat_name or cat_name in category_query):
                    matched.append(item)

            if matched:
                cat_label = (
                    (matched[0].get("category") or {}).get("name", category_query)
                    if isinstance(matched[0].get("category"), dict)
                    else category_query
                )
                lines = [
                    f"- {item['name']}  ({_fmt_price(item.get('basePrice'))})"
                    for item in matched[:12]
                ]
                reply_text = f"Here's what we have in {cat_label}:\n" + "\n".join(lines)
                if len(matched) > 12:
                    reply_text += f"\n...and {len(matched) - 12} more. What catches your eye?"
                else:
                    reply_text += "\n\nWant to add something?"
                suggestions = [{"item_name": item["name"]} for item in matched[:4]]
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
            cart_result = await get_cart(cart_id=cart_id)
            # Items are already resolved by the pipeline (follow-up refs expanded,
            # quantities normalised). No further extraction or session resolution needed.
            requested_items = resolved["items"]

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
                current_requested_item = cart_item_to_requested_item(matched_cart_item, menu_detail)
                merged_requested_item = merge_requested_item_customizations(current_requested_item, target_item, menu_detail)
                selected_options, instructions, _ = map_requested_item_to_selected_options(merged_requested_item, menu_detail)
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
                reply_text = f"✅ Updated {matched_cart_item.get('name', item_query)} with your new customization."
                if cart_summary:
                    reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

                update_last_action(session_id, normalized_message, reply_text, "update_item", matched_items=[target_item], action_data={"item": item_query, "quantity": current_qty})
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
            reply_text = f"✅ Updated {matched_cart_item.get('name', item_query)} to quantity {quantity}."

            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

            update_last_action(session_id, normalized_message, reply_text, intent, matched_items=[target_item], action_data={"item": item_query, "quantity": quantity})
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

        if intent == "update_item":
            cart_result = await get_cart(cart_id=cart_id)
            requested_items = resolved["items"]

            if not requested_items:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please tell me which item you'd like to update.",
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

            target_item = requested_items[0]
            item_query = target_item.get("item_name")

            if not item_query:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please tell me which item you'd like to update.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "update_item_missing_name",
                    },
                )

            matched_cart_item = await find_menu_item_by_name(
                cart_result["cart"], item_query
            )
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
                        "pipeline_stage": "cart_item_not_found",
                    },
                )

            line_id = (
                matched_cart_item.get("lineId")
                or matched_cart_item.get("_id")
            )
            if line_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply=f"I found {item_query} but couldn't update it right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "cart_line_id_missing",
                    },
                )

            menu_item_id = matched_cart_item.get("menuItemId")
            if menu_item_id is None:
                menu_items = await fetch_menu_items()
                matched_menu_item = await find_menu_item_by_name(
                    menu_items,
                    matched_cart_item.get("name", item_query),
                )
                if matched_menu_item:
                    menu_item_id = (
                        matched_menu_item.get("id")
                        or matched_menu_item.get("_id")
                    )

            if menu_item_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply=f"I couldn't apply those changes to {item_query} right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "menu_item_id_missing",
                    },
                )

            menu_detail = await fetch_menu_item_detail(menu_item_id)

            # Convert current cart item to requested_item shape
            current_requested_item = cart_item_to_requested_item(
                matched_cart_item, menu_detail
            )

            # Build removal set from instructions field
            # e.g. "remove the skim milk" → strip any option matching "skim milk"
            removal_instructions = str(
                target_item.get("instructions") or ""
            ).strip().lower()
            removal_tokens = set()
            if removal_instructions:
                for fragment in split_instruction_fragments(removal_instructions):
                    cleaned = re.sub(
                        r"\b(remove|no|without|take out|strip)\b",
                        "",
                        fragment,
                    ).strip()
                    if cleaned:
                        removal_tokens.add(normalize_modifier_text(cleaned))

            # Strip removed options from current item before merge
            if removal_tokens:
                current_requested_item["addons"] = [
                    addon
                    for addon in (current_requested_item.get("addons") or [])
                    if normalize_modifier_text(addon) not in removal_tokens
                ]
                for opt_key in ("milk", "sugar"):
                    opt_val = (
                        current_requested_item.get("options") or {}
                    ).get(opt_key)
                    if opt_val and normalize_modifier_text(opt_val) in removal_tokens:
                        current_requested_item["options"][opt_key] = None

            # Merge the requested changes over the (possibly stripped)
            # current item. Null fields in target_item mean keep existing.
            merged_item = merge_requested_item_customizations(
                current_requested_item, target_item, menu_detail
            )

            # Map merged item to selected_options for the API call
            selected_options, instructions, unmatched = (
                map_requested_item_to_selected_options(merged_item, menu_detail)
            )

            current_qty = int(matched_cart_item.get("qty") or 1)

            # Remove old line then re-add with updated options
            try:
                removed = await remove_item_from_cart(
                    line_id=line_id,
                    cart_id=cart_result["cart_id"],
                )
                updated_cart_result = await add_item_to_cart(
                    menu_item_id=menu_item_id,
                    qty=current_qty,
                    selected_options=selected_options,
                    instructions=instructions,
                    cart_id=removed["cart_id"],
                )
            except ExpressAPIError as update_err:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply=f"I couldn't update {item_query} right now. Please try again.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "error": str(update_err),
                        "pipeline_stage": "update_item_api_error",
                    },
                )

            set_session_stage(session_id, None)
            cart_summary = build_cart_summary(updated_cart_result["cart"])

            # Build a human-readable description of what changed
            new_parts = build_customization_instruction_parts(merged_item)
            if new_parts:
                changes_text = ", ".join(new_parts)
                reply_text = (
                    f"Updated {matched_cart_item.get('name', item_query)} "
                    f"— now: {changes_text}."
                )
            else:
                reply_text = (
                    f"Updated {matched_cart_item.get('name', item_query)}."
                )

            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

            update_last_action(
                session_id,
                normalized_message,
                reply_text,
                intent,
                matched_items=[target_item],
                action_data={
                    "item": item_query,
                    "merged_item": merged_item,
                },
            )

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
                    "merged_item": merged_item,
                    "cart": updated_cart_result["cart"],
                    "unmatched_modifier_suggestions": unmatched,
                    "pipeline_stage": "update_item_done",
                },
            )

        if intent == "remove_item":
            cart_result = await get_cart(cart_id=cart_id)
            requested_items = resolved["items"]

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

            update_last_action(session_id, normalized_message, reply_text, intent, matched_items=[target_item], action_data={"item": item_query, "quantity_removed": quantity or current_qty})
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
            # Items are fully resolved by the pipeline: follow-up refs expanded,
            # quantities defaulted, mixed-intent filtered out before we reach here.
            requested_items = resolved["items"]

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

            from_clarification = bool(resolved.get("_resolved_clarification"))
            carried_successful = resolved.get("_carried_successful_items") or []
            successful_items = [item for item in carried_successful if isinstance(item, dict)]
            failed_items = []
            last_matched_item = None
            cart_result = None
            current_cart_id = cart_id
            multi_item_request = len(requested_items) > 1

            for index, requested_item in enumerate(requested_items):
                item_query = requested_item.get("item_name")
                quantity = requested_item.get("quantity") or 1
                remaining_requested_items = requested_items[index + 1:]

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
                if not is_menu_item_available(matched_item):
                    failed_items.append(
                        _build_failed_item(
                            matched_item.get("name") or item_query,
                            "out of stock right now",
                        )
                    )
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
                has_customization = requested_item_has_customization(requested_item)
                required_groups, optional_groups = build_guided_order_groups(menu_detail)
                has_guided_groups = bool(required_groups or optional_groups)
                should_start_guided_order = (
                    not from_clarification
                    and len(requested_items) == 1
                    and not has_customization
                    and has_guided_groups
                )

                if should_start_guided_order:
                    set_guided_order_item_id(session_id, menu_item_id)
                    set_guided_order_item_name(session_id, matched_item.get("name"))
                    set_guided_order_quantity(session_id, quantity)
                    set_guided_order_required_groups(session_id, required_groups)
                    set_guided_order_optional_groups(session_id, optional_groups)
                    set_guided_order_selections(session_id, {})
                    set_session_stage(session_id, "guided_ordering")
                    set_guided_order_step(session_id, 0)

                    if required_groups:
                        set_guided_order_phase(session_id, 1)
                        set_guided_order_groups(session_id, required_groups)
                        first_group = required_groups[0]
                        reply_text = build_guided_order_prompt(
                            matched_item.get("name", "your item"),
                            first_group,
                            include_item_name=True,
                            allow_skip=False,
                        )
                        current_group = first_group.get("name")
                    elif len(optional_groups) == 1:
                        set_guided_order_phase(session_id, 3)
                        set_guided_order_groups(session_id, optional_groups)
                        first_group = optional_groups[0]
                        reply_text = build_guided_order_prompt(
                            matched_item.get("name", "your item"),
                            first_group,
                            include_item_name=True,
                            allow_skip=True,
                        )
                        current_group = first_group.get("name")
                    else:
                        set_guided_order_phase(session_id, 2)
                        set_guided_order_groups(session_id, optional_groups)
                        reply_text = build_optional_review_prompt(
                            matched_item.get("name", "your item"),
                            {},
                            optional_groups,
                        )
                        current_group = None

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
                            "pipeline_stage": "guided_ordering_start",
                            "current_group": current_group,
                            "guided_order_item_id": menu_item_id,
                            "guided_order_item_name": matched_item.get("name"),
                        },
                    )

                # ── Phase B: menu-aware modifier enrichment ───────────────────────
                # If the user specified customizations in natural language and
                # the item has variant groups, run a focused extraction call
                # using the actual variant options so we recognize menu-specific
                # terms (yogurt toppings, sandwich spreads, etc.)
                # Skip if guided ordering already handles customization, or if
                # the message has no modifier-like content.
                # Phase B only runs when:
                # 1. The classification LLM left size AND milk as null (it
                #    didn't extract customizations during classification)
                # 2. The message contains non-trivial modifier language
                #    beyond simple add phrases
                _classification_missed_modifiers = (
                    not requested_item.get("size")
                    and not (requested_item.get("options") or {}).get("milk")
                    and not requested_item.get("addons")
                )
                _STRONG_MODIFIER_SIGNALS = (
                    " with ", " without ", "no ", "swap ", "instead ",
                    "replace ", "change the ", "oat ", "almond ", "soy ",
                    "coconut ", "lactose ", "skim ", "full fat ",
                    "granola", "honey", "topping", "spread", "dressing",
                    "sauce", "drizzle", "whipped", "decaf", "yirgacheffe",
                    "shot ", "extra ", "syrup ",
                )
                _has_modifier_signal = any(
                    signal in f" {normalized_message.lower()} "
                    for signal in _STRONG_MODIFIER_SIGNALS
                )

                if (
                    not should_start_guided_order
                    and has_guided_groups
                    and _has_modifier_signal
                    and _classification_missed_modifiers
                    and not from_clarification
                ):
                    from app.services.llm_interpreter import extract_modifiers_for_item
                    try:
                        enriched_modifiers = await extract_modifiers_for_item(
                            message=normalized_message,
                            item_name=matched_item.get("name") or item_query,
                            menu_detail=menu_detail,
                            timeout=8.0,
                        )
                        # Merge enriched modifiers into requested_item
                        # Only override fields that were null/empty in the
                        # original LLM parse — don't discard what the
                        # classification LLM already got right
                        if enriched_modifiers.get("size") and not requested_item.get("size"):
                            requested_item = dict(requested_item)
                            requested_item["size"] = enriched_modifiers["size"]
                        if enriched_modifiers.get("options"):
                            current_opts = dict(requested_item.get("options") or {})
                            enriched_opts = enriched_modifiers["options"]
                            if enriched_opts.get("milk") and not current_opts.get("milk"):
                                current_opts["milk"] = enriched_opts["milk"]
                            if enriched_opts.get("sugar") and not current_opts.get("sugar"):
                                current_opts["sugar"] = enriched_opts["sugar"]
                            requested_item = dict(requested_item)
                            requested_item["options"] = current_opts
                        if enriched_modifiers.get("addons"):
                            existing_addons = list(requested_item.get("addons") or [])
                            for addon in enriched_modifiers["addons"]:
                                if addon not in existing_addons:
                                    existing_addons.append(addon)
                            requested_item = dict(requested_item)
                            requested_item["addons"] = existing_addons
                        if (
                            enriched_modifiers.get("instructions")
                            and not requested_item.get("instructions")
                        ):
                            requested_item = dict(requested_item)
                            requested_item["instructions"] = enriched_modifiers["instructions"]
                    except Exception as _enrich_err:
                        logger.warning({
                            "stage": "modifier_enrichment_failed",
                            "item": item_query,
                            "error": str(_enrich_err),
                        })
                        # Continue with original requested_item — enrichment
                        # is best-effort, never blocks the add flow

                selected_options, instructions, unmatched_modifier_suggestions = map_requested_item_to_selected_options(
                    requested_item,
                    menu_detail,
                )

                # Filter out negation modifiers (no X, without X) for variant
                # groups that simply don't exist on this item — these are
                # no-ops, not errors. Only surface truly unsupported positive
                # customizations (user asked FOR something that doesn't exist).
                _NEGATION_PREFIXES = (
                    "no ", "without ", "not ", "remove ", "skip ",
                    "no sugar", "no milk", "no ice", "no foam",
                    "no whip", "no warming",
                )
                _actionable_unmatched = [
                    s for s in unmatched_modifier_suggestions
                    if not any(
                        str(s.get("fragment") or "").lower().strip().startswith(prefix)
                        for prefix in _NEGATION_PREFIXES
                    )
                ]
                if _actionable_unmatched:
                    unmatched_modifier_suggestions = _actionable_unmatched

                # Pass negation fragments through as free-text instructions
                # so the kitchen sees them even when the variant group is absent
                _negation_fragments = [
                    str(s.get("fragment") or "").strip()
                    for s in unmatched_modifier_suggestions
                    if any(
                        str(s.get("fragment") or "").lower().strip().startswith(prefix)
                        for prefix in _NEGATION_PREFIXES
                    )
                    and str(s.get("fragment") or "").strip()
                ]
                if _negation_fragments:
                    extra_instructions = "; ".join(_negation_fragments)
                    instructions = (
                        f"{instructions}; {extra_instructions}".strip("; ")
                        if instructions
                        else extra_instructions
                    )

                if _actionable_unmatched:
                    from app.services.menu_details import build_item_detail_reply

                    item_display_name = matched_item.get("name") or requested_item.get("item_name") or "This item"
                    if len(_actionable_unmatched) == 1:
                        unsupported_text = _actionable_unmatched[0].get("fragment", "that option")
                        prefix = f"{item_display_name} has no {unsupported_text} option."
                    else:
                        fragments = [s.get("fragment", "") for s in _actionable_unmatched]
                        unsupported_text = (
                            ", ".join(fragments[:-1]) + f" and {fragments[-1]}"
                        )
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
                            "unmatched_modifier_suggestions": _actionable_unmatched,
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
                    is_unavailable = is_out_of_stock_error(add_err)
                    failed_message = (
                        "out of stock right now"
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
                        "unmatched_modifier_suggestions": unmatched_modifier_suggestions,
                    }
                )

            if not successful_items:
                if len(failed_items) == 1 and failed_items[0].get("message") == "not found on the menu":
                    reply_text = f"I could not find '{failed_items[0]['item_name']}' on the menu."
                elif len(failed_items) == 1 and failed_items[0].get("message") == "out of stock right now":
                    reply_text = build_out_of_stock_message(failed_items[0]["item_name"])
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

            cart_summary = build_cart_summary(cart_result["cart"])
            filtered_suggestions = []
            upsell_pick = None
            try:
                featured_items = await fetch_featured_items()
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

                _sess = get_session(session_id)
                upsell_shown: list = _sess.setdefault("upsell_shown", [])
                upsell_history = {
                    name.strip().lower()
                    for name in upsell_shown
                    if isinstance(name, str) and name.strip()
                }

                filtered_names: set = set()
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

                for name in filtered_names:
                    if name not in upsell_history:
                        upsell_shown.append(name)
                        upsell_history.add(name)

            except Exception as suggestion_err:
                logger.warning(
                    {
                        "stage": "post_add_suggestions_failed",
                        "normalized_message": normalized_message,
                        "cart_id": current_cart_id,
                        "error": str(suggestion_err),
                    }
                )

            def _added_item_customization_parts(item: dict) -> list[str]:
                parts: list[str] = []
                seen: set[str] = set()

                for opt in item.get("selected_options") or []:
                    if not isinstance(opt, dict):
                        continue
                    name = str(opt.get("name") or opt.get("optionName") or "").strip()
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

            # Improved confirmation message for single or multiple items
            if len(successful_items) == 1 and not failed_items:
                added_item = successful_items[0]
                single_custom_parts = _added_item_customization_parts(added_item)
                if single_custom_parts:
                    confirmation = _format_added_item_confirmation(added_item)
                    reply_text = (
                        f"Got it! {confirmation}.\n\n"
                        f"Your cart now contains:\n{cart_summary}"
                    )
                else:
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
                        f"Got it! {_join_natural(confirmations)}."
                    ]
                else:
                    added_lines = [
                        f"- {item['quantity']}x {item['matched_name']}"
                        for item in successful_items
                    ]
                    reply_parts = [
                        "✅ Added these items to your cart:\n" + "\n".join(added_lines)
                    ]

                if failed_items:
                    failed_lines = [_format_failed_item_line(item) for item in failed_items if item]
                    if failed_lines:
                        reply_parts.append(
                            "❌ I couldn't add these items:\n"
                            + "\n".join(failed_lines)
                        )

                if cart_summary:
                    reply_parts.append(f"Your cart now contains:\n{cart_summary}")

                reply_text = "\n\n".join(reply_parts)

            upsell_pick = next(
                (s for s in filtered_suggestions if s.get("type") == "upsell" and s.get("item_name")),
                None,
            )
            if upsell_pick and last_matched_item:
                reply_text += f"\n\nWould you like to add {upsell_pick.get('item_name')}?"
                if upsell_pick.get("fun_fact"):
                    reply_text += f"\n{upsell_pick.get('fun_fact')}"

            upsell_response_suggestions = [upsell_pick] if upsell_pick else filtered_suggestions

            if session is not None:
                session["cart_id"] = current_cart_id
                session["last_items"] = list(requested_items)
                session["last_intent"] = "add_items"
                session["pending_clarification"] = None
                set_session_stage(session_id, None)

            all_unmatched_modifier_suggestions = []
            seen_unmatched_modifier_keys: set[tuple[str, str]] = set()
            for item in successful_items:
                suggestions = item.get("unmatched_modifier_suggestions") or []
                if not isinstance(suggestions, list):
                    continue
                for suggestion in suggestions:
                    if not isinstance(suggestion, dict):
                        continue
                    fragment = str(suggestion.get("fragment") or "").strip()
                    normalized_suggestion = str(suggestion.get("suggestion") or "").strip()
                    dedupe_key = (fragment.lower(), normalized_suggestion.lower())
                    if dedupe_key in seen_unmatched_modifier_keys:
                        continue
                    seen_unmatched_modifier_keys.add(dedupe_key)
                    all_unmatched_modifier_suggestions.append(suggestion)

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
                    "unmatched_modifier_suggestions": all_unmatched_modifier_suggestions,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "add_items_done",
                },
            )

        if intent == "repeat_order":
            # Repeat the most recently ordered items from this session if available.
            session_items: list = (session or {}).get("last_items") or []
            recent_order_lines: list[dict] = []
            if not session_items:
                recent_orders = await fetch_my_orders(auth_cookie=auth_cookie, limit=20)
                if recent_orders:
                    for order in recent_orders:
                        if not isinstance(order, dict):
                            continue
                        if str(order.get("status") or "").strip().lower() == "cancelled":
                            continue
                        order_items = order.get("items")
                        if not isinstance(order_items, list) or not order_items:
                            continue

                        normalized_lines: list[dict] = []
                        for line in order_items:
                            if not isinstance(line, dict):
                                continue
                            menu_item_id = line.get("menuItemId")
                            qty = int(line.get("qty") or 1)
                            if menu_item_id is None or qty < 1:
                                continue
                            normalized_lines.append(
                                {
                                    "menuItemId": menu_item_id,
                                    "qty": qty,
                                    "selectedOptions": line.get("selectedOptions") if isinstance(line.get("selectedOptions"), list) else [],
                                    "instructions": str(line.get("instructions") or ""),
                                    "name": str(line.get("name") or "").strip(),
                                }
                            )

                        if normalized_lines:
                            recent_order_lines = normalized_lines
                            break

            if not session_items and not recent_order_lines:
                fallback_reply = await generate_fallback_reply(
                    normalized_message,
                    reason="repeat_order_no_history",
                )
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=(
                        fallback_reply
                        or "I don't have a record of a previous order in this session. "
                           "What would you like to add?"
                    ),
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
            if recent_order_lines:
                successful_items = []
                failed_items = []
                cart_result = None
                current_cart_id = cart_id

                for line in recent_order_lines:
                    menu_item_id = line.get("menuItemId")
                    quantity = int(line.get("qty") or 1)
                    if menu_item_id is None or quantity < 1:
                        continue
                    try:
                        cart_result = await add_item_to_cart(
                            menu_item_id=menu_item_id,
                            qty=quantity,
                            selected_options=line.get("selectedOptions") if isinstance(line.get("selectedOptions"), list) else [],
                            instructions=str(line.get("instructions") or ""),
                            cart_id=current_cart_id,
                        )
                    except ExpressAPIError as add_err:
                        failed_message = "out of stock right now" if is_out_of_stock_error(add_err) else "could not add right now"
                        failed_items.append(_build_failed_item(line.get("name") or "item", failed_message))
                        continue

                    current_cart_id = cart_result["cart_id"]
                    successful_items.append(
                        {
                            "requested_name": line.get("name"),
                            "matched_name": line.get("name") or "item",
                            "quantity": quantity,
                            "selected_options": line.get("selectedOptions") if isinstance(line.get("selectedOptions"), list) else [],
                            "instructions": str(line.get("instructions") or ""),
                        }
                    )

                if not successful_items:
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply="I couldn't re-add your last checked-out order.",
                        intent="repeat_order",
                        cart_updated=False,
                        cart_id=current_cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "failed_items": failed_items,
                            "pipeline_stage": "repeat_order_failed",
                        },
                    )

                cart_summary = build_cart_summary(cart_result["cart"])
                added_lines = [f"- {item['quantity']}x {item['matched_name']}" for item in successful_items]
                reply_text = "Re-added your last checked-out order:\n" + "\n".join(added_lines)
                if cart_summary:
                    reply_text += f"\n\nYour cart now contains:\n{cart_summary}"
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply_text,
                    intent="repeat_order",
                    cart_updated=True,
                    cart_id=current_cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "added_items": successful_items,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "repeat_order_done",
                    },
                )

            # Re-use the add flow with the session items
            resolved["items"] = list(session_items)
            intent = "add_items"
            # Fall through to the add flow below by re-entering via a recursive tail
            # would be complex — instead forward directly to the add path.
            menu_items = await fetch_menu_items()
            requested_items = resolved["items"]
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
                if not is_menu_item_available(matched_item):
                    failed_items.append(
                        _build_failed_item(
                            matched_item.get("name") or item_query,
                            "out of stock right now",
                        )
                    )
                    continue
                menu_item_id = matched_item.get("id") or matched_item.get("_id")
                if menu_item_id is None:
                    failed_items.append(_build_failed_item(item_query or matched_item.get("name", "item"), "missing menu item id"))
                    continue
                menu_detail = None
                if requested_item_has_customization(requested_item):
                    menu_detail = await fetch_menu_item_detail(menu_item_id)
                selected_options, instructions, _ = map_requested_item_to_selected_options(requested_item, menu_detail)
                try:
                    cart_result = await add_item_to_cart(
                        menu_item_id=menu_item_id,
                        qty=quantity,
                        selected_options=selected_options,
                        instructions=instructions,
                        cart_id=current_cart_id,
                    )
                except ExpressAPIError as add_err:
                    failed_message = "out of stock right now" if is_out_of_stock_error(add_err) else "could not add right now"
                    failed_items.append(_build_failed_item(matched_item.get("name") or item_query, failed_message))
                    continue
                current_cart_id = cart_result["cart_id"]
                last_matched_item = matched_item
                successful_items.append({
                    "requested_name": item_query,
                    "matched_name": matched_item.get("name", "item"),
                    "quantity": quantity,
                    "matched_item": matched_item,
                    "selected_options": selected_options,
                    "instructions": instructions,
                })

            if not successful_items:
                if len(failed_items) == 1 and failed_items[0].get("message") == "out of stock right now":
                    reply_text = build_out_of_stock_message(failed_items[0]["item_name"])
                else:
                    reply_text = "I couldn't re-add your previous items."
                return ChatMessageResponse(
                    session_id=session_id, status="ok", reply=reply_text,
                    intent="repeat_order", cart_updated=False, cart_id=current_cart_id,
                    defaults_used=[], suggestions=[],
                    metadata={"normalized_message": normalized_message, "failed_items": failed_items, "pipeline_stage": "repeat_order_failed"},
                )

            cart_summary = build_cart_summary(cart_result["cart"])
            added_lines = [f"- {i['quantity']}x {i['matched_name']}" for i in successful_items]
            reply_text = "Re-added your previous items:\n" + "\n".join(added_lines)
            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"
            return ChatMessageResponse(
                session_id=session_id, status="ok", reply=reply_text,
                intent="repeat_order", cart_updated=True, cart_id=current_cart_id,
                defaults_used=[], suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "added_items": successful_items,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "repeat_order_done",
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
        update_last_action(session_id, normalized_message, response.reply, intent, action_data={"fallback": True})
        return response

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
