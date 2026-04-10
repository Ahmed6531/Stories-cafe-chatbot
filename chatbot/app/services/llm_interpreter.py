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


def _build_intent_prompt(context_block: str, message: str) -> str:
    return f"""
Classify the user's intent for a cafe ordering chatbot. Return ONLY valid JSON matching this schema.

Output schema:
{{
  "intent": string,
  "confidence": number between 0.0 and 1.0,
  "items": [
    {{
      "item_name": string,
      "quantity": number or null,
      "size": string or null,
      "options": {{
        "milk": string or null,
        "sugar": string or null
      }},
      "addons": [string],
      "instructions": string or null
    }}
  ],
  "follow_up_ref": string or null,
  "needs_clarification": boolean,
  "reason": string
}}

Valid intents (use only these 12):
  "add_items"             - add to cart
  "remove_item"           - remove from cart
  "update_quantity"       - change quantity
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
   In all guided phases, item_name should be null and the reply is a follow-up to guided_current_group / guided_order_item_name.
   Exception: if the user is clearly asking for a different action like clearing the cart or checking out, classify that action normally instead.
3. Natural language patterns:
   - "repeat my last order", "same as before", "order again", "same thing again" -> "repeat_order"
   - "what's good", "surprise me", "any suggestions", "what do you recommend" -> "recommendation_query"
   - "what is X", "tell me about X", "describe X", "what's in X" -> "describe_item"
   - quantity changes like "make it 3", "change that to 2", "set the latte to 2" -> "update_quantity" (first such pattern note; do not treat as add_items)
   - removals like "take out X", "remove X", "cancel X", "delete X", "i don't want X anymore" -> "remove_item"
   - follow-up references like "same one", "that last one", "it", "that one", "another one of those" -> set follow_up_ref to the exact phrase and leave item_name null/empty
4. Confidence: use >=0.8 when clear, 0.6-0.79 when plausible but uncertain, <0.6 for ambiguity, mixed operations, or unclear references; never force high confidence when unsure.
5. Quantity defaults: "a couple" -> 2, "a few" -> 3, "some" -> 2; if add_items has no quantity, use 1; put prep or serving requests in "instructions".
6. Multi-item rules: "A and B" or "A, B" means separate item entries; each item gets its own item_name, quantity, size, options, addons, and instructions.
7. Use "unknown" for purely conversational, off-topic, or genuinely unclear messages. Do not guess.

{context_block}

User message:
"{message}"
"""


def try_interpret_message(message: str, context=None) -> Optional[Dict[str, Any]]:
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
    try:
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

        prompt = f"""
You are an intent classifier for a café ordering chatbot.

Return ONLY valid JSON — no markdown, no preamble, no explanations.
Do not wrap the JSON in triple backticks.

Output schema (use these exact field names):
{{
  "intent": string,
  "confidence": number between 0.0 and 1.0,
  "items": [
    {{
      "item_name": string,
      "quantity": number or null,
      "size": string or null,
      "options": {{
        "milk": string or null,
        "sugar": string or null
      }},
      "addons": [string],
      "instructions": string or null
    }}
  ],
  "follow_up_ref": string or null,
  "needs_clarification": boolean,
  "reason": string
}}

Valid intent values — use ONLY one of these twelve strings:
  "add_items"             — user wants to add one or more items to their cart
  "remove_item"           — user wants to remove a specific item from their cart
  "update_quantity"       — user wants to change the quantity of a cart item
  "clear_cart"            — user wants to empty their entire cart
  "view_cart"             — user wants to see their cart contents
  "recommendation_query"  — user wants suggestions or recommendations
  "describe_item"         — user wants details about a specific menu item
  "checkout"              — user wants to proceed to checkout
  "confirm_checkout"      — user explicitly confirms a checkout already in progress
  "repeat_order"          — user wants to reorder a previous order
  "guided_order_response" — user is answering a guided ordering question about variants or instructions
  "unknown"               — anything conversational, off-topic, or genuinely unclear

Classification rules (follow these exactly):

1. BARE AFFIRMATIONS ("yes", "ok", "okay", "sure", "yep", "sounds good",
   "do it", "go ahead" — the message is ONLY this word or phrase):
   → intent "unknown", reason "bare_affirmation_needs_context"
   NEVER classify a bare affirmation as "confirm_checkout". Context is resolved
   by a separate layer that checks the session state.

2. When session_stage is "guided_ordering":
   - Phase 1 (required variants): any reply naming a size, milk, flavor, or
     other variant option should be "guided_order_response" with confidence
     0.9 or higher.
   - Phase 2 (review prompt): short replies like "done", "add it", "yes",
     "i want toppings", or similar follow-ups should be
     "guided_order_response" with confidence 0.9 or higher.
   - Phase 3 (open customization): replies asking about options, asking how
     many can be chosen, naming add-ons, or changing a previous selection
     should be "guided_order_response" with confidence 0.9 or higher.
   - Phase 4 (instructions): short instruction replies or skip words like
     "none" should be "guided_order_response" with confidence 0.9 or higher.
   In all guided phases, item_name should be null and the reply should be
   treated as a follow-up to the guided step shown in guided_current_group /
   guided_order_item_name.
   Exception: if the user is clearly asking for a different action like
   clearing the cart or checking out, classify that action normally instead.

3. "repeat my last order", "same as before", "order again", "order the same thing",
   "same thing again" → "repeat_order" (NOT "add_items")

4. "what's good", "what's good today", "surprise me", "any suggestions",
   "what do you recommend", "what should I get", "recommend me something",
   "what do you have that's good" → "recommendation_query"

5. "what is X", "tell me about X", "describe X", "what's in X",
   "can you describe X", "what does X taste like" → "describe_item"

6. Changing the quantity of an item already in the cart
   ("make it 3", "change that to 2", "I want 2 of those instead",
   "actually make that 3", "set the latte to 2") → "update_quantity" (NOT "add_items")

7. Removing items ("take out X", "remove X", "cancel X", "delete X",
   "no X please", "I don't want X anymore") → "remove_item" (NOT "add_items")

8. Follow-up references: if the user refers to a previously mentioned item
   without naming it ("same one", "that last one", "the one I just ordered",
   "it", "that one", "another one of those"):
   → set follow_up_ref to the exact reference phrase used
   → leave item_name as null or empty string in the items array

8b. Prep or serving requests like "no warming", "not warmed", "extra hot",
    "on the side", "light ice", "no foam" that could be variant options
    should go in the item's "instructions" field as a fallback. The
    execution layer will attempt to match them against variant options
    first before treating them as free text.

9. Confidence guidelines:
   - Use confidence ≥ 0.8 when intent and items are clear and unambiguous
   - Use confidence 0.6–0.79 for reasonable but not certain interpretations
   - Use confidence < 0.6 for: ambiguous messages, mixed operations
     (add + remove in same message), unclear references without context
   - Never force a high-confidence label when you are not sure

10. Return "unknown" for purely conversational, off-topic, or genuinely
   unclear messages. Do not guess.

11. Quantity defaults: "a couple" → 2, "a few" → 3, "some" → 2.
    If quantity is not specified for add_items, use 1.
    Never invent items the user did not mention.

Multi-item rules:
- "A and B" or "A, B" → two separate entries in the items array
- Each item gets its own item_name, quantity, size, options, addons

{context_block}

User message:
"{message}"
"""

        prompt = _build_intent_prompt(context_block, message)
        raw_text = _generate_gemini_content(prompt)
        if not raw_text:
            return None

        logger.info({
            "stage": "llm_raw_response",
            "message": message,
            "raw_text": raw_text,
        })

        parsed = _extract_json_object(raw_text)
        if not parsed:
            logger.warning({
                "stage": "llm_parse_failed",
                "message": message,
                "raw_text": raw_text,
            })
            return None

        # Build result — keep only recognised top-level fields
        result = _base_result()
        for key in ("intent", "confidence", "fallback_needed",
                    "follow_up_ref", "needs_clarification", "reason"):
            if key in parsed:
                result[key] = parsed[key]

        result["items"] = _normalize_items(parsed)
        if result.get("intent") == "add_items" or _looks_like_add_request(message):
            heuristic_items = _extract_add_items_from_message(message)
            if _should_use_heuristic_items(result["items"], heuristic_items):
                result["items"] = heuristic_items
        result.setdefault("follow_up_ref", None)
        result.setdefault("needs_clarification", False)
        result.setdefault("reason", "")

        if not result.get("intent"):
            result["intent"] = "unknown"

        # fallback_needed: derive from confidence when not set by LLM
        if not isinstance(result.get("fallback_needed"), bool):
            result["fallback_needed"] = float(result.get("confidence") or 0.0) < 0.6

        logger.info({
            "stage": "llm_interpretation_ready",
            "message": message,
            "intent": result["intent"],
            "confidence": result.get("confidence"),
            "follow_up_ref": result.get("follow_up_ref"),
            "needs_clarification": result.get("needs_clarification"),
        })

        return result

    except Exception as e:
        logger.exception({
            "stage": "llm_unexpected_error",
            "message": message,
            "error": str(e),
        })
        return None
