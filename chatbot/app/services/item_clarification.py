from difflib import SequenceMatcher, get_close_matches
from typing import Any


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").lower().strip().split())


def _normalize_token(value: Any) -> str:
    token = _normalize_text(value)
    if token.endswith("s") and len(token) > 3:
        token = token[:-1]
    return token


def _group_label(group: dict[str, Any]) -> str:
    return (
        group.get("customerLabel")
        or group.get("name")
        or group.get("adminName")
        or "option"
    )


def _active_option_names(group: dict[str, Any]) -> list[str]:
    options = group.get("options")
    if not isinstance(options, list):
        return []

    names: list[str] = []
    for option in options:
        if not isinstance(option, dict):
            continue
        name = str(option.get("name") or "").strip()
        if name:
            names.append(name)
    return names


def _group_key(group: dict[str, Any]) -> str:
    label = _normalize_text(_group_label(group))
    if "size" in label:
        return "size"
    if "milk" in label:
        return "milk"
    if "sugar" in label:
        return "sugar"
    if "temperature" in label or "temp" in label:
        return "temperature"
    if "topping" in label or "flavor" in label or "espresso" in label or "add on" in label or "add-on" in label:
        return "addons"
    return "other"


def _option_aliases(option_name: str, group_key: str) -> list[str]:
    normalized_option = _normalize_text(option_name)
    aliases = [normalized_option]

    if group_key == "size":
        if "small" in normalized_option:
            aliases.extend(["small", "smol"])
        if "medium" in normalized_option:
            aliases.extend(["medium", "med", "meduim"])
        if "large" in normalized_option:
            aliases.extend(["large", "lg"])

    if group_key == "milk":
        if "full fat" in normalized_option:
            aliases.extend(["full milk", "regular milk", "whole milk", "full cream", "full"])
        if "skim milk" in normalized_option:
            aliases.extend(["skim", "skimmed milk", "low fat milk"])
        if "lactose free" in normalized_option:
            aliases.extend(["lactose free", "no lactose"])
        if "almond milk" in normalized_option:
            aliases.extend(["almond", "almond milk"])
        if "coconut milk" in normalized_option:
            aliases.extend(["coconut", "coconut milk"])

    return [alias for alias in aliases if alias]


def get_menu_detail_variants(menu_detail: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(menu_detail, dict):
        return []

    variants = menu_detail.get("variantGroupDetails")
    if isinstance(variants, list):
        return [group for group in variants if isinstance(group, dict)]

    variants = menu_detail.get("variants")
    if isinstance(variants, list):
        return [group for group in variants if isinstance(group, dict)]

    return []


def _phrase_matches_message(normalized_message: str, phrase: str) -> bool:
    if not phrase:
        return False
    if phrase in normalized_message:
        return True

    message_tokens = normalized_message.split()
    phrase_tokens = phrase.split()
    if not message_tokens or not phrase_tokens:
        return False

    for phrase_token in phrase_tokens:
        if phrase_token in message_tokens:
            continue
        if not get_close_matches(phrase_token, message_tokens, n=1, cutoff=0.82):
            return False
    return True


def _requested_fragments(requested_item: dict[str, Any]) -> list[str]:
    fragments: list[str] = []

    size = requested_item.get("size")
    if size:
        fragments.append(str(size))

    options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}
    for key in ("milk", "sugar"):
        value = options.get(key)
        if value:
            fragments.append(str(value))

    addons = requested_item.get("addons")
    if isinstance(addons, list):
        fragments.extend(str(addon) for addon in addons if addon)

    instructions = requested_item.get("instructions")
    if instructions:
        fragments.append(str(instructions))

    return [_normalize_text(fragment) for fragment in fragments if _normalize_text(fragment)]


def _group_answered(requested_item: dict[str, Any], group: dict[str, Any]) -> bool:
    group_key = _group_key(group)
    fragments = _requested_fragments(requested_item)

    if group_key == "size":
        return bool(requested_item.get("size"))
    if group_key == "milk":
        options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}
        return bool(options.get("milk"))
    if group_key == "sugar":
        options = requested_item.get("options") if isinstance(requested_item.get("options"), dict) else {}
        return bool(options.get("sugar"))

    option_names = [_normalize_text(name) for name in _active_option_names(group)]
    return any(
        option_name and any(option_name in fragment or fragment in option_name for fragment in fragments)
        for option_name in option_names
    )


def find_ambiguous_menu_matches(menu_items: list[dict[str, Any]], item_query: str) -> list[dict[str, Any]]:
    # Only consider items that are currently available
    menu_items = [
        item for item in menu_items
        if isinstance(item, dict) and item.get("isAvailable", True) is not False
    ]

    normalized_query = _normalize_text(item_query)
    if not normalized_query:
        return []

    filler_tokens = {
        "can", "could", "would", "you", "u", "please", "pls", "add",
        "get", "give", "have", "order", "want", "like", "to", "i",
        "me", "a", "an", "the", "for", "some",
    }
    cleaned_tokens = [
        token for token in normalized_query.split()
        if token and token not in filler_tokens
    ]
    if cleaned_tokens:
        normalized_query = " ".join(cleaned_tokens)

    exact_matches = [
        item for item in menu_items
        if _normalize_text(item.get("name")) == normalized_query
    ]
    if exact_matches:
        return []

    # If one full menu name is a clearly better fuzzy match for the query,
    # treat it as specific instead of opening a family-level ambiguity prompt.
    full_name_map = {
        _normalize_text(item.get("name")): item
        for item in menu_items
        if isinstance(item, dict) and _normalize_text(item.get("name"))
    }
    close_full_names = get_close_matches(normalized_query, list(full_name_map.keys()), n=2, cutoff=0.80)
    if len(close_full_names) == 1:
        return []
    if len(close_full_names) >= 2:
        top_score = SequenceMatcher(None, normalized_query, close_full_names[0]).ratio()
        second_score = SequenceMatcher(None, normalized_query, close_full_names[1]).ratio()
        if (top_score - second_score) >= 0.12:
            return []

    # If the query includes a token that is also an exact standalone item
    # name (e.g., "espresso"), prefer direct resolution over family ambiguity.
    query_tokens = {
        _normalize_token(token)
        for token in normalized_query.split()
        if _normalize_token(token)
    }
    standalone_item_names = {
        _normalize_token(item.get("name"))
        for item in menu_items
        if isinstance(item, dict) and _normalize_text(item.get("name"))
    }
    if any(token in standalone_item_names and len(token) >= 4 for token in query_tokens):
        return []

    # If the user provided a specific multi-word name (even with typos),
    # and exactly one menu item matches all query tokens fuzzily,
    # do not trigger ambiguity at the family level.
    query_tokens = [_normalize_token(token) for token in normalized_query.split() if _normalize_token(token)]
    if len(query_tokens) >= 2:
        token_precise_matches: list[dict[str, Any]] = []
        for item in menu_items:
            if not isinstance(item, dict):
                continue
            name_tokens = [
                _normalize_token(word)
                for word in _normalize_text(item.get("name")).split()
                if _normalize_token(word)
            ]
            if not name_tokens:
                continue

            matches_all_tokens = all(
                get_close_matches(query_token, name_tokens, n=1, cutoff=0.78)
                for query_token in query_tokens
            )
            if matches_all_tokens:
                token_precise_matches.append(item)

        unique_precise: list[dict[str, Any]] = []
        seen_precise: set[str] = set()
        for item in token_precise_matches:
            key = _normalize_text(item.get("name"))
            if key and key not in seen_precise:
                seen_precise.add(key)
                unique_precise.append(item)

        if len(unique_precise) == 1:
            return []

    query_words = set(normalized_query.split())
    candidates: list[dict[str, Any]] = []
    for item in menu_items:
        name = _normalize_text(item.get("name"))
        if not name:
            continue
        name_words = set(name.split())
        if normalized_query in name or name in normalized_query or query_words.issubset(name_words):
            candidates.append(item)

    if len(candidates) == 0:
        normalized_query_tokens = [_normalize_token(token) for token in normalized_query.split() if _normalize_token(token)]
        menu_name_words = {
            _normalize_token(word)
            for item in menu_items
            for word in _normalize_text(item.get("name")).split()
            if _normalize_token(word)
        }

        family_words: set[str] = set()
        for token in normalized_query_tokens:
            if token in menu_name_words:
                family_words.add(token)
                continue

            close = get_close_matches(token, list(menu_name_words), n=3, cutoff=0.75)
            family_words.update(close)

        if family_words:
            candidates = []
            for item in menu_items:
                normalized_name_words = {
                    _normalize_token(word)
                    for word in _normalize_text(item.get("name")).split()
                    if _normalize_token(word)
                }
                if family_words & normalized_name_words:
                    candidates.append(item)

    unique_candidates: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    for item in candidates:
        key = _normalize_text(item.get("name"))
        if key and key not in seen_names:
            seen_names.add(key)
            unique_candidates.append(item)

    if len(unique_candidates) > 1:
        return unique_candidates

    # Single candidate: only auto-resolve if the query is a close match to
    # the item name.  If the item name has meaningful extra tokens the user
    # didn't type (e.g. "water" → "Rim Sparkling Water"), return the single
    # candidate so the bot can ask "Did you mean X?" instead of silently
    # adding the wrong thing.
    # EXCEPT: for very short queries (1-2 words like "water", "juice"), 
    # auto-add without confirmation.
    if len(unique_candidates) == 1:
        query_word_count = len([w for w in normalized_query.split() if w])
        if query_word_count <= 2:
            # Short query → auto-add without confirmation
            return []
        
        item_name_words = set(_normalize_text(unique_candidates[0].get("name")).split())
        query_words_set = set(normalized_query.split())
        extra_words = item_name_words - query_words_set
        if any(len(w) >= 4 for w in extra_words):
            return unique_candidates

    return []


def build_menu_choice_prompt(item_query: str, candidates: list[dict[str, Any]]) -> str:
    def _display_query(query: str, items: list[dict[str, Any]]) -> str:
        raw = str(query or "").strip()
        if not raw:
            return "item"

        # Build a vocabulary from candidate names to auto-correct display tokens.
        vocab: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            for word in _normalize_text(item.get("name")).split():
                token = _normalize_token(word)
                if token:
                    vocab.add(token)

        if not vocab:
            return raw

        filler_tokens = {
            "can", "could", "would", "you", "u", "please", "pls", "add",
            "get", "give", "have", "order", "want", "like", "to", "i",
            "me", "a", "an", "the", "for", "some",
        }

        mapped_vocab_tokens: list[str] = []
        for part in raw.split():
            normalized_part = _normalize_token(part.strip(".,!?"))
            if not normalized_part or normalized_part in filler_tokens:
                continue

            close = get_close_matches(normalized_part, list(vocab), n=1, cutoff=0.78)
            if close:
                mapped_vocab_tokens.append(close[0])

        if mapped_vocab_tokens:
            compact_tokens: list[str] = []
            for token in mapped_vocab_tokens:
                if not compact_tokens or compact_tokens[-1] != token:
                    compact_tokens.append(token)
            return " ".join(compact_tokens)

        return raw

    names = [str(candidate.get("name") or "").strip() for candidate in candidates if candidate.get("name")]
    if not names:
        return "Happy to help. Which item would you like?"

    if len(names) == 1:
        return f"Nice choice. Did you mean {names[0]}?"

    if len(names) == 2:
        options_text = f"{names[0]} or {names[1]}"
    else:
        options_text = ", ".join(names[:-1]) + f", or {names[-1]}"

    display_query = _display_query(item_query, candidates)
    return f"Great choice. Which {display_query} would you like: {options_text}?"


def build_menu_choice_suggestions(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    for candidate in candidates:
        name = str(candidate.get("name") or "").strip()
        if not name:
            continue
        suggestions.append(
            {
                "type": "clarification_choice",
                "item_name": name,
                "label": name,
                "input_text": name,
            }
        )
    return suggestions


def resolve_menu_choice(message: str, candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    normalized_message = _normalize_text(message)
    if not normalized_message:
        return None

    exact = [candidate for candidate in candidates if _normalize_text(candidate.get("name")) == normalized_message]
    if len(exact) == 1:
        return exact[0]

    contains_matches = [
        candidate
        for candidate in candidates
        if normalized_message in _normalize_text(candidate.get("name"))
        or _normalize_text(candidate.get("name")) in normalized_message
    ]
    if len(contains_matches) == 1:
        return contains_matches[0]

    return None


def collect_missing_variant_groups(requested_item: dict[str, Any], menu_detail: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(menu_detail, dict):
        return []

    variants = get_menu_detail_variants(menu_detail)
    if not variants:
        return []

    missing_groups: list[dict[str, Any]] = []
    for group in variants:
        if not isinstance(group, dict):
            continue

        label = _normalize_text(_group_label(group))
        is_required = bool(group.get("isRequired"))
        tracked = any(
            keyword in label
            for keyword in ["size", "milk", "sugar", "topping", "flavor", "espresso", "add on", "add-on"]
        )
        if not (is_required or tracked):
            continue
        if _group_answered(requested_item, group):
            continue
        missing_groups.append(group)

    return missing_groups


def build_customization_prompt(item_name: str, missing_groups: list[dict[str, Any]]) -> str:
    if not missing_groups:
        return f"Awesome choice. How would you like your {item_name}?"

    # Checklist UI renders the concrete options, so keep the text concise.
    return f"Great pick! Let’s customize your {item_name}. Please choose from the checklist below."


def build_customization_suggestions(
    missing_groups: list[dict[str, Any]],
    *,
    max_options_per_group: int = 8,
    max_total: int = 20,
) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    seen_inputs: set[str] = set()

    for group in missing_groups:
        label = _group_label(group)
        group_key = _group_key(group)
        raw_max = group.get("maxSelections")
        if isinstance(raw_max, int) and raw_max > 0:
            max_selections = raw_max
        else:
            max_selections = 1

        if group_key == "addons" and "flavor" in _normalize_text(label):
            max_selections = min(max_selections, 2) if max_selections > 1 else 2

        options = _active_option_names(group)[:max_options_per_group]
        for option_name in options:
            input_text = str(option_name).strip()
            key = _normalize_text(input_text)
            if not key or key in seen_inputs:
                continue
            seen_inputs.add(key)
            suggestions.append(
                {
                    "type": "clarification_option",
                    "item_name": input_text,
                    "label": f"{label}: {input_text}",
                    "input_text": input_text,
                    "group": label,
                    "maxSelections": max_selections,
                }
            )
            if len(suggestions) >= max_total:
                return suggestions

    return suggestions


def apply_customization_response(
    requested_item: dict[str, Any],
    message: str,
    menu_detail: dict[str, Any] | None,
) -> dict[str, Any]:
    updated_item = {
        "item_name": requested_item.get("item_name"),
        "quantity": requested_item.get("quantity"),
        "size": requested_item.get("size"),
        "options": dict(requested_item.get("options") or {"milk": None, "sugar": None}),
        "addons": list(requested_item.get("addons") or []),
        "instructions": requested_item.get("instructions") or "",
    }

    if not isinstance(menu_detail, dict):
        return updated_item

    variants = get_menu_detail_variants(menu_detail)
    if not variants:
        return updated_item

    normalized_message = _normalize_text(message)
    if not normalized_message:
        return updated_item

    matched_any = False
    for group in variants:
        if not isinstance(group, dict):
            continue
        group_key = _group_key(group)
        options = group.get("options")
        if not isinstance(options, list):
            continue

        for option in options:
            if not isinstance(option, dict):
                continue
            option_name = str(option.get("name") or "").strip()
            if not option_name:
                continue

            normalized_option = _normalize_text(option_name)
            normalized_description = _normalize_text(option.get("description"))
            option_aliases = _option_aliases(option_name, group_key)

            if not any(_phrase_matches_message(normalized_message, alias) for alias in option_aliases):
                if not (normalized_description and _phrase_matches_message(normalized_message, normalized_description)):
                    continue

            if group_key == "milk" and ("small" in normalized_option or "medium" in normalized_option or "large" in normalized_option):
                # If the option name includes a size but user didn't mention one,
                # do not auto-pick a size-specific milk option.
                size_in_message = any(token in normalized_message.split() for token in ["small", "medium", "med", "meduim", "large", "lg"])
                if not size_in_message:
                    continue

            if not normalized_option:
                continue

            matched_any = True
            if group_key == "size":
                updated_item["size"] = option_name
            elif group_key == "milk":
                updated_item["options"]["milk"] = option_name
            elif group_key == "sugar":
                updated_item["options"]["sugar"] = option_name
            else:
                existing_addons = [_normalize_text(addon) for addon in updated_item["addons"]]
                if normalized_option not in existing_addons:
                    updated_item["addons"].append(option_name)

    if not matched_any and not updated_item["instructions"]:
        updated_item["instructions"] = str(message).strip()
    elif not matched_any and str(message).strip():
        updated_item["instructions"] = f"{updated_item['instructions']}; {str(message).strip()}".strip("; ")

    return updated_item


def _is_frozen_yogurt(menu_detail: dict[str, Any] | None) -> bool:
    """Return True if the item is a frozen yogurt product (smart defaults are skipped for these)."""
    if not isinstance(menu_detail, dict):
        return False
    category = _normalize_text(menu_detail.get("category"))
    subcategory = _normalize_text(menu_detail.get("subcategory"))
    name = _normalize_text(menu_detail.get("name"))
    hay = f"{category} {subcategory} {name}"
    return any(kw in hay for kw in ["frozen yogurt", "froyo", "yogurt"])


def _find_default_option(group: dict[str, Any], preferred_names: list[str]) -> str | None:
    """Return the name of the best matching default option from a variant group."""
    options = _active_option_names(group)
    if not options:
        return None

    normalized_preferred = [_normalize_text(p) for p in preferred_names]

    # Exact match first
    for option in options:
        if _normalize_text(option) in normalized_preferred:
            return option

    # Substring match
    for option in options:
        norm_opt = _normalize_text(option)
        for pref in normalized_preferred:
            if pref in norm_opt or norm_opt in pref:
                return option

    # Fallback: first available option
    return options[0]


def apply_smart_defaults(
    requested_item: dict[str, Any],
    menu_detail: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str], list[dict[str, Any]]]:
    """
    Apply smart defaults: size → Medium, milk → Regular/Full Fat.
    Addon/topping/espresso/sugar groups are silently skipped (opt-in only).

    Returns:
        updated_item: copy of requested_item with size and milk filled in
        applied_labels: human-readable labels for what was defaulted
        still_required: list of required groups that couldn't be defaulted
    """
    if not isinstance(menu_detail, dict):
        return requested_item, [], []

    variants = get_menu_detail_variants(menu_detail)
    if not variants:
        return requested_item, [], []

    updated_item: dict[str, Any] = {
        "item_name": requested_item.get("item_name"),
        "quantity": requested_item.get("quantity"),
        "size": requested_item.get("size"),
        "options": dict(requested_item.get("options") or {"milk": None, "sugar": None}),
        "addons": list(requested_item.get("addons") or []),
        "instructions": requested_item.get("instructions") or "",
    }

    applied_labels: list[str] = []
    still_required: list[dict[str, Any]] = []

    for group in variants:
        if not isinstance(group, dict):
            continue

        if _group_answered(updated_item, group):
            continue

        key = _group_key(group)
        is_required = bool(group.get("isRequired"))

        if key == "size":
            default_opt = _find_default_option(group, ["medium"])
            if default_opt:
                updated_item["size"] = default_opt
                applied_labels.append(default_opt)
            elif is_required:
                still_required.append(group)

        elif key == "milk":
            default_opt = _find_default_option(
                group,
                ["regular milk", "full fat", "whole milk", "full cream", "regular"],
            )
            if default_opt:
                updated_item["options"]["milk"] = default_opt
                applied_labels.append(default_opt)
            elif is_required:
                still_required.append(group)

        elif key in ("addons", "sugar"):
            # Opt-in / optional — never prompt or default
            pass

        elif key == "temperature":
            # For drinks/water, apply a silent cold default so users are not
            # blocked by a clarification prompt on simple add requests.
            default_opt = _find_default_option(
                group,
                ["cold water", "cold", "chilled", "iced"],
            )
            if default_opt:
                existing = {_normalize_text(addon) for addon in updated_item["addons"] if addon}
                if _normalize_text(default_opt) not in existing:
                    updated_item["addons"].append(default_opt)
            elif is_required:
                still_required.append(group)

        else:
            # Other groups (e.g. Temperature, Sauce): only block if required
            if is_required:
                still_required.append(group)

    return updated_item, applied_labels, still_required


def build_defaults_confirmation_prompt(
    item_name: str,
    applied_labels: list[str],
    user_customizations: dict[str, Any] | None = None,
) -> str:
    """Build a natural smart-default confirmation message."""
    user_customizations = user_customizations or {}

    _SIZE_KW = {"small", "medium", "large"}
    size_label = next(
        (lbl for lbl in applied_labels if any(kw in _normalize_text(lbl) for kw in _SIZE_KW)),
        None,
    )
    other_labels = [lbl for lbl in applied_labels if lbl != size_label]

    user_option_values: list[str] = []
    raw_options = user_customizations.get("options")
    if isinstance(raw_options, dict):
        for value in raw_options.values():
            text = str(value or "").strip()
            if text:
                user_option_values.append(text)

    user_addons = [
        str(addon).strip()
        for addon in (user_customizations.get("addons") or [])
        if str(addon or "").strip()
    ]
    user_instructions = str(user_customizations.get("instructions") or "").strip()

    customizations: list[str] = []
    seen_customizations: set[str] = set()

    def _append_once(value: str) -> None:
        norm = _normalize_text(value)
        if not norm or norm in seen_customizations:
            return
        seen_customizations.add(norm)
        customizations.append(value.lower())

    for value in user_addons + user_option_values:
        _append_once(value)
    if user_instructions:
        _append_once(user_instructions)
    for value in other_labels:
        _append_once(value)

    if not size_label and not customizations:
        return f"Got it! I added {item_name} to your cart. Want to change anything?"

    parts: list[str] = []
    if size_label:
        parts.append(size_label.lower())
    parts.append(item_name)
    if customizations:
        parts.append(f"with {', '.join(customizations)}")

    description = " ".join(parts)
    return f"Got it! {description} ☕. Want to change anything?"


def build_defaults_confirmation_suggestions() -> list[dict[str, Any]]:
    """Return two chip buttons: 'Looks good!' and 'Change it'."""
    return [
        {
            "type": "defaults_confirmation",
            "item_name": "",
            "label": "Looks good! Add it \u2713",
            "input_text": "looks good add it",
        },
        {
            "type": "defaults_confirmation",
            "item_name": "",
            "label": "Change it \u270f\ufe0f",
            "input_text": "change it",
        },
    ]
