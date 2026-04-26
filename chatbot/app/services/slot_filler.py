import re
from typing import TypedDict

from app.services.menu_utils import active_variant_options, normalize_modifier_text


class SelectedOption(TypedDict):
    optionName: str
    suboptionName: str | None
    groupId: str


SlotState = dict[str, list[SelectedOption]]

INTENSITY_WORDS = {"less", "light", "regular", "normal", "extra", "more", "double"}
NEGATION_PREFIXES = ("no ", "without ", "remove ", "take out ", "skip ")
REPLACEMENT_PREFIXES = ("change to ", "swap to ", "switch to ", "actually ", "make it ")
REPLACEMENT_WORDS = ("instead", "change to", "swap to", "switch to", "actually", "make it")


def init_slot_state(groups_meta: list[dict]) -> SlotState:
    return {
        str(group.get("groupId")): []
        for group in groups_meta or []
        if _is_active_group(group)
    }


def fill_slots_from_text(
    user_text: str,
    groups_meta: list[dict],
    current_slot_state: SlotState,
) -> tuple[SlotState, list[str], list[str]]:
    updated_slot_state = _copy_slot_state_with_groups(current_slot_state, groups_meta)
    applied: list[str] = []
    unmatched: list[str] = []

    raw_segments = _split_segments(user_text)
    segments: list[tuple[str, bool]] = []
    for raw_segment in raw_segments:
        target_text, force_replace = _extract_replacement_target(raw_segment)
        segments.append((target_text, force_replace))

    for raw_segment, force_replace in segments:
        segment = normalize_modifier_text(raw_segment)
        if not segment:
            continue

        is_negation, segment = _strip_negation_prefix(segment)
        intensity, option_text = _extract_intensity(segment)
        if not option_text:
            # The whole segment was consumed as an intensity word (e.g. "medium",
            # "extra"). Try matching it directly as a variant option before giving up.
            if _find_best_option(segment, groups_meta):
                intensity = None
                option_text = segment
            else:
                unmatched.append(segment)
                continue

        match = _find_best_option(option_text, groups_meta)
        if not match:
            unmatched.append(segment)
            continue

        group, option = match
        group_id = str(group.get("groupId") or "")
        option_name = str(option.get("name") or "").strip()
        if not group_id or not option_name:
            unmatched.append(segment)
            continue

        updated_slot_state.setdefault(group_id, [])

        if is_negation:
            before_count = len(updated_slot_state[group_id])
            updated_slot_state[group_id] = [
                entry
                for entry in updated_slot_state[group_id]
                if normalize_modifier_text(entry.get("optionName")) != normalize_modifier_text(option_name)
            ]
            if before_count != len(updated_slot_state[group_id]):
                applied.append(f"Removed {option_name}")
            else:
                applied.append(f"Removed {option_name}")
            continue

        suboption_name = None
        if intensity:
            suboption_name = _match_suboption(option, intensity)
            if suboption_name is None:
                unmatched.append(intensity)

        selected: SelectedOption = {
            "optionName": option_name,
            "suboptionName": suboption_name,
            "groupId": group_id,
        }
        _apply_selection(
            updated_slot_state,
            group,
            selected,
            replace=force_replace,
        )
        applied.append(_applied_label(option_name, suboption_name))

    return updated_slot_state, applied, unmatched


def fill_slots_from_fragments(
    fragments: list[str],
    groups_meta: list[dict],
    current_slot_state: SlotState,
) -> tuple[SlotState, list[str], list[str]]:
    normalized_fragments = [
        str(fragment or "").strip()
        for fragment in fragments or []
        if str(fragment or "").strip()
    ]
    updated_slot_state = _copy_slot_state_with_groups(current_slot_state, groups_meta)
    applied: list[str] = []
    unmatched: list[str] = []

    index = 0
    while index < len(normalized_fragments):
        fragment = normalized_fragments[index]
        if index + 1 < len(normalized_fragments):
            combined = f"{fragment} {normalized_fragments[index + 1]}".strip()
            if _has_exact_option_match(combined, groups_meta):
                updated_slot_state, fragment_applied, fragment_unmatched = fill_slots_from_text(
                    combined,
                    groups_meta,
                    updated_slot_state,
                )
                applied.extend(fragment_applied)
                unmatched.extend(fragment_unmatched)
                index += 2
                continue

        updated_slot_state, fragment_applied, fragment_unmatched = fill_slots_from_text(
            fragment,
            groups_meta,
            updated_slot_state,
        )
        applied.extend(fragment_applied)
        unmatched.extend(fragment_unmatched)
        index += 1

    return updated_slot_state, applied, unmatched


def slot_state_to_selected_options(
    slot_state: SlotState,
    groups_meta: list[dict],
) -> list[dict]:
    result: list[dict] = []
    for group in _active_groups(groups_meta):
        group_id = str(group.get("groupId") or "")
        entries = slot_state.get(group_id) or []
        ordered_entries = _order_entries_for_group(entries, group)
        for entry in ordered_entries:
            item = {
                "optionName": entry.get("optionName"),
                "groupId": entry.get("groupId") or group_id,
            }
            if entry.get("suboptionName") is not None:
                item["suboptionName"] = entry.get("suboptionName")
            result.append(item)
    return result


def get_empty_required_groups(
    slot_state: SlotState,
    groups_meta: list[dict],
) -> list[dict]:
    return [
        group
        for group in _active_groups(groups_meta)
        if group.get("isRequired") is True
        and not slot_state.get(str(group.get("groupId") or ""), [])
    ]


def auto_fill_single_option_groups(
    slot_state: SlotState,
    groups_meta: list[dict],
) -> tuple[SlotState, list[str]]:
    """For required groups with exactly one active option, auto-select it silently."""
    auto_applied: list[str] = []
    for group in _active_groups(groups_meta):
        if group.get("isRequired") is not True:
            continue
        group_id = str(group.get("groupId") or "")
        if slot_state.get(group_id):
            continue
        active_opts = list(active_variant_options(group))
        if len(active_opts) != 1:
            continue
        option = active_opts[0]
        option_name = str(option.get("name") or "").strip()
        if not option_name:
            continue
        selected: SelectedOption = {
            "optionName": option_name,
            "suboptionName": None,
            "groupId": group_id,
        }
        slot_state.setdefault(group_id, []).append(selected)
        auto_applied.append(option_name)
    return slot_state, auto_applied


def slot_state_summary(
    slot_state: SlotState,
    groups_meta: list[dict],
) -> str:
    labels = [
        _summary_label(entry.get("optionName") or "", entry.get("suboptionName"))
        for entry in slot_state_to_selected_options(slot_state, groups_meta)
    ]
    return ", ".join(label for label in labels if label) or "no customizations yet"


def reconstruct_slot_state_from_cart(
    selected_options: list[dict],
    groups_meta: list[dict],
) -> SlotState:
    slot_state = init_slot_state(groups_meta)
    for entry in selected_options or []:
        if not isinstance(entry, dict):
            continue
        option_name = str(entry.get("optionName") or "").strip()
        if not option_name:
            continue

        group = _find_group_for_cart_entry(entry, groups_meta)
        if not group:
            continue
        group_id = str(group.get("groupId") or "")
        if not group_id:
            continue

        selected: SelectedOption = {
            "optionName": option_name,
            "suboptionName": entry.get("suboptionName"),
            "groupId": group_id,
        }
        slot_state.setdefault(group_id, []).append(selected)
    return slot_state


def build_group_prompt(
    item_name: str,
    group: dict,
    *,
    is_first: bool = False,
) -> str:
    label = _clean_group_label(group)
    options = ", ".join(_format_option_for_prompt(option) for option in active_variant_options(group))
    if is_first:
        prompt = f"What {label} would you like for your {item_name}? Options: {options}."
    else:
        prompt = f"What {label} would you like? Options: {options}."

    max_selections = group.get("maxSelections")
    if isinstance(max_selections, int) and max_selections > 1:
        prompt += f" You can choose up to {max_selections}."
    return prompt


def build_open_customization_prompt(
    item_name: str,
    slot_state: SlotState,
    groups_meta: list[dict],
) -> str:
    summary = slot_state_summary(slot_state, groups_meta)
    optional_groups = [
        group
        for group in _active_groups(groups_meta)
        if group.get("isRequired") is not True
    ]
    selected_groups = [
        group
        for group in optional_groups
        if slot_state.get(str(group.get("groupId") or ""))
    ]
    unselected_groups = [
        group
        for group in optional_groups
        if not slot_state.get(str(group.get("groupId") or ""))
    ]

    lines = [f"Got it! Here's what I have for your {item_name}: {summary}."]
    if optional_groups:
        lines.append("")
        lines.append("Would you like to add anything else?")
        lines.append("")
        for group in selected_groups + unselected_groups:
            header, options = _format_optional_group_lines(group, slot_state)
            lines.append(header)
            lines.append(options)
            lines.append("")
        lines.append("Say 'done' to add to cart.")
    else:
        lines.append(f"Any special instructions for your {item_name}? Say 'none' to skip.")
    return "\n".join(lines)


def build_suboption_prompt(
    item_name: str,
    option_name: str,
    suboptions: list[dict],
) -> str:
    option_names = [
        str(suboption.get("name") or "").strip()
        for suboption in suboptions or []
        if isinstance(suboption, dict) and str(suboption.get("name") or "").strip()
    ]
    return f"How would you like your {option_name}? Options: {', '.join(option_names)}."


def _is_active_group(group: dict) -> bool:
    return (
        isinstance(group, dict)
        and group.get("isActive") is True
        and _has_active_option(group)
        and bool(group.get("groupId"))
    )


def _has_active_option(group: dict) -> bool:
    return any(
        isinstance(option, dict)
        and bool(option.get("name"))
        and option.get("isActive") is not False
        for option in group.get("options") or []
    )


def _active_groups(groups_meta: list[dict]) -> list[dict]:
    return [group for group in groups_meta or [] if _is_active_group(group)]


def _copy_slot_state_with_groups(slot_state: SlotState, groups_meta: list[dict]) -> SlotState:
    copied = {
        str(group.get("groupId") or ""): [
            {
                "optionName": str(entry.get("optionName") or ""),
                "suboptionName": entry.get("suboptionName"),
                "groupId": str(entry.get("groupId") or group.get("groupId") or ""),
            }
            for entry in (slot_state or {}).get(str(group.get("groupId") or ""), [])
            if isinstance(entry, dict)
        ]
        for group in _active_groups(groups_meta)
    }
    for group_id, entries in (slot_state or {}).items():
        copied.setdefault(str(group_id), list(entries or []))
    return copied


def _split_segments(value: str) -> list[str]:
    return [
        segment.strip()
        for segment in re.split(r"\s+and\s+|,", value or "", flags=re.IGNORECASE)
        if segment and segment.strip()
    ]


def _extract_replacement_target(value: str) -> tuple[str, bool]:
    normalized = normalize_modifier_text(value)
    if not normalized or not any(signal in normalized for signal in REPLACEMENT_WORDS):
        return value, False

    target = normalized
    for prefix in REPLACEMENT_PREFIXES:
        if prefix in target:
            target = target.split(prefix, 1)[1]
            break
    target = target.replace(" instead", "").replace("instead ", "").strip()
    return target, bool(target)


def _strip_negation_prefix(segment: str) -> tuple[bool, str]:
    for prefix in NEGATION_PREFIXES:
        if segment.startswith(prefix):
            return True, segment[len(prefix):].strip()
    return False, segment


def _extract_intensity(segment: str) -> tuple[str | None, str]:
    tokens = segment.split()
    if not tokens:
        return None, segment
    if tokens[0] in INTENSITY_WORDS:
        return tokens[0], " ".join(tokens[1:]).strip()
    if tokens[-1] in INTENSITY_WORDS:
        return tokens[-1], " ".join(tokens[:-1]).strip()
    return None, segment


def _find_best_option(option_text: str, groups_meta: list[dict]) -> tuple[dict, dict] | None:
    normalized_text = normalize_modifier_text(option_text)
    if not normalized_text:
        return None

    best_match = None
    best_score = (0, 0)
    for group in _active_groups(groups_meta):
        for option in active_variant_options(group):
            option_name = str(option.get("name") or "").strip()
            normalized_option = normalize_modifier_text(option_name)
            if not normalized_option:
                continue

            score = _match_score(normalized_text, normalized_option)
            specificity = len(normalized_option)
            if score > 0 and (score, specificity) > best_score:
                best_score = (score, specificity)
                best_match = (group, option)

    # Guard: if the best active match is not exact, check whether any hidden
    # option in the same group scores at least as high. If so the user named
    # the hidden option; returning None lets guided ordering ask explicitly
    # rather than silently substituting a similar-named active option.
    if best_match is not None and best_score[0] < 100:
        best_group, _ = best_match
        for option in best_group.get("options") or []:
            if not isinstance(option, dict) or option.get("isActive") is not False:
                continue
            hidden_name = normalize_modifier_text(str(option.get("name") or "").strip())
            if hidden_name and _match_score(normalized_text, hidden_name) >= best_score[0]:
                return None

    return best_match


def _has_exact_option_match(option_text: str, groups_meta: list[dict]) -> bool:
    normalized_text = normalize_modifier_text(option_text)
    if not normalized_text:
        return False
    for group in _active_groups(groups_meta):
        for option in active_variant_options(group):
            if normalize_modifier_text(option.get("name")) == normalized_text:
                return True
    return False


def find_hidden_option_name(option_text: str, groups_meta: list[dict]) -> str | None:
    """Return the display name of a hidden option that matches option_text, or None.

    Handles intensity-prefixed input (e.g. "extra tea bag" → tries "tea bag") and
    groups where every option is hidden (group-active but no active options).
    """
    normalized_text = normalize_modifier_text(option_text)
    if not normalized_text:
        return None

    # Try the full text, then the text with its intensity prefix stripped.
    candidates = [normalized_text]
    intensity, stripped = _extract_intensity(normalized_text)
    if intensity and stripped:
        candidates.append(stripped)

    for candidate in candidates:
        result = _find_hidden_option_name_for(candidate, groups_meta)
        if result:
            return result
    return None


def _find_hidden_option_name_for(normalized_text: str, groups_meta: list[dict]) -> str | None:
    # Pass 1: find best active match; if non-exact, check same group for a
    # hidden option that scores at least as high (the normal substitution case).
    best_active_match: tuple[dict, dict] | None = None
    best_score = (0, 0)
    for group in _active_groups(groups_meta):
        for option in active_variant_options(group):
            option_name = str(option.get("name") or "").strip()
            normalized_option = normalize_modifier_text(option_name)
            if not normalized_option:
                continue
            score = _match_score(normalized_text, normalized_option)
            specificity = len(normalized_option)
            if score > 0 and (score, specificity) > best_score:
                best_score = (score, specificity)
                best_active_match = (group, option)

    if best_active_match is not None and best_score[0] < 100:
        best_group, _ = best_active_match
        for option in best_group.get("options") or []:
            if not isinstance(option, dict) or option.get("isActive") is not False:
                continue
            hidden_name = str(option.get("name") or "").strip()
            hidden_norm = normalize_modifier_text(hidden_name)
            if hidden_norm and _match_score(normalized_text, hidden_norm) >= best_score[0]:
                return hidden_name

    # Pass 2: check groups that are group-level active but have ALL options
    # hidden (e.g. "Tea Bag" add-on group where the option is out of stock).
    for group in (groups_meta or []):
        if not isinstance(group, dict) or group.get("isActive") is not True:
            continue
        if _has_active_option(group):
            continue
        for option in (group.get("options") or []):
            if not isinstance(option, dict) or option.get("isActive") is not False:
                continue
            hidden_name = str(option.get("name") or "").strip()
            hidden_norm = normalize_modifier_text(hidden_name)
            if hidden_norm and _match_score(normalized_text, hidden_norm) > 0:
                return hidden_name

    return None


def _match_score(segment: str, option_name: str) -> int:
    if segment == option_name:
        return 100
    if _contains_whole_phrase(segment, option_name) or _contains_whole_phrase(option_name, segment):
        return 80

    segment_tokens = set(segment.split())
    option_tokens = set(option_name.split())
    if not segment_tokens or not option_tokens:
        return 0
    overlap = segment_tokens & option_tokens
    if len(overlap) / len(option_tokens) >= 0.6 or len(overlap) / len(segment_tokens) >= 0.6:
        return 60
    return 0


def _contains_whole_phrase(lhs: str, rhs: str) -> bool:
    if not lhs or not rhs:
        return False
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(lhs)}(?![a-z0-9])", rhs))


def _match_suboption(option: dict, requested: str | None) -> str | None:
    requested_normalized = normalize_modifier_text(requested)
    if requested_normalized == "normal":
        requested_normalized = "regular"
    if not requested_normalized:
        return None

    for suboption in option.get("suboptions") or []:
        if not isinstance(suboption, dict):
            continue
        suboption_name = str(suboption.get("name") or "").strip()
        if normalize_modifier_text(suboption_name) == requested_normalized:
            return suboption_name
    return None


def _apply_selection(
    slot_state: SlotState,
    group: dict,
    selected: SelectedOption,
    *,
    replace: bool,
) -> None:
    group_id = selected["groupId"]
    max_selections = group.get("maxSelections")
    entries = slot_state.setdefault(group_id, [])
    should_replace = replace or max_selections == 1

    if should_replace:
        slot_state[group_id] = [selected]
        return

    duplicate = any(
        normalize_modifier_text(entry.get("optionName")) == normalize_modifier_text(selected["optionName"])
        and normalize_modifier_text(entry.get("suboptionName")) == normalize_modifier_text(selected["suboptionName"])
        for entry in entries
    )
    if not duplicate:
        entries.append(selected)


def _applied_label(option_name: str, suboption_name: str | None) -> str:
    if suboption_name:
        return f"{option_name} ({suboption_name})"
    return option_name


def _summary_label(option_name: str, suboption_name: str | None) -> str:
    if not suboption_name:
        return option_name
    if normalize_modifier_text(suboption_name) in INTENSITY_WORDS:
        return f"{suboption_name} {option_name}"
    return f"{option_name} ({suboption_name})"


def _order_entries_for_group(entries: list[SelectedOption], group: dict) -> list[SelectedOption]:
    option_order = {
        normalize_modifier_text(option.get("name")): index
        for index, option in enumerate(active_variant_options(group))
    }
    return sorted(
        entries,
        key=lambda entry: option_order.get(
            normalize_modifier_text(entry.get("optionName")),
            len(option_order),
        ),
    )


def _find_group_for_cart_entry(entry: dict, groups_meta: list[dict]) -> dict | None:
    group_id = str(entry.get("groupId") or "").strip()
    if group_id:
        for group in _active_groups(groups_meta):
            if str(group.get("groupId") or "") == group_id:
                return group

    option_name = normalize_modifier_text(entry.get("optionName"))
    if not option_name:
        return None
    for group in _active_groups(groups_meta):
        for option in active_variant_options(group):
            if normalize_modifier_text(option.get("name")) == option_name:
                return group
    return None


def _clean_group_label(group: dict) -> str:
    raw_label = str(group.get("customerLabel") or group.get("name") or "").strip()
    label = re.sub(r"^(choose|select|pick)\s+", "", raw_label, flags=re.IGNORECASE).strip()
    return normalize_modifier_text(label) or "option"


def _format_option_for_prompt(option: dict) -> str:
    name = str(option.get("name") or "").strip()
    price = _option_price(option)
    if price > 0:
        return f"{name} (+L.L {price:,})"
    return name


def _format_optional_group_lines(group: dict, slot_state: SlotState) -> tuple[str, str]:
    label = _display_group_label(group)
    group_id = str(group.get("groupId") or "")
    entries = slot_state.get(group_id) or []
    current = ""
    if entries:
        current = f" (currently: {', '.join(_summary_label(entry.get('optionName') or '', entry.get('suboptionName')) for entry in entries)})"

    options = ", ".join(_format_open_option(option) for option in active_variant_options(group))
    return f"{label}{current}:", options


def _display_group_label(group: dict) -> str:
    label = str(group.get("customerLabel") or group.get("name") or "").strip()
    return re.sub(r"^(choose|select|pick)\s+", "", label, flags=re.IGNORECASE).strip() or "Options"


def _format_open_option(option: dict) -> str:
    name = str(option.get("name") or "").strip()
    suboptions = [
        str(suboption.get("name") or "").strip()
        for suboption in option.get("suboptions") or []
        if isinstance(suboption, dict) and str(suboption.get("name") or "").strip()
    ]
    if suboptions:
        return f"{name} ({'/'.join(suboptions)})"
    price = _option_price(option)
    if price > 0:
        return f"{name} (+L.L {price:,})"
    return name


def _option_price(option: dict) -> int:
    price = option.get("additionalPrice")
    if price is None and isinstance(option.get("suboptions"), list):
        prices = [
            suboption.get("additionalPrice")
            for suboption in option.get("suboptions") or []
            if isinstance(suboption, dict) and isinstance(suboption.get("additionalPrice"), (int, float))
        ]
        price = max(prices) if prices else 0
    if isinstance(price, (int, float)):
        return int(price)
    return 0
