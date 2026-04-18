import json
import logging
import os
import re
from typing import Optional, Dict, Any

import google.generativeai as genai

from app.core.config import settings
from app.utils.log_redaction import redact
from app.utils.gemini_utils import _normalize_gemini_model_name

logger = logging.getLogger(__name__)

WORD_TO_NUMBER = {
    "a": 1,
    "an": 1,
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

SIZE_ALIASES = {
    "small": "small",
    "medium": "medium",
    "med": "medium",
    "large": "large",
}

MILK_CANONICAL = {
    "almond milk": "almond milk",
    "oat milk": "oat milk",
    "soy milk": "soy milk",
    "skim milk": "skim milk",
    "whole milk": "whole milk",
    "regular milk": "regular milk",
    "full fat": "full fat",
    "lactose free": "lactose free",
    "coconut milk": "coconut milk",
}

SUGAR_CANONICAL = {
    "no sugar": "no sugar",
    "without sugar": "no sugar",
    "less sugar": "less sugar",
    "light sugar": "less sugar",
    "extra sugar": "extra sugar",
    "sugar free": "sugar free",
}

ADDON_CANONICAL = {
    "extra shot": "extra shot",
    "add shot": "extra shot",
    "vanilla syrup": "vanilla syrup",
    "vanilla": "vanilla syrup",
    "caramel syrup": "caramel syrup",
    "caramel": "caramel syrup",
    "caramel sugar free": "caramel sugar free",
    "vanilla sugar free": "vanilla sugar free",
    "hazelnut": "hazelnut",
    "white mocha": "white mocha",
    "mocha": "mocha",
    "whipped cream": "whipped cream",
    "caramel drizzle": "caramel drizzle",
    "chocolate drizzle": "chocolate drizzle",
    "chocolate chips": "chocolate chips",
    "extra bag": "extra bag",
    "decaf": "decaf",
    "decaffe": "decaf",
    "shot decaffe": "decaf",
    "yirgacheffe shot": "yirgacheffe shot",
}

INSTRUCTION_CANONICAL = {
    "extra hot": "extra hot",
    "less ice": "less ice",
    "light ice": "light ice",
    "extra ice": "extra ice",
    "no ice": "no ice",
    "light foam": "light foam",
    "less foam": "less foam",
    "extra foam": "extra foam",
    "no foam": "no foam",
    "no whip": "no whip",
    "no warming": "no warming",
    "not warmed": "no warming",
    "not warmed up": "no warming",
    "unwarmed": "no warming",
    "on the side": "on the side",
}

MODIFIER_LEADS = {
    "with",
    "without",
    "no",
    "less",
    "light",
    "extra",
    "almond",
    "oat",
    "soy",
    "skim",
    "whole",
    "regular",
    "full",
    "lactose",
    "coconut",
    "vanilla",
    "caramel",
    "hazelnut",
    "white",
    "mocha",
    "chocolate",
    "whipped",
    "decaf",
    "decaffe",
    "yirgacheffe",
    "on",
}

import time as _time

# ── Menu vocabulary cache ─────────────────────────────────────────
# A condensed text summary of the menu injected into every LLM
# classification prompt. Refreshed every 10 minutes.

_MENU_VOCAB_CACHE: str = ""
_MENU_VOCAB_TIMESTAMP: float = 0.0
_MENU_VOCAB_TTL: float = 600.0  # 10 minutes


async def _get_menu_vocab_block() -> str:
    """
    Returns a condensed menu vocabulary block for injection into
    the LLM classification prompt.

    Format:
        Menu categories: Coffee, Tea, Yogurt, Sandwiches, ...
        Menu items (sample): Latte, Espresso, Americano, ...
        Known variant options: Small, Medium, Large, Full Fat,
            Skim Milk, Oat Milk, Almond Milk, Granola, Honey, ...

    Capped at a safe token budget — item list is limited to 40,
    variant options to 60. Returns empty string on failure so the
    prompt still works without menu context.
    """
    global _MENU_VOCAB_CACHE, _MENU_VOCAB_TIMESTAMP

    now = _time.monotonic()
    if (
        _MENU_VOCAB_CACHE
        and (now - _MENU_VOCAB_TIMESTAMP) < _MENU_VOCAB_TTL
    ):
        return _MENU_VOCAB_CACHE

    try:
        from app.services.tools import fetch_menu_items, fetch_menu_item_detail

        menu_items = await fetch_menu_items()
        if not menu_items:
            return ""

        # Collect categories
        categories: list[str] = []
        seen_cats: set[str] = set()
        for item in menu_items:
            if not isinstance(item, dict):
                continue
            cat = item.get("category")
            cat_name = (
                cat.get("name") if isinstance(cat, dict) else str(cat or "")
            ).strip()
            if cat_name and cat_name.lower() not in seen_cats:
                seen_cats.add(cat_name.lower())
                categories.append(cat_name)

        # Collect item names (cap at 40)
        item_names: list[str] = []
        seen_names: set[str] = set()
        for item in menu_items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if name and name.lower() not in seen_names:
                seen_names.add(name.lower())
                item_names.append(name)
            if len(item_names) >= 40:
                break

        # Collect variant option names from a sample of items
        # Fetch detail for up to 8 items to get variant coverage
        # without too many API calls
        option_names: list[str] = []
        seen_options: set[str] = set()
        sample_items = [
            item for item in menu_items
            if isinstance(item, dict) and item.get("id")
        ][:8]

        for sample_item in sample_items:
            item_id = sample_item.get("id") or sample_item.get("_id")
            if item_id is None:
                continue
            try:
                detail = await fetch_menu_item_detail(item_id)
                if not isinstance(detail, dict):
                    continue
                variants = detail.get("variantGroupDetails") or \
                           detail.get("variants") or []
                for group in variants:
                    if not isinstance(group, dict):
                        continue
                    if group.get("isActive") is False:
                        continue
                    for option in (group.get("options") or []):
                        if not isinstance(option, dict):
                            continue
                        if option.get("isActive") is False:
                            continue
                        opt_name = str(option.get("name") or "").strip()
                        if opt_name and opt_name.lower() not in seen_options:
                            seen_options.add(opt_name.lower())
                            option_names.append(opt_name)
                        if len(option_names) >= 60:
                            break
                    if len(option_names) >= 60:
                        break
            except Exception:
                continue
            if len(option_names) >= 60:
                break

        # Build the vocab block
        lines: list[str] = []
        if categories:
            lines.append(
                f"Menu categories: {', '.join(categories)}"
            )
        if item_names:
            lines.append(
                f"Menu items (sample): {', '.join(item_names)}"
            )
        if option_names:
            lines.append(
                f"Known variant options: {', '.join(option_names)}"
            )

        if not lines:
            return ""

        vocab_block = (
            "Current menu context (use this to recognize item names, "
            "categories, and variant options):\n"
            + "\n".join(lines)
        )

        _MENU_VOCAB_CACHE = vocab_block
        _MENU_VOCAB_TIMESTAMP = now
        logger.info({
            "stage": "menu_vocab_cache_refreshed",
            "categories": len(categories),
            "items": len(item_names),
            "options": len(option_names),
        })
        return vocab_block

    except Exception as exc:
        logger.warning({
            "stage": "menu_vocab_cache_failed",
            "error": str(exc),
        })
        return ""


def _normalize_phrase(value: Any) -> str:
    if value is None:
        return ""

    normalized = re.sub(r"[^a-z0-9\s]+", " ", str(value).lower())
    return " ".join(normalized.split())


def _unique_strings(values: list[str]) -> list[str]:
    unique_values = []
    seen = set()

    for value in values:
        cleaned_value = str(value).strip()
        normalized_value = _normalize_phrase(cleaned_value)
        if not cleaned_value or not normalized_value or normalized_value in seen:
            continue
        seen.add(normalized_value)
        unique_values.append(cleaned_value)

    return unique_values


def _has_customization_data(item: dict[str, Any]) -> bool:
    options = item.get("options") if isinstance(item.get("options"), dict) else {}
    addons = item.get("addons") if isinstance(item.get("addons"), list) else []
    instructions = item.get("instructions")

    return bool(
        item.get("size")
        or any(value for value in options.values())
        or addons
        or (isinstance(instructions, str) and instructions.strip())
    )


def _base_item() -> Dict[str, Any]:
    return {
        "item_name": None,
        "quantity": None,
        "size": None,
        "options": {
            "milk": None,
        },
        "addons": [],
        "instructions": "",
    }


def _base_result() -> Dict[str, Any]:
    return {
        "intent": "unknown",
        "items": [],
        "confidence": 0.0,
        "fallback_needed": True,
    }


def _normalize_item(item: Any, default_quantity: int | None = None) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None

    normalized_item = _base_item()
    normalized_item.update(item)
    if item.get("item_query") and not item.get("item_name"):
        normalized_item["item_name"] = str(item.get("item_query") or "").strip()
    if isinstance(item.get("options"), dict):
        normalized_item["options"].update(item["options"])

    addon_values = []
    raw_addons = item.get("addons")
    if isinstance(raw_addons, list):
        addon_values.extend(str(addon).strip() for addon in raw_addons if str(addon).strip())
    elif isinstance(raw_addons, str) and raw_addons.strip():
        addon_values.append(raw_addons.strip())

    size_words = {"small", "medium", "large", "regular", "tall", "grande", "venti", "short", "xl", "extra large"}
    for modifier in item.get("modifiers") or []:
        cleaned_modifier = str(modifier).strip()
        lowered_modifier = cleaned_modifier.lower()
        if not cleaned_modifier:
            continue
        if not normalized_item.get("size") and lowered_modifier in size_words:
            normalized_item["size"] = cleaned_modifier
        elif not normalized_item["options"].get("milk") and "milk" in lowered_modifier:
            normalized_item["options"]["milk"] = cleaned_modifier
        else:
            addon_values.append(cleaned_modifier)
    normalized_item["addons"] = _unique_strings(addon_values)

    if isinstance(item.get("instructions"), list):
        normalized_item["instructions"] = "; ".join(
            str(value).strip() for value in item["instructions"] if str(value).strip()
        )
    elif isinstance(item.get("instructions"), str):
        normalized_item["instructions"] = item["instructions"].strip()
    else:
        normalized_item["instructions"] = ""
    if isinstance(item.get("notes"), list):
        notes_text = "; ".join(str(value).strip() for value in item["notes"] if str(value).strip())
        if notes_text:
            normalized_item["instructions"] = (
                f"{normalized_item['instructions']}; {notes_text}".strip("; ")
                if normalized_item["instructions"] else notes_text
            )

    if normalized_item.get("quantity") is None and default_quantity is not None:
        normalized_item["quantity"] = default_quantity
    if isinstance(normalized_item.get("item_name"), str):
        normalized_item["item_name"] = normalized_item["item_name"].strip()

    follow_up_ref = str(item.get("follow_up_ref") or "").strip()
    if follow_up_ref:
        normalized_item["follow_up_ref"] = follow_up_ref
    if not normalized_item.get("item_name") and not follow_up_ref:
        return None
    return normalized_item


def _normalize_items(parsed: dict) -> list[Dict[str, Any]]:
    normalized_items = []
    default_quantity = 1

    if parsed.get("intent") in {"update_quantity", "remove_item"}:
        default_quantity = None

    if isinstance(parsed.get("items"), list):
        for item in parsed["items"]:
            normalized_item = _normalize_item(item, default_quantity=default_quantity)
            if normalized_item:
                normalized_items.append(normalized_item)

    if normalized_items:
        return normalized_items

    legacy_item = _normalize_item(parsed, default_quantity=default_quantity)
    return [legacy_item] if legacy_item else []


def _extract_json_object(text: str) -> Optional[dict]:
    if not text:
        return None

    text = text.strip()

    # Remove ```json ... ``` fences if Gemini adds them
    text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    # Try direct parse first
    try:
        return json.loads(text)
    except Exception:
        pass

    # Fallback: grab first {...} block
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def _normalize_add_message(message: str) -> str:
    message = (message or "").lower().strip()
    message = re.sub(r"[.!?]+", "", message)
    message = re.sub(
        r"^(i would like to order|i would like to add|i would like to|i d like to order|i d like to add|i d like to|get me|i want to order|i want to add|i want|could i get|could i have|can i get|can i have|please)\s+",
        "",
        message,
    )
    message = re.sub(r"^(order|add|get)\s+", "", message)
    return message.strip()


def _looks_like_modifier_continuation(segment: str) -> bool:
    if not segment:
        return False

    words = segment.split()
    if not words:
        return False

    if words[0] in MODIFIER_LEADS:
        return True

    normalized_segment = _normalize_phrase(segment)
    phrases = (
        list(MILK_CANONICAL)
        + list(SUGAR_CANONICAL)
        + list(ADDON_CANONICAL)
        + list(INSTRUCTION_CANONICAL)
    )

    return any(
        normalized_segment.startswith(_normalize_phrase(phrase))
        for phrase in phrases
    )


def _split_add_segments(normalized_message: str) -> list[str]:
    comma_segments = [segment.strip() for segment in normalized_message.split(",") if segment.strip()]
    segments: list[str] = []

    for comma_segment in comma_segments:
        and_parts = [
            part.strip()
            for part in re.split(r"\s+\band\b\s+", comma_segment)
            if part.strip()
        ]
        if not and_parts:
            continue

        current_segment = and_parts[0]
        for next_segment in and_parts[1:]:
            if _looks_like_modifier_continuation(next_segment):
                current_segment = f"{current_segment} and {next_segment}"
            else:
                segments.append(current_segment.strip())
                current_segment = next_segment

        segments.append(current_segment.strip())

    return segments


def _extract_first_match(segment: str, phrase_map: dict[str, str]) -> tuple[str | None, str]:
    normalized_segment = _normalize_phrase(segment)

    for phrase in sorted(phrase_map.keys(), key=len, reverse=True):
        normalized_phrase = _normalize_phrase(phrase)
        pattern = rf"\b{re.escape(normalized_phrase)}\b"
        if re.search(pattern, normalized_segment):
            updated_segment = re.sub(pattern, " ", normalized_segment, count=1)
            return phrase_map[phrase], " ".join(updated_segment.split())

    return None, normalized_segment


def _extract_repeated_matches(segment: str, phrase_map: dict[str, str]) -> tuple[list[str], str]:
    normalized_segment = _normalize_phrase(segment)
    matches: list[str] = []

    for phrase in sorted(phrase_map.keys(), key=len, reverse=True):
        normalized_phrase = _normalize_phrase(phrase)
        pattern = rf"\b{re.escape(normalized_phrase)}\b"

        while re.search(pattern, normalized_segment):
            matches.append(phrase_map[phrase])
            normalized_segment = re.sub(pattern, " ", normalized_segment, count=1)

    return _unique_strings(matches), " ".join(normalized_segment.split())


def _parse_add_item_segment(segment: str) -> Dict[str, Any] | None:
    segment = _normalize_phrase(segment)
    if not segment:
        return None

    segment = re.sub(r"^(to\s+)?(order|add|get)\s+", "", segment).strip()
    if not segment:
        return None

    quantity = 1
    match = re.match(
        r"^(?P<qty>\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?P<name>.+)$",
        segment,
    )
    if match:
        quantity = WORD_TO_NUMBER.get(match.group("qty"), None)
        if quantity is None:
            quantity = int(match.group("qty"))
        segment = match.group("name").strip()

    size, segment = _extract_first_match(segment, SIZE_ALIASES)
    sugar, segment = _extract_first_match(segment, SUGAR_CANONICAL)
    instruction_parts, segment = _extract_repeated_matches(segment, INSTRUCTION_CANONICAL)
    if sugar:
        instruction_parts.append(sugar)

    modifier_source = ""
    modifier_match = re.search(r"\b(with|without)\b", segment)
    if modifier_match:
        modifier_source = segment[modifier_match.end():].strip()
        segment = segment[:modifier_match.start()].strip()
    elif " and " in segment:
        base_candidate, modifier_candidate = segment.rsplit(" and ", 1)
        if _looks_like_modifier_continuation(modifier_candidate):
            segment = base_candidate.strip()
            modifier_source = modifier_candidate.strip()

    milk, modifier_source = _extract_first_match(modifier_source, MILK_CANONICAL)
    addons, modifier_source = _extract_repeated_matches(modifier_source, ADDON_CANONICAL)

    leftover_modifier = re.sub(r"\b(and)\b", " ", modifier_source).strip()
    if leftover_modifier:
        instruction_parts.append(leftover_modifier)

    item_name = re.sub(r"\b(with|without|and)\b", " ", segment)
    item_name = " ".join(item_name.split())
    if not item_name:
        return None

    return {
        "item_name": item_name,
        "quantity": quantity,
        "size": size,
        "options": {
            "milk": milk,
        },
        "addons": addons,
        "instructions": ", ".join(instruction_parts),
    }


def _looks_like_add_request(message: str) -> bool:
    return bool(
        re.search(
            r"\b(add|get|order)\b|want to (?:add|order)|would like to (?:add|order)",
            (message or "").lower(),
        )
    )


def _extract_add_items_from_message(message: str) -> list[Dict[str, Any]]:
    normalized_message = _normalize_add_message(message)
    if not normalized_message:
        return []

    raw_segments = _split_add_segments(normalized_message)
    items = []

    for segment in raw_segments:
        parsed_item = _parse_add_item_segment(segment)
        if parsed_item:
            items.append(parsed_item)

    return items


def _should_use_heuristic_items(parsed_items: list[Dict[str, Any]], heuristic_items: list[Dict[str, Any]]) -> bool:
    if not heuristic_items:
        return False

    parsed_items_are_usable = bool(
        parsed_items
        and all(
            (item.get("item_name") or "").strip()
            and (item.get("quantity") is None or item.get("quantity") >= 1)
            for item in parsed_items
        )
    )

    parsed_has_customization = any(_has_customization_data(item) for item in parsed_items)
    heuristic_has_customization = any(_has_customization_data(item) for item in heuristic_items)

    if parsed_items_are_usable and parsed_has_customization and not heuristic_has_customization:
        return False

    if parsed_items_are_usable and heuristic_has_customization and not parsed_has_customization:
        return True

    if not parsed_items or len(parsed_items) != len(heuristic_items):
        return True

    for parsed_item, heuristic_item in zip(parsed_items, heuristic_items):
        parsed_name = (parsed_item.get("item_name") or "").strip().lower()
        heuristic_name = (heuristic_item.get("item_name") or "").strip().lower()
        parsed_quantity = parsed_item.get("quantity") or 1
        heuristic_quantity = heuristic_item.get("quantity") or 1

        if parsed_name != heuristic_name or parsed_quantity != heuristic_quantity:
            return True

    return False


async def _generate_gemini_content_async(
    prompt: str,
    timeout: float = 25.0,
) -> str | None:
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or "").strip()
    model_name = _normalize_gemini_model_name(
        settings.gemini_model or os.getenv("GEMINI_MODEL")
    )

    if not api_key:
        logger.warning({"stage": "llm_api_key_missing"})
        return None

    if not model_name:
        logger.warning({"stage": "llm_model_missing"})
        return None

    genai.configure(api_key=api_key)
    try:
        import asyncio
        model = genai.GenerativeModel(model_name)
        try:
            response = await asyncio.wait_for(
                model.generate_content_async(prompt),
                timeout=timeout,
            )
            return (response.text or "").strip()
        except asyncio.TimeoutError:
            logger.warning({
                "stage": "llm_gemini_timeout",
                "model": model_name,
            })
            return None
    except Exception as exc:
        logger.warning(
            {
                "stage": "llm_model_attempt_failed",
                "model": model_name,
                "error": str(exc),
            }
        )
        return None


def _build_intent_prompt(
    context_block: str,
    message: str,
    menu_vocab_block: str = "",
) -> str:
    return f"""
Classify the user's intent for a cafe ordering chatbot. Return ONLY valid JSON matching this schema.

Output schema:
{{
  "operations": [
    {{
      "intent": string,
      "items": [
        {{
          "item_query": string,
          "quantity": number or null,
          "modifiers": [string],
          "notes": [string],
          "follow_up_ref": string or null
        }}
      ],
      "needs_clarification": boolean,
      "reason": string
    }}
  ],
  "confidence": number between 0.0 and 1.0,
  "needs_clarification": boolean,
  "reason": string
}}

Rules for the operations array:
- ALWAYS return at least one operation, even for single-intent messages
- Group items by what needs to happen to them — each distinct action gets its own
  operation entry with its own intent and items array
- Single-intent messages return exactly one operation
- Multi-operation messages return one entry per distinct action:
    "add a latte and remove the croissant" →
      operations: [
        {{"intent": "add_items", "items": [{{"item_name": "latte", ...}}]}},
        {{"intent": "remove_item", "items": [{{"item_name": "croissant", ...}}]}}
      ]
    "add an espresso and change the latte to 2" →
      operations: [
        {{"intent": "add_items", "items": [{{"item_name": "espresso", ...}}]}},
        {{"intent": "update_quantity", "items": [{{"item_name": "latte", "quantity": 2, ...}}]}}
      ]
- The top-level confidence and needs_clarification apply to the whole message
- Each operation's needs_clarification applies to that operation only
- Valid intents per operation are the same thirteen as before:
    "add_items", "remove_item", "update_quantity", "update_item", "clear_cart", "view_cart",
    "recommendation_query", "describe_item", "checkout", "confirm_checkout",
    "repeat_order", "guided_order_response", "unknown"
- All existing classification rules apply per operation unchanged
- BARE AFFIRMATIONS rule still applies: if the entire message is a bare affirmation,
  return one operation with intent "unknown" and reason "bare_affirmation_needs_context"

Valid intents (use only these 13):
  "add_items"             - add to cart
  "remove_item"           - remove from cart
  "update_quantity"       - change quantity
  "update_item"           - modify variant options on a cart item
  "clear_cart"            - clear cart
  "view_cart"             - view cart
  "recommendation_query"  - ask for suggestions
  "describe_item"         - describe an item
  "checkout"              - start checkout
  "confirm_checkout"      - confirm checkout
  "repeat_order"          - repeat prior order
  "guided_order_response" - guided-order follow-up
  "unknown"               - unclear or conversational

Rules:
1. BARE AFFIRMATIONS ("yes", "ok", "okay", "sure", "yep", "sounds good", "do it", "go ahead" - the message is ONLY this word or phrase): intent "unknown", reason "bare_affirmation_needs_context". NEVER classify a bare affirmation as "confirm_checkout". Context is resolved by a separate layer that checks the session state.
2. When session_stage is "guided_ordering":
   - Phase 1 (required variants): replies naming a size, milk, flavor, or other variant option should be "guided_order_response" with confidence 0.9 or higher.
   - Phase 2 (review prompt): short replies like "done", "add it", "yes", or "i want toppings" should be "guided_order_response" with confidence 0.9 or higher.
   - Phase 3 (open customization): replies asking about options, asking how many can be chosen, naming add-ons, or changing a previous selection should be "guided_order_response" with confidence 0.9 or higher.
   - Phase 4 (instructions): short instruction replies or skip words like "none" should be "guided_order_response" with confidence 0.9 or higher.
   In all guided phases, item_query should be null and the reply is a follow-up to guided_current_group / guided_order_item_name.
   Exception: if the user is clearly asking for a different action like clearing the cart or checking out, classify that action normally instead.
3. Natural language patterns:
   - "repeat my last order", "same as before", "order again", "same thing again" -> "repeat_order"
   - "what's good", "surprise me", "any suggestions", "what do you recommend" -> "recommendation_query"
   - "what is X", "tell me about X", "describe X", "what's in X" -> "describe_item"
   - quantity changes like "make it 3", "change that to 2", "set the latte to 2" -> "update_quantity" (first such pattern note; do not treat as add_items)
   - removals like "take out X", "remove X", "cancel X", "delete X", "i don't want X anymore" -> "remove_item"
   - follow-up references like "same one", "that last one", "it", "that one", "another one of those" -> set the item's follow_up_ref to the exact phrase and leave item_query empty
4. Confidence: use >=0.8 when clear, 0.6-0.79 when plausible but uncertain, <0.6 for ambiguity, mixed operations, or unclear references; never force high confidence when unsure.
5. Quantity defaults: "a couple" -> 2, "a few" -> 3, "some" -> 2; if add_items has no quantity, use 1; put prep or serving requests in "instructions".
6. Multi-item rules: "A and B" or "A, B" means separate item entries; each item gets its own item_query, quantity, modifiers (flat list of user-language modifiers like 'medium', 'oat milk', 'extra shot'), and notes (free-text instructions like 'less ice', 'no whip').
6b. Modifying variant options on an item already in the cart
    ("change the milk on my latte to oat", "swap the syrup to caramel",
    "remove the skim milk from my espresso keep full fat",
    "make my americano large instead", "add a shot to the latte in my cart",
    "update the latte to have almond milk") → "update_item"

    CRITICAL DISTINCTION:
    - "update_item" = changing WHAT OPTIONS an item has (milk, size,
      addons, syrup, other modifiers — the variants/customizations)
    - "update_quantity" = changing HOW MANY of an item (numbers only)

    For update_item, populate the items array with:
    - item_query: the cart item being modified
    - quantity: null (do not set quantity for update_item)
    - modifiers: new option values to apply
    - notes: free-text changes like "remove the skim milk", "no sugar",
      "no whip", "without vanilla"

    The execution layer will merge these changes with the item's
    current cart options. Null fields mean "keep existing value".
    Non-null fields mean "replace with this value".
    Notes are used to strip specific options by name.
7. Use "unknown" for purely conversational, off-topic, or genuinely unclear messages. Do not guess.

{context_block}
{f"{menu_vocab_block}" + chr(10) if menu_vocab_block else ""}
User message:
"{message}"
"""


async def try_interpret_message(
    message: str,
    context=None,
    menu_vocab_block: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Layer 3 — Structured LLM Intent Parser.

    Calls the LLM with a structured prompt covering all 12 valid intents,
    parses the JSON response, and returns the raw schema dict.

    No post-parse reclassification or intent overrides happen here.
    All enrichment and routing decisions live in Layer 4 (intent_pipeline.py).

    Args:
        message: Normalised user message (already lowercased/trimmed).
        context: Optional execution context for session-aware prompting.

    Returns:
        Parsed dict matching the Layer 3 schema, or None if the LLM call or
        JSON parsing fails.
    """
    import sys

    try:
        print(f"[LLM INPUT] {redact(message)}", file=sys.stderr, flush=True)
        session_stage = None
        guided_order_phase = None
        guided_current_group = None
        guided_order_item_name = None
        if isinstance(context, dict):
            session_stage = context.get("session_stage")
            guided_order_phase = context.get("guided_order_phase")
            guided_current_group = context.get("guided_current_group")
            guided_order_item_name = context.get("guided_order_item_name")

        context_block = ""
        if session_stage or guided_order_phase is not None or guided_current_group or guided_order_item_name:
            context_block = f"""
Session context:
- session_stage: {json.dumps(session_stage or "")}
- guided_order_phase: {json.dumps(guided_order_phase)}
- guided_current_group: {json.dumps(guided_current_group or "")}
- guided_order_item_name: {json.dumps(guided_order_item_name or "")}
"""

        # Fetch menu vocabulary if not provided by caller
        if not menu_vocab_block:
            try:
                menu_vocab_block = await _get_menu_vocab_block()
            except Exception:
                menu_vocab_block = ""

        prompt = _build_intent_prompt(context_block, message, menu_vocab_block)
        raw_text = await _generate_gemini_content_async(prompt)
        print(f"[LLM OUTPUT] {redact(raw_text)}", file=sys.stderr, flush=True)
        if not raw_text:
            return None

        logger.info(redact({
            "stage": "llm_raw_response",
            "message": message,
            "raw_text": raw_text,
        }))

        parsed = _extract_json_object(raw_text)
        print(
            f"[LLM PARSED OPERATIONS] {parsed.get('operations') if parsed else None}",
            file=sys.stderr,
            flush=True,
        )
        if not parsed:
            logger.warning({
                "stage": "llm_parse_failed",
                "message": message,
                "raw_text": raw_text,
            })
            return None

        # Extract operations array — with legacy single-intent fallback
        operations_raw = parsed.get("operations")
        if not isinstance(operations_raw, list):
            # Legacy fallback: LLM returned old single-intent shape
            if "intent" in parsed:
                operations_raw = [parsed]
            else:
                return None

        # Normalize each operation
        normalized_operations = []
        for op in operations_raw:
            if not isinstance(op, dict):
                continue
            op_intent = op.get("intent") or "unknown"
            if not op_intent:
                op_intent = "unknown"

            # Run _normalize_items on this operation's items
            op_items = _normalize_items(op)

            # Apply heuristic for add_items per operation
            if op_intent == "add_items":
                op_item_names = [
                    item.get("item_name") or ""
                    for item in op_items
                    if isinstance(item, dict)
                ]
                op_item_text = (
                    ", ".join(name for name in op_item_names if name).strip()
                    if len(op_item_names) > 1
                    else " ".join(op_item_names).strip()
                )
                heuristic_source = op_item_text if op_item_text else message
                heuristic_items = _extract_add_items_from_message(heuristic_source)
                if _should_use_heuristic_items(op_items, heuristic_items):
                    op_items = heuristic_items

            op_follow_up_ref = str(op.get("follow_up_ref") or "").strip() or None
            if not op_follow_up_ref:
                for normalized_item in op_items:
                    if not isinstance(normalized_item, dict):
                        continue
                    item_follow_up_ref = str(normalized_item.get("follow_up_ref") or "").strip()
                    if item_follow_up_ref:
                        op_follow_up_ref = item_follow_up_ref
                        break

            normalized_op = {
                "intent": op_intent,
                "items": op_items,
                "follow_up_ref": op_follow_up_ref,
                "needs_clarification": bool(op.get("needs_clarification", False)),
                "reason": op.get("reason") or "",
            }
            normalized_operations.append(normalized_op)

        if not normalized_operations:
            return None

        # Top-level fields
        confidence = float(parsed.get("confidence") or 0.0)
        needs_clarification = bool(parsed.get("needs_clarification", False))
        reason = parsed.get("reason") or ""

        # fallback_needed: derive from confidence when not set by LLM
        fallback_needed = parsed.get("fallback_needed")
        if not isinstance(fallback_needed, bool):
            fallback_needed = confidence < 0.6

        legacy_result = {
            "operations": normalized_operations,
            "confidence": confidence,
            "needs_clarification": needs_clarification,
            "reason": reason,
            "fallback_needed": fallback_needed,
            # Legacy fields for backward compatibility — derived from first operation
            "intent": normalized_operations[0]["intent"],
            "items": normalized_operations[0]["items"],
            "follow_up_ref": normalized_operations[0].get("follow_up_ref"),
        }
        logger.info({
            "stage": "llm_interpretation_ready",
            "message": message,
            "intent": legacy_result["intent"],
            "op_count": len(normalized_operations),
            "confidence": legacy_result.get("confidence"),
            "follow_up_ref": legacy_result.get("follow_up_ref"),
            "needs_clarification": legacy_result.get("needs_clarification"),
        })

        return legacy_result

    except Exception as e:
        logger.exception({
            "stage": "llm_unexpected_error",
            "message": message,
            "error": str(e),
        })
        return None


async def extract_modifiers_for_item(
    message: str,
    item_name: str,
    menu_detail: dict | None,
    timeout: float = 8.0,
) -> Dict[str, Any]:
    """
    Phase B modifier extraction — runs after item match.

    Given the user's original message and the matched item's
    full variant data, extracts the requested modifiers as a
    structured dict matching the item schema.

    Returns a dict with keys:
        size, options (milk), addons, instructions
    All keys present, unrecognized fields set to null/empty.

    Returns empty defaults on failure — caller falls back to
    whatever the LLM already extracted during classification.
    """
    _DEFAULTS: Dict[str, Any] = {
        "size": None,
        "options": {"milk": None},
        "addons": [],
        "instructions": "",
    }

    if not message or not isinstance(menu_detail, dict):
        return _DEFAULTS

    # Build variant context from menu_detail
    variant_lines: list[str] = []
    variants = (
        menu_detail.get("variantGroupDetails")
        or menu_detail.get("variants")
        or []
    )
    for group in variants:
        if not isinstance(group, dict):
            continue
        if group.get("isActive") is False:
            continue
        group_label = (
            str(group.get("customerLabel") or "").strip()
            or str(group.get("name") or "").strip()
            or str(group.get("adminName") or "").strip()
        )
        if not group_label:
            continue
        options = group.get("options") or []
        option_names = [
            str(opt.get("name") or "").strip()
            for opt in options
            if isinstance(opt, dict)
            and opt.get("isActive") is not False
            and opt.get("name")
        ]
        if option_names:
            is_required = bool(group.get("isRequired"))
            required_hint = " (required)" if is_required else ""
            max_sel = group.get("maxSelections")
            max_hint = (
                f" (pick up to {max_sel})"
                if isinstance(max_sel, int) and max_sel > 1
                else ""
            )
            variant_lines.append(
                f"  - {group_label}{required_hint}{max_hint}: "
                f"{', '.join(option_names)}"
            )

    if not variant_lines:
        return _DEFAULTS

    variant_context = "\n".join(variant_lines)

    prompt = f"""
You are extracting customization options from a customer's message
for a specific café menu item.

Item: {item_name}

Available variant options for this item:
{variant_context}

Customer message: "{message}"

Return ONLY valid JSON with this exact schema:
{{
  "size": string or null,
  "options": {{
    "milk": string or null
  }},
  "addons": [string],
  "instructions": string or null
}}

Rules:
1. Only use EXACT option names from the available variants above.
   Never invent option names not listed.
2. If the customer mentions a modifier that matches an available
   option, include it using the exact name from the list.
3. If the customer does not mention a particular variant type,
   set it to null or empty array.
4. If the customer mentions something that is not in the variant
   list, put it in "instructions" as free text.
5. For addons, include all mentioned options as an array.
6. Return null for size/milk if not mentioned.
7. Never include quantity in this response.
"""

    try:
        raw_text = await _generate_gemini_content_async(
            prompt, timeout=timeout
        )
        if not raw_text:
            return _DEFAULTS

        parsed = _extract_json_object(raw_text)
        if not isinstance(parsed, dict):
            return _DEFAULTS

        result = dict(_DEFAULTS)
        if isinstance(parsed.get("size"), str):
            result["size"] = parsed["size"].strip() or None
        if isinstance(parsed.get("options"), dict):
            opts = parsed["options"]
            result["options"] = {
                "milk": (
                    str(opts.get("milk") or "").strip() or None
                ),
            }
        if isinstance(parsed.get("addons"), list):
            result["addons"] = [
                str(a).strip()
                for a in parsed["addons"]
                if str(a).strip()
            ]
        if isinstance(parsed.get("instructions"), str):
            result["instructions"] = parsed["instructions"].strip()

        logger.info({
            "stage": "modifier_extraction_done",
            "item_name": item_name,
            "size": result["size"],
            "milk": result["options"]["milk"],
            "addons": result["addons"],
        })
        return result

    except Exception as exc:
        logger.warning({
            "stage": "modifier_extraction_failed",
            "item_name": item_name,
            "error": str(exc),
        })
        return _DEFAULTS
