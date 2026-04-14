import json
import logging
import os
import re
from typing import Optional, Dict, Any

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_MODEL_CANDIDATES = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
)


def _normalize_gemini_model_name(model_name: str | None) -> str:
    normalized = (model_name or "").strip()
    if normalized.startswith("models/"):
        return normalized.split("/", 1)[1]
    return normalized

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
            "sugar": None,
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

    if isinstance(item.get("options"), dict):
        normalized_item["options"].update(item["options"])

    raw_addons = item.get("addons")
    if isinstance(raw_addons, list):
        normalized_item["addons"] = _unique_strings(
            [str(addon).strip() for addon in raw_addons if str(addon).strip()]
        )
    elif isinstance(raw_addons, str) and raw_addons.strip():
        normalized_item["addons"] = [raw_addons.strip()]
    else:
        normalized_item["addons"] = []

    raw_instructions = item.get("instructions")
    if isinstance(raw_instructions, list):
        normalized_item["instructions"] = ", ".join(
            str(value).strip() for value in raw_instructions if str(value).strip()
        ).strip()
    elif isinstance(raw_instructions, str):
        normalized_item["instructions"] = raw_instructions.strip()
    else:
        normalized_item["instructions"] = ""

    if normalized_item.get("quantity") is None and default_quantity is not None:
        normalized_item["quantity"] = default_quantity

    item_name = normalized_item.get("item_name")
    if isinstance(item_name, str):
        normalized_item["item_name"] = item_name.strip()

    if not normalized_item.get("item_name"):
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
        r"^(i would like to order|i would like to add|i would like to|get me|i want to order|i want to add|i want|please)\s+",
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
            "sugar": sugar,
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

    # Preserve richer Gemini structure when it already extracted usable
    # customizations. The heuristic parser is intentionally simpler and can
    # flatten modifiers back into item_name.
    if parsed_items_are_usable and any(_has_customization_data(item) for item in parsed_items):
        return False

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


def _iter_gemini_models(preferred_model: str | None):
    seen = set()
    for model_name in (preferred_model, *GEMINI_MODEL_CANDIDATES):
        normalized = _normalize_gemini_model_name(model_name)
        if normalized and normalized not in seen:
            seen.add(normalized)
            yield normalized


def _generate_gemini_content(prompt: str) -> str | None:
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or "").strip()
    preferred_model = _normalize_gemini_model_name(
        settings.gemini_model or os.getenv("GEMINI_MODEL")
    )

    if not api_key:
        logger.warning({"stage": "llm_api_key_missing"})
        return None

    genai.configure(api_key=api_key)
    last_error = None

    for model_name in _iter_gemini_models(preferred_model):
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            return (response.text or "").strip()
        except Exception as exc:
            last_error = exc
            logger.warning(
                {
                    "stage": "llm_model_attempt_failed",
                    "model": model_name,
                    "error": str(exc),
                }
            )
            error_text = str(exc).lower()
            if "not found" in error_text or "not supported" in error_text:
                continue
            break

    if last_error:
        logger.warning(
            {
                "stage": "llm_all_model_attempts_failed",
                "preferred_model": preferred_model,
                "error": str(last_error),
            }
        )

    return None


def try_interpret_message(message: str, context=None) -> Optional[Dict[str, Any]]:
    try:
        history_block = ""
        if context and isinstance(context, list):
            recent = context[-10:]  # last 5 exchanges
            lines = []
            for turn in recent:
                role = turn.get("role", "")
                text = turn.get("text", "")
                if role == "user":
                    lines.append(f"User: {text}")
                elif role == "bot":
                    lines.append(f"Bot: {text}")
            if lines:
                history_block = "\nConversation so far:\n" + "\n".join(lines) + "\n"

        prompt = f"""
You are an ordering-intent parser for a cafe chatbot.

Your job is to extract structured data from the user's message with high accuracy.
{history_block}
Return ONLY valid JSON.
Do not add markdown.
Do not add explanations.
Do not wrap the JSON in triple backticks.

Use exactly this schema:
{{
  "intent": "add_items" | "update_quantity" | "remove_item" | "view_cart" | "checkout" | "unknown",
  "items": [
    {{
      "item_name": string,
      "quantity": number,
      "size": string or null,
      "options": {{
        "milk": string or null,
        "sugar": string or null
      }},
      "addons": [string],
      "instructions": string or null
    }}
  ],
  "confidence": number,
  "fallback_needed": boolean
}}

Critical Rules for Multi-Item Orders:
- For messages with "and" or commas: extract EVERY item separately. Do not merge items.
- When parsing "X item and Y item2": extract item with quantity X, then item2 with quantity Y.
- When parsing "item and Z item2": extract item with quantity 1, then item2 with quantity Z.
- Each "and" or comma signals a new item. Keep them as separate array entries.
- Examples:
  * "latte and 2 water" → [{{item_name: "latte", quantity: 1}}, {{item_name: "water", quantity: 2}}]
  * "2 espresso and caramel frap" → [{{item_name: "espresso", quantity: 2}}, {{item_name: "caramel frap", quantity: 1}}]
  * "1 latte and 2 water and 3 croissant" → 3 separate items with quantities 1, 2, 3

General Rules:
- Use "add_items" if the user is ordering, adding, or requesting one or more menu items.
- Use "update_quantity" if the user wants to change the quantity of an item already in the cart.
- Use "remove_item" if the user wants to remove or delete an item from the cart.
- Use "view_cart" if the user asks to see the cart.
- Use "unknown" if the request is unclear.
- Put every requested item in the "items" array as a separate object.
- For "update_quantity", include the target item in "items" and set its quantity to the requested new quantity.
- For "remove_item", include the target item in "items" and set its quantity to null.
- If the user does not mention quantity for an add_items item, use 1.
- If quantity is missing or unclear for update_quantity, set quantity to null.
- item_name should be only the menu item phrase (no quantity, no size, no options).
- If the user says a size (small, medium, large), put it in each item's "size", not in item_name.
- If the user mentions milk type, put it in each item's options.milk, not in item_name.
- If the user mentions sugar preferences, put them in each item's options.sugar when possible.
- Put selectable add-ons such as syrup flavors, extra shot, whipped cream, drizzle, or decaf into each item's addons array.
- Put free-form prep requests such as extra hot, less ice, no whip, light foam, or on the side into each item's instructions field.
- Set fallback_needed to false if you are confident in the interpretation. Set to true otherwise.

User message:
"{message}"
"""

        raw_text = _generate_gemini_content(prompt)
        if not raw_text:
            return None

        logger.info(
            {
                "stage": "llm_raw_response",
                "message": message,
                "raw_text": raw_text,
            }
        )

        parsed = _extract_json_object(raw_text)
        if not parsed:
            logger.warning(
                {
                    "stage": "llm_parse_failed",
                    "message": message,
                    "raw_text": raw_text,
                }
            )
            return None

        result = _base_result()
        result.update(parsed)
        result["items"] = _normalize_items(parsed)

        if not result.get("intent"):
            result["intent"] = "unknown"

        if result["items"] and result["intent"] in {"add_items", "unknown"}:
            result["intent"] = "add_items"

        if _looks_like_add_request(message) and result["intent"] in {"add_item", "add_items", "unknown"}:
            heuristic_items = _extract_add_items_from_message(message)
            if heuristic_items and result["intent"] == "unknown":
                result["intent"] = "add_items"
            if _should_use_heuristic_items(result["items"], heuristic_items):
                logger.info(
                    {
                        "stage": "llm_heuristic_items_applied",
                        "message": message,
                        "heuristic_items": heuristic_items,
                    }
                )
                result["items"] = heuristic_items

        logger.info(
            {
                "stage": "llm_interpretation_ready",
                "message": message,
                "intent": result["intent"],
                "items": result["items"],
                "fallback_needed": result.get("fallback_needed", True),
            }
        )

        return result

    except Exception as e:
        logger.exception(
            {
                "stage": "llm_unexpected_error",
                "message": message,
                "error": str(e),
            }
        )
        return None
