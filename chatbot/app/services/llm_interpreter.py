import os
import json
import re
from typing import Optional, Dict, Any

import google.generativeai as genai


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


def _base_item() -> Dict[str, Any]:
    return {
        "item_name": None,
        "quantity": None,
        "size": None,
        "options": {
            "milk": None,
            "sugar": None,
        },
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

    raw_segments = re.split(r"\s*(?:,|\band\b)\s*", normalized_message)
    items = []

    for segment in raw_segments:
        segment = segment.strip()
        if not segment:
            continue

        segment = re.sub(r"^(to\s+)?(order|add|get)\s+", "", segment).strip()

        quantity = 1
        match = re.match(r"^(?P<qty>\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?P<name>.+)$", segment)
        if match:
            quantity = WORD_TO_NUMBER.get(match.group("qty"), None)
            if quantity is None:
                quantity = int(match.group("qty"))
            segment = match.group("name").strip()

        if not segment:
            continue

        items.append(
            {
                "item_name": segment,
                "quantity": quantity,
                "size": None,
                "options": {
                    "milk": None,
                    "sugar": None,
                },
            }
        )

    return items


def _should_use_heuristic_items(parsed_items: list[Dict[str, Any]], heuristic_items: list[Dict[str, Any]]) -> bool:
    if not heuristic_items:
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


def try_interpret_message(message: str, context=None) -> Optional[Dict[str, Any]]:
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

        if not api_key:
            print("LLM ERROR: GEMINI_API_KEY is missing")
            return None

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)

        prompt = f"""
You are an ordering-intent parser for a cafe chatbot.

Your job is to extract structured data from the user's message with high accuracy.

Return ONLY valid JSON.
Do not add markdown.
Do not add explanations.
Do not wrap the JSON in triple backticks.

Use exactly this schema:
{{
  "intent": "add_items" | "update_quantity" | "remove_item" | "view_cart" | "unknown",
  "items": [
    {{
      "item_name": string,
      "quantity": number,
      "size": string or null,
      "options": {{
        "milk": string or null,
        "sugar": string or null
      }}
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
- Set fallback_needed to false if you are confident in the interpretation. Set to true otherwise.

User message:
"{message}"
"""

        response = model.generate_content(prompt)
        raw_text = (response.text or "").strip()

        print("LLM RAW RESPONSE:", raw_text)

        parsed = _extract_json_object(raw_text)
        if not parsed:
            print("LLM ERROR: could not parse Gemini JSON")
            return None

        result = _base_result()
        result.update(parsed)
        result["items"] = _normalize_items(parsed)

        if not result.get("intent"):
            result["intent"] = "unknown"

        if result["items"] and result["intent"] in {"add_item", "unknown"}:
            result["intent"] = "add_items"

        if _looks_like_add_request(message) and result["intent"] in {"add_item", "add_items", "unknown"}:
            heuristic_items = _extract_add_items_from_message(message)
            if heuristic_items and result["intent"] == "unknown":
                result["intent"] = "add_items"
            if _should_use_heuristic_items(result["items"], heuristic_items):
                print("LLM HEURISTIC ITEMS:", heuristic_items)
                result["items"] = heuristic_items

        print("LLM PARSED ITEMS:", result["items"])

        return result

    except Exception as e:
        print("LLM ERROR:", str(e))
        return None
