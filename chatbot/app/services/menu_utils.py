import re

from app.services.item_clarification import get_menu_detail_variants

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
TOKEN_EQUIVALENTS = {
    "not": "no",
    "without": "no",
    "warmed": "warming",
    "warm": "warming",
    "unwarmed": "no warming",
    "iced": "ice",
}
NEGATION_PREFIXES = (
    "no ", "without ", "not ", "remove ", "skip ",
    "no sugar", "no milk", "no ice", "no foam",
    "no whip", "no warming",
)
_NEGATION_PREFIXES = NEGATION_PREFIXES


def is_menu_item_available(menu_item: dict | None) -> bool:
    if not isinstance(menu_item, dict):
        return False
    return menu_item.get("isAvailable") is not False


def normalize_modifier_text(value: str | None) -> str:
    if value is None:
        return ""

    normalized = re.sub(r"[^a-z0-9\s]+", " ", str(value).lower())
    return " ".join(normalized.split())


def is_guided_skip_response(value: str | None) -> bool:
    normalized = normalize_modifier_text(value)
    if not normalized:
        return False

    if normalized in GUIDED_SKIP_WORDS:
        return True

    if normalized in {"no thanks", "no thank you", "none thanks", "none thank you"}:
        return True

    return any(
        normalized.startswith(prefix)
        for prefix in (
            "none thanks",
            "none thank you",
            "no thanks",
            "no thank you",
            "nothing thanks",
            "nothing thank you",
            "skip thanks",
            "skip thank you",
        )
    )


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


def get_variant_group_id(group: dict | None) -> str:
    if not isinstance(group, dict):
        return ""
    return str(group.get("groupId") or "").strip()


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


def merge_instruction_text(base: str | None, extra: str | None) -> str:
    merged_parts: list[str] = []

    for value in (base, extra):
        for fragment in split_instruction_fragments(value):
            add_unique_phrase(merged_parts, fragment)

    return "; ".join(merged_parts)


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


def build_menu_semantics(menu_detail: dict | None) -> dict:
    size_candidates, milk_candidates, addon_candidates = (
        build_modifier_candidates_from_menu_detail(menu_detail)
    )
    groups: list[dict] = []
    groups_by_label: dict[str, dict] = {}
    groups_by_id: dict[str, dict] = {}
    option_to_groups: dict[str, list[dict]] = {}

    for group in get_menu_detail_variants(menu_detail):
        if not isinstance(group, dict):
            continue

        label = get_variant_group_label(group)
        normalized_label = normalize_modifier_text(label)
        group_info = {
            "group": group,
            "label": label,
            "normalized_label": normalized_label,
            "group_key": get_variant_group_key(group),
        }
        groups.append(group_info)
        if normalized_label:
            groups_by_label[normalized_label] = group_info
        group_id = normalize_modifier_text(get_variant_group_id(group))
        if group_id:
            groups_by_id[group_id] = group_info

        for option in active_variant_options(group):
            option_name = normalize_modifier_text(option.get("name"))
            if not option_name:
                continue
            option_to_groups.setdefault(option_name, []).append(group_info)

    return {
        "groups": groups,
        "groups_by_label": groups_by_label,
        "groups_by_id": groups_by_id,
        "option_to_groups": option_to_groups,
        "size_candidates": size_candidates,
        "milk_candidates": milk_candidates,
        "addon_candidates": addon_candidates,
    }


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
    group_has_active_options = any(
        isinstance(candidate, dict)
        and candidate.get("name")
        and candidate.get("isActive", True) is not False
        for candidate in (group.get("options") or [])
    )
    if option.get("isActive", True) is False and group_has_active_options:
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


def find_variant_option_in_group(
    group: dict | None,
    candidates: list[str],
    *,
    preferred_size: str | None = None,
    allow_contains: bool = True,
    enforce_preferred_size: bool = False,
) -> dict | None:
    if not isinstance(group, dict):
        return None

    best_option = None
    best_score = 0
    best_overlap = (0, 0.0, 0.0)

    for option in active_variant_options(group):
        score = score_variant_option(
            group,
            option,
            candidates,
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


def build_modifier_candidates_from_menu_detail(
    menu_detail: dict | None,
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
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

            aliases = [normalized_name]
            tokens = normalized_name.split()
            if len(tokens) > 1:
                for i in range(1, len(tokens)):
                    prefix = " ".join(tokens[:i])
                    if len(prefix) >= 3:
                        aliases.append(prefix)

            if group_key == "size":
                if "small" in normalized_name:
                    aliases.extend(["small", "sm", "smol"])
                if "medium" in normalized_name:
                    aliases.extend(["medium", "med", "meduim"])
                if "large" in normalized_name:
                    aliases.extend(["large", "lg"])
                size_candidates[option_name] = list(dict.fromkeys(aliases))
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

    return (
        size_candidates or SIZE_CANDIDATES,
        milk_candidates or MILK_CANDIDATES,
        addon_candidates or ADDON_CANDIDATES,
    )


def _find_entry_group_info(menu_semantics: dict, entry: dict) -> dict | None:
    group_id = normalize_modifier_text(entry.get("group_id"))
    if group_id:
        group_info = (menu_semantics.get("groups_by_id") or {}).get(group_id)
        if group_info:
            return group_info

    group_label = normalize_modifier_text(entry.get("group_label"))
    if group_label:
        group_info = (menu_semantics.get("groups_by_label") or {}).get(group_label)
        if group_info:
            return group_info

    group_hint = normalize_modifier_text(entry.get("group_hint"))
    if not group_hint:
        return None

    matching_groups = [
        group_info
        for group_info in (menu_semantics.get("groups") or [])
        if group_info.get("group_key") == group_hint
    ]
    if len(matching_groups) == 1:
        return matching_groups[0]

    return None


def _find_group_for_option(menu_semantics: dict, option_name: str, preferred_group: dict | None = None) -> dict | None:
    if isinstance(preferred_group, dict):
        preferred_options = {
            normalize_modifier_text(option.get("name"))
            for option in active_variant_options(preferred_group)
            if isinstance(option, dict)
        }
        if normalize_modifier_text(option_name) in preferred_options:
            return preferred_group

    matching_groups = (menu_semantics.get("option_to_groups") or {}).get(
        normalize_modifier_text(option_name),
        [],
    )
    if not matching_groups:
        return None
    return matching_groups[0].get("group")


def _match_suboption_in_option(option: dict | None, requested_value: str | None) -> dict | None:
    if not isinstance(option, dict):
        return None

    normalized_requested = normalize_modifier_text(requested_value)
    if not normalized_requested:
        return None

    best_suboption = None
    best_score = 0
    for suboption in option.get("suboptions") or []:
        if not isinstance(suboption, dict):
            continue
        suboption_name = str(suboption.get("name") or "").strip()
        normalized_suboption = normalize_modifier_text(suboption_name)
        if not normalized_suboption:
            continue
        if normalized_suboption == normalized_requested:
            return suboption
        overlap = _best_token_overlap(suboption_name, [normalized_requested])
        overlap_score = 60 if overlap[0] and (overlap[1] >= 0.6 or overlap[2] >= 0.6) else 0
        if overlap_score > best_score:
            best_score = overlap_score
            best_suboption = suboption

    return best_suboption


def _resolve_customization_entry(
    entry: dict,
    menu_detail: dict | None,
    menu_semantics: dict,
    *,
    preferred_size: str | None = None,
) -> tuple[dict | None, dict | None, dict | None]:
    value = str(entry.get("value") or "").strip()
    if not value:
        return None, None, None

    group_hint = normalize_modifier_text(entry.get("group_hint"))
    target_group_info = _find_entry_group_info(menu_semantics, entry)
    target_group = target_group_info.get("group") if isinstance(target_group_info, dict) else None
    requested_suboption = str(entry.get("suboption_value") or "").strip()

    candidates = [normalize_modifier_text(value)]
    allow_contains = entry.get("kind") == "instruction"
    group_keywords = None
    enforce_preferred_size = False

    if group_hint == "size":
        candidates = expand_candidates(value, menu_semantics.get("size_candidates") or SIZE_CANDIDATES)
        group_keywords = ["size"]
        allow_contains = True
    elif group_hint == "milk":
        candidates = expand_candidates(value, menu_semantics.get("milk_candidates") or MILK_CANDIDATES)
        if preferred_size:
            candidates.extend(
                f"{candidate} {preferred_size}"
                for candidate in list(candidates)
            )
        group_keywords = ["milk"]
        allow_contains = True
        enforce_preferred_size = True
    elif group_hint == "sugar":
        group_keywords = ["sugar"]
        allow_contains = False
    elif group_hint == "addons":
        candidates = expand_candidates(value, menu_semantics.get("addon_candidates") or ADDON_CANDIDATES)
        allow_contains = True
    elif entry.get("kind") == "selection":
        candidates = expand_candidates(value, menu_semantics.get("addon_candidates") or ADDON_CANDIDATES)
        allow_contains = True

    if target_group:
        matched_option = find_variant_option_in_group(
            target_group,
            candidates,
            preferred_size=preferred_size,
            allow_contains=allow_contains,
            enforce_preferred_size=enforce_preferred_size,
        )
        if matched_option:
            matched_suboption = _match_suboption_in_option(matched_option, requested_suboption)
            return target_group, matched_option, matched_suboption

    matched_option = find_variant_option(
        menu_detail,
        candidates,
        group_keywords=group_keywords,
        preferred_size=preferred_size,
        allow_contains=allow_contains,
        enforce_preferred_size=enforce_preferred_size,
    )
    if not matched_option:
        return None, None, None

    matched_group = _find_group_for_option(
        menu_semantics,
        matched_option.get("name"),
        preferred_group=target_group,
    )
    matched_suboption = _match_suboption_in_option(matched_option, requested_suboption)
    return matched_group, matched_option, matched_suboption
