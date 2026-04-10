import logging
import re
import httpx

from app.schemas.chat import ChatMessageResponse
from app.services.fallback_assistant import generate_fallback_reply
from app.services.intent_pipeline import resolve_intent
from app.services.llm_interpreter import _extract_json_object, _generate_gemini_content
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
STATIC_REPLY_TABLE: dict[str, str] = {
    "hi": "Hi! What can I get for you today?",
    "hey": "Hey! What can I get for you?",
    "hello": "Hello! What would you like to order?",
    "hiya": "Hi there! What can I get you?",
    "good morning": "Good morning! What can I get for you?",
    "good afternoon": "Good afternoon! What would you like?",
    "good evening": "Good evening! What can I get for you?",
    "thanks": "You're welcome! Anything else?",
    "thank you": "You're welcome! Let me know if you need anything else.",
    "thx": "You're welcome!",
    "cheers": "Cheers! Anything else I can help with?",
    "great": "Great! Anything else?",
    "perfect": "Perfect! Anything else?",
    "awesome": "Glad to help! Anything else?",
}
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


def append_selected_option(selected_options: list[dict], option_name: str | None) -> None:
    if not isinstance(option_name, str) or not option_name.strip():
        return

    option_key = normalize_modifier_text(option_name)
    for existing in selected_options:
        existing_name = existing.get("optionName") if isinstance(existing, dict) else None
        if normalize_modifier_text(existing_name) == option_key:
            return

    selected_options.append({"optionName": option_name.strip()})


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


def _is_required_guided_group(group: dict) -> bool:
    if not isinstance(group, dict):
        return False

    if group.get("isRequired") is True or group.get("required") is True:
        return True

    group_name = normalize_modifier_text(group.get("name"))
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
        candidate_name = normalize_modifier_text(group.get("name"))
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
    group_name = group.get("name")
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

    phase3_done_words = frozenset({
        "done",
        "add it",
        "add to cart",
        "add",
        "skip",
        "none",
        "yes",
        "yep",
        "yeah",
        "that's it",
        "nothing else",
        "looks good",
        "perfect",
        "great",
        "no",
        "nope",
        "no thanks",
        "nothing",
    })
    if msg in phase3_done_words:
        return {
            "action": "finalize",
            "group_name": None,
            "selections": [],
            "reply_hint": None,
        }

    normalized_msg = normalize_modifier_text(msg)
    for group in optional_groups:
        for option in active_variant_options(group):
            option_name = option.get("name", "")
            if normalize_modifier_text(option_name) == normalized_msg:
                return {
                    "action": "select",
                    "group_name": group.get("name"),
                    "selections": [option_name],
                    "reply_hint": None,
                }

    for group in optional_groups:
        normalized_group_name = normalize_modifier_text(group.get("name", ""))
        if not normalized_group_name or normalized_group_name not in normalized_msg:
            continue
        if any(token in normalized_msg for token in ("what", "which", "options", "have", "available")):
            return {
                "action": "query_options",
                "group_name": group.get("name"),
                "selections": [],
                "reply_hint": f"For {group.get('name')}: {_build_group_options_text(group)}.",
            }

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
    variants = menu_detail.get("variants") if isinstance(menu_detail, dict) else None
    if not isinstance(variants, list):
        return [], []

    for group in variants:
        if not isinstance(group, dict):
            continue

        active_options = active_variant_options(group)
        if len(active_options) < 2:
            continue

        group_name = group.get("name")
        if not group_name:
            continue

        normalized_name = normalize_modifier_text(group_name)
        if any(normalize_modifier_text(existing.get("name")) == normalized_name for existing in groups):
            continue

        group_copy = dict(group)
        group_copy["options"] = active_options
        groups.append(group_copy)

    groups.sort(key=lambda group: _guided_group_rank(group.get("name") or ""))
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
    group_name = (group.get("name") or "option").lower()
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


def map_requested_item_to_selected_options(
    requested_item: dict,
    menu_detail: dict | None,
) -> tuple[list[dict], str, list[dict]]:
    if not isinstance(requested_item, dict):
        return [], "", []

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
            record_unmatched_modifier(size_value)
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
            record_unmatched_modifier(milk_value)

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
            record_unmatched_modifier(sugar_value)

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
                record_unmatched_modifier(str(addon))

    for fragment in split_instruction_fragments(requested_item.get("instructions")):
        matched_instruction = find_variant_option(
            menu_detail,
            [normalize_modifier_text(fragment)],
            allow_contains=True,
        )
        if matched_instruction:
            append_selected_option(selected_options, matched_instruction.get("name"))
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
    raw_text = _generate_gemini_content(prompt)
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
    normalized_phrase = _normalize_whitespace(normalized_message)
    # Default so exception handlers always have a defined intent variable.
    intent = "unknown"
    current_stage = get_session_stage(session_id)
    resolved = None
    _skip_resolve = False

    if current_stage not in {"guided_ordering", "checkout_summary"}:
        static_reply = STATIC_REPLY_TABLE.get(normalized_phrase)
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

    if not _skip_resolve and current_stage == "guided_ordering" and normalized_phrase in GUIDED_ABORT_WORDS:
        item_name = get_guided_order_item_name(session_id)
        clear_guided_order_session(session_id)
        set_session_stage(session_id, None)
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=f"No problem! I won't add the {item_name or 'item'}. What else can I get you?",
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
        resolved = await resolve_intent(
            message=normalized_message,
            session=session or {},
            cart={},
            menu=[],
        )
        intent = resolved["intent"]

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

        if intent == "describe_item":
            # The LLM extracts the item name into items[0].item_name
            describe_query = ""
            if resolved["items"]:
                describe_query = (resolved["items"][0].get("item_name") or "").strip()

            if not describe_query:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Sure, which menu item would you like me to describe?",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "describe_item_missing_query",
                    },
                )

            menu_items = await fetch_menu_items()
            matched_item = await find_menu_item_by_name(menu_items, describe_query)

            if not matched_item:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"I couldn't find '{describe_query}' on the menu. Want me to suggest something similar?",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "item_query": describe_query,
                        "pipeline_stage": "describe_item_not_found",
                    },
                )

            menu_item_id = matched_item.get("id") or matched_item.get("_id")
            item_detail = await fetch_menu_item_detail(menu_item_id) if menu_item_id is not None else None
            source_item = item_detail if isinstance(item_detail, dict) else matched_item

            item_name = source_item.get("name") or matched_item.get("name") or "This item"
            description = (source_item.get("description") or "").strip()
            base_price = source_item.get("basePrice") or source_item.get("price")

            if description and base_price:
                reply_text = f"{item_name}: {description}\n\nPrice: {_fmt_price(base_price)}"
            elif description:
                reply_text = f"{item_name}: {description}"
            elif base_price:
                reply_text = f"{item_name} is available for {_fmt_price(base_price)}."
            else:
                reply_text = f"{item_name} is available on our menu."

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
                    "item_query": describe_query,
                    "matched_item": {
                        "id": matched_item.get("id") or matched_item.get("_id"),
                        "name": matched_item.get("name"),
                    },
                    "pipeline_stage": "describe_item_done",
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
            # Items are already resolved by the pipeline (follow-up refs expanded,
            # quantities normalised). No further extraction or session resolution needed.
            requested_items = resolved["items"]

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
                    len(requested_items) == 1
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

                selected_options, instructions, unmatched_modifier_suggestions = map_requested_item_to_selected_options(
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
            try:
                featured_items = await fetch_featured_items()
                popular = suggest_popular_items(featured_items)
                complementary = suggest_complementary_items(menu_items, last_matched_item)

                suggestions = popular + complementary
                added_item_names = {item["matched_name"].lower() for item in successful_items}

                filtered_suggestions = [
                    s for s in suggestions
                    if (s.get("item_name") or "").lower() not in added_item_names
                ]
            except Exception as suggestion_err:
                logger.warning(
                    {
                        "stage": "post_add_suggestions_failed",
                        "normalized_message": normalized_message,
                        "cart_id": current_cart_id,
                        "error": str(suggestion_err),
                    }
                )

            suggestion_lines = [f"- {s['item_name']}" for s in filtered_suggestions]
            suggestion_text = "\n".join(suggestion_lines)

            all_unmatched_modifier_suggestions = [
                suggestion
                for item in successful_items
                for suggestion in item.get("unmatched_modifier_suggestions", [])
            ]
            informational_suggestions = [
                suggestion
                for suggestion in all_unmatched_modifier_suggestions
                if suggestion.get("suggestion")
            ]

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

            if informational_suggestions:
                if len(informational_suggestions) == 1:
                    suggestion = informational_suggestions[0]
                    reply_text += (
                        f"\n\nBy the way - did you mean {suggestion['suggestion']}"
                        f" instead of '{suggestion['fragment']}'?"
                    )
                else:
                    clarification_lines = [
                        f"- '{suggestion['fragment']}' -> {suggestion['suggestion']}?"
                        for suggestion in informational_suggestions
                    ]
                    reply_text += (
                        "\n\nJust checking - did you mean:\n"
                        + "\n".join(clarification_lines)
                    )

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
                    "unmatched_modifier_suggestions": all_unmatched_modifier_suggestions,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "add_items_done",
                },
            )

        if intent == "repeat_order":
            # Repeat the most recently ordered items from this session if available.
            session_items: list = (session or {}).get("last_items") or []
            if not session_items:
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
