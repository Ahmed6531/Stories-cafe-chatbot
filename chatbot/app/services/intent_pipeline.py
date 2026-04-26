"""
Intent resolution pipeline — Layers 2, 3, and 4.

Layer 2  Deterministic Router  — exact-phrase matching only, frozen set
Layer 3  LLM Intent Parser     — single LLM call, structured output
Layer 4  Resolver / Validator  — enrichment, context gates, routing decision

Public API:
    async def resolve_intent(
        message: str,
        session: dict,
        cart: dict,
        menu: list,
    ) -> dict

The returned dict is a fully resolved intent object.  The orchestrator
consumes it directly and never re-inspects the raw message for intent.
"""

import asyncio
import logging
import re
from typing import Optional

from app.services.llm_interpreter import try_interpret_message
from app.services.session_store import get_guided_order_phase, get_session_stage

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Layer 2 — Deterministic Router constants
# FROZEN: do not add phrases here without explicit justification.
# Any phrase that requires interpretation belongs in Layer 3 (LLM).
# ─────────────────────────────────────────────────────────────────────────────

_CLEAR_CART_PHRASES: frozenset[str] = frozenset({
    "clear cart",
    "empty cart",
    "remove all",
    "start over",
    "clear everything",
})

_CONFIRM_CHECKOUT_PHRASES: frozenset[str] = frozenset({
    "confirm",
    "confirm order",
    "proceed",
    "place it",
    "let's go",
})

_RECOMMENDATION_PHRASES: frozenset[str] = frozenset({
    "what's good",
    "whats good",
    "what's good today",
    "whats good today",
    "surprise me",
})

_REPEAT_ORDER_PHRASES: frozenset[str] = frozenset({
    "repeat my last order",
    "repeat my order",
})

_BARE_AFFIRMATIONS: frozenset[str] = frozenset({
    "yes",
    "yep",
    "ok",
    "okay",
    "sure",
    "sounds good",
    "do it",
    "go ahead",
})

_NUMBER_WORDS: dict[str, int] = {
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

_VALID_INTENTS: frozenset[str] = frozenset({
    "add_items",
    "remove_item",
    "update_quantity",
    "clear_cart",
    "view_cart",
    "recommendation_query",
    "describe_item",
    "list_categories",
    "list_category_items",
    "checkout",
    "confirm_checkout",
    "repeat_order",
    "update_item",
    "guided_order_response",
    "unknown",
})


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_resolved(
    *,
    intent: str,
    confidence: float = 1.0,
    items: list | None = None,
    follow_up_ref: str | None = None,
    needs_clarification: bool = False,
    reason: str = "",
    source: str = "llm",
    route_to_fallback: bool = False,
    operations: list | None = None,
) -> dict:
    result = {
        "intent": intent,
        "confidence": confidence,
        "items": items if items is not None else [],
        "follow_up_ref": follow_up_ref,
        "needs_clarification": needs_clarification,
        "reason": reason,
        "source": source,
        "route_to_fallback": route_to_fallback,
        # Kept for backward compatibility with execution-layer checks
        "fallback_needed": route_to_fallback,
    }
    if operations is not None:
        result["operations"] = operations
    else:
        result["operations"] = []
    return result


def _extract_explicit_quantity(normalized_message: str) -> int | None:
    quantity_tokens = re.findall(
        r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b",
        normalized_message,
    )
    if len(quantity_tokens) != 1:
        return None

    token = quantity_tokens[0]
    if token.isdigit():
        return int(token)
    return _NUMBER_WORDS.get(token)


_ORDINAL_INDEX_PATTERNS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (0, ("first one", "1st", "number one", "the first")),
    (1, ("second one", "2nd", "number two", "the second")),
    (2, ("third one", "3rd", "number three", "the third")),
    (3, ("fourth one", "4th", "number four", "the fourth")),
)


def _ordinal_index_from_message(normalized_message: str) -> int | None:
    for index, phrases in _ORDINAL_INDEX_PATTERNS:
        if any(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", normalized_message) for phrase in phrases):
            return index
    if re.search(r"(?<!\w)(last one|the last)(?!\w)", normalized_message):
        return -1
    return None


def _is_ordinal_reference(normalized_message: str) -> bool:
    return _ordinal_index_from_message(normalized_message) is not None


def _visible_choice_for_ordinal(normalized_message: str, session: dict) -> dict | None:
    index = _ordinal_index_from_message(normalized_message)
    if index is None:
        return None
    choices = session.get("last_visible_choices") or []
    if not isinstance(choices, list) or not choices:
        return None
    if index == -1:
        choice = choices[-1]
    elif 0 <= index < len(choices):
        choice = choices[index]
    else:
        return None
    return choice if isinstance(choice, dict) else None


def _ordinal_add_modifiers_from_message(normalized_message: str) -> list[str]:
    text = re.sub(
        r"^(add|get|give me|i want|i would like|can i have)\s+",
        "",
        normalized_message,
    ).strip()
    text = re.sub(
        r"\b(the\s+)?(first|second|third|fourth|last)\s+one\b|\bnumber\s+(one|two|three|four)\b|\b[1-4](st|nd|rd|th)?\b",
        " ",
        text,
    )
    text = re.sub(r"^(with|and|plus)\s+", "", " ".join(text.split())).strip()
    if not text:
        return []

    fragments: list[str] = []
    remaining = text

    for intensity in ("extra", "regular", "less", "light", "normal"):
        pattern = re.compile(rf"\b{intensity}\s+[a-z0-9]+\b")
        for match in pattern.finditer(text):
            fragment = match.group(0).strip()
            if fragment and fragment not in fragments:
                fragments.append(fragment)
                remaining = remaining.replace(fragment, " ")

    phrase_candidates = (
        "white bread", "brown bread", "cherry tomatoes", "tomatoes", "tomato",
        "cheddar cheese", "beef ham", "roast beef", "chicken teriyaki",
        "honey mustard", "bbq", "mayo", "mustard", "pepper", "salt",
        "rocca", "mint", "onion", "jalapeno", "lettuce", "olives",
        "pickles", "tuna",
    )
    for candidate in phrase_candidates:
        if re.search(rf"(?<!\w){re.escape(candidate)}(?!\w)", remaining):
            fragments.append(candidate)
            remaining = re.sub(rf"(?<!\w){re.escape(candidate)}(?!\w)", " ", remaining)

    for fragment in re.split(r"\s+and\s+|,", remaining):
        cleaned = fragment.strip()
        if cleaned and cleaned not in {"with", "and", "plus"}:
            fragments.append(cleaned)

    seen: set[str] = set()
    unique: list[str] = []
    for fragment in fragments:
        normalized = " ".join(fragment.split())
        if normalized and normalized not in seen:
            seen.add(normalized)
            unique.append(normalized)
    return unique


# ─────────────────────────────────────────────────────────────────────────────
# Layer 2 — Regex patterns for menu-data queries
# These are deterministic but require extraction, so separate from the frozen sets.
# ─────────────────────────────────────────────────────────────────────────────

# "what's on the menu" / "what do you have" / "what categories" / "show me the menu"
_RE_LIST_ALL = re.compile(
    r"^(?:"
    r"what(?:'s| is| are)?\s+(?:on\s+(?:the\s+|your\s+)?menu|(?:your\s+)?(?:categories|types|options|selections?))"
    r"|show\s+(?:me\s+)?(?:the\s+|your\s+)?menu"
    r"|what\s+(?:can\s+i\s+(?:order|get|have)|do\s+you\s+(?:have|serve|offer|sell))"
    r"|browse\s+(?:the\s+)?menu"
    r"|menu\s+please"
    r")(?:\s*\?)?$"
)

# "what drinks do you have" / "show me your pastries" / "do you have any food"
_RE_LIST_CATEGORY = re.compile(
    r"^(?:what|show\s+me|list|see|browse|view)\s+(?:your\s+|the\s+)?(\w+)"
    r"(?:\s+(?:do\s+you\s+(?:have|provide|sell|carry|offer|serve)"
    r"|you\s+(?:have|provide|sell|carry|serve|offer)"
    r"|options?|items?|menu))?(?:\s*\?)?$"
    r"|^what\s+(?:kind|kinds|type|types)\s+of\s+(\w+)"
    r"(?:\s+(?:do\s+you\s+(?:have|provide|sell|carry|offer|serve)"
    r"|you\s+(?:have|provide|sell|carry|serve|offer)))?(?:\s*\?)?$"
    r"|^do\s+you\s+have\s+any\s+(\w+)(?:\s*\?)?$"
)

_MULTI_INTENT_SIGNALS = re.compile(
    r"\b(?:add|remove|delete|update|change|checkout|describe|"
    r"tell me about|what(?:'s| is) in)\b",
    re.IGNORECASE,
)

# "do you have X" / "is X in stock" / "is X available" / "is X on the menu"
_RE_AVAILABILITY = re.compile(
    r"^(?:do\s+you\s+(?:have|sell|serve|carry)|have\s+you\s+got|is\s+there|you\s+have)\s+(.+?)(?:\s*\?)?$"
    r"|^(?:is|are)\s+(.+?)\s+(?:available|in\s+stock|on\s+(?:the\s+|your\s+)?menu|still\s+(?:available|on))(?:\s*\?)?$"
)

# "how much is X" / "price of X" / "what's the price of X" / "cost of X"
_RE_PRICE = re.compile(
    r"^(?:how\s+much\s+(?:is|does|for)\s+(?:the\s+|a\s+|an\s+)?|"
    r"(?:what(?:'s|\s+is)\s+the\s+)?price\s+(?:of|for)\s+(?:the\s+|a\s+)?|"
    r"cost\s+of\s+(?:the\s+|a\s+)?)(.+?)(?:\s*\?)?$"
)

_RE_UPDATE_ITEM_TO_OPTION = re.compile(
    r"^(?:update|change|modify|edit|set|switch|swap)\s+"
    r"(?:the\s+|my\s+)?(.+?)\s+"
    r"(?:to|with|have|having)\s+(.+?)(?:\s+instead)?$"
)

_RE_MAKE_ITEM_OPTION = re.compile(
    r"^make\s+(?:the\s+|my\s+)?(.+?)\s+"
    r"((?:small|medium|large|warmed|not warmed|extra\s+\w+|regular\s+\w+|less\s+\w+).+?|\w+)"
    r"(?:\s+instead)?$"
)

_RE_CORRECTION = re.compile(
    r"^(?:"
    r"nevermind\s+i\s+(?:meant|want|wanted)\s+(?:to\s+(?:order|get|add)\s+)?"
    r"|never\s+mind\s+i\s+(?:meant|want|wanted)\s+(?:to\s+(?:order|get|add)\s+)?"
    r"|actually\s+(?:i\s+)?(?:i\s+)?(?:want|wanted|d\s+like|would\s+like|can\s+i\s+get|can\s+i\s+have|could\s+i\s+get)\s+(?:to\s+(?:order|get|add)\s+)?"
    r"|wait\s+i\s+(?:meant|want|wanted)\s+(?:to\s+(?:order|get|add)\s+)?"
    r"|no\s+wait\s+(?:i\s+want\s+)?"
    r"|scratch\s+that\s+(?:i\s+want\s+)?"
    r"|forget\s+(?:it\s+)?(?:i\s+want\s+)?"
    r"|cancel\s+that\s+(?:i\s+want\s+)?"
    r")(.+)$",
    re.IGNORECASE,
)

_RE_CORRECTION_STAGED = re.compile(
    r"^(?:i\s+meant|i\s+mean)\s+(.+)$",
    re.IGNORECASE,
)

_RE_ADD_ONE_MORE = re.compile(
    r"^(?:"
    r"add\s+(?:one|1|another)\s+more"
    r"|one\s+more\s+(?:of\s+(?:the\s+|that\s+)?)?(?:same|those|it|that)?"
    r"|another\s+one"
    r"|same\s+again"
    r"|one\s+more\s+please"
    r"|add\s+another"
    r")(?:\s+please)?$",
    re.IGNORECASE,
)

# ── Dynamic category cache ────────────────────────────────────────
# Built from live menu data. Refreshed every 5 minutes.
# Falls back to hardcoded set if fetch fails.

_CATEGORY_QUERY_WORDS: frozenset[str] = frozenset({
    "what", "which", "show", "list", "see", "browse", "view",
    "have", "got", "get", "any", "do", "does", "provide",
    "sell", "carry", "offer", "serve", "available", "options",
    "items", "menu", "kind", "kinds", "type", "types", "choices",
})


async def _get_category_names_for_routing() -> list[str]:
    from app.services.menu_signal import get_menu_signal

    signal = await get_menu_signal()
    return sorted(signal.category_names, key=len, reverse=True)


def _build_category_match_map(category_names: list[str]) -> dict[str, str]:
    """
    Returns lowercase category match variants keyed to the canonical DB name.
    Handles exact names and simple plural/singular forms.
    """
    mapping: dict[str, str] = {}
    for name in category_names:
        lower = str(name or "").strip().lower()
        if not lower:
            continue
        mapping[lower] = name

        if lower.endswith("ies"):
            mapping[lower[:-3] + "y"] = name
            mapping[lower[:-3] + "ie"] = name
        elif lower.endswith("es") and len(lower) > 3:
            mapping[lower[:-2]] = name
        elif lower.endswith("s") and len(lower) > 2:
            mapping[lower[:-1]] = name
    return mapping


# ─────────────────────────────────────────────────────────────────────────────
# Layer 2 — Deterministic Router
# ─────────────────────────────────────────────────────────────────────────────

async def _layer2_deterministic(
    normalized: str,
    session_stage: str | None = None,
    session: dict | None = None,
) -> Optional[dict]:
    """
    Exact-phrase match only.  No substring scanning, no regex.
    Returns a resolved intent dict or None (fall through to Layer 3).
    """
    if normalized in _CLEAR_CART_PHRASES:
        return _make_resolved(
            intent="clear_cart",
            source="deterministic",
            reason="deterministic_match:clear_cart",
        )
    if normalized in _CONFIRM_CHECKOUT_PHRASES:
        return _make_resolved(
            intent="confirm_checkout",
            source="deterministic",
            reason="deterministic_match:confirm_checkout",
        )
    if normalized in _RECOMMENDATION_PHRASES:
        return _make_resolved(
            intent="recommendation_query",
            source="deterministic",
            reason="deterministic_match:recommendation_query",
        )
    if normalized in _REPEAT_ORDER_PHRASES:
        return _make_resolved(
            intent="repeat_order",
            source="deterministic",
            reason="deterministic_match:repeat_order",
        )

    if session_stage != "guided_ordering" and session is not None and _is_ordinal_reference(normalized):
        visible_choice = _visible_choice_for_ordinal(normalized, session)
        if visible_choice:
            item_name = str(visible_choice.get("item_name") or visible_choice.get("label") or "").strip()
            if item_name:
                ordinal_intent = "describe_item" if re.search(r"\b(what|tell|describe|details?|about)\b", normalized) else "add_items"
                ordinal_modifiers = (
                    _ordinal_add_modifiers_from_message(normalized)
                    if ordinal_intent == "add_items"
                    else []
                )
                return _make_resolved(
                    intent=ordinal_intent,
                    confidence=1.0,
                    items=[{
                        "item_name": item_name,
                        "item_query": item_name,
                        "quantity": 1 if ordinal_intent == "add_items" else None,
                        "modifiers": ordinal_modifiers,
                        "notes": [],
                        "follow_up_ref": None,
                        "use_defaults": False,
                    }],
                    needs_clarification=False,
                    reason="deterministic_visible_choice_ordinal",
                    source="deterministic",
                    route_to_fallback=False,
                )
        return _make_resolved(
            intent="unknown",
            confidence=1.0,
            needs_clarification=True,
            reason="visible_choice_ordinal_unresolvable",
            source="deterministic",
            route_to_fallback=True,
        )

    # ── Regex section ────────────────────────────────────────────────────────
    # "what's on the menu" / "what categories do you have"
    if _RE_LIST_ALL.match(normalized):
        return _make_resolved(
            intent="list_categories",
            source="deterministic",
            reason="deterministic_match:list_categories",
        )

    # "what drinks do you have" / "show me your pastries"
    m = _RE_LIST_CATEGORY.match(normalized)
    if m:
        candidate = (m.group(1) or m.group(2) or m.group(3) or "").strip().lower()
        category_names = await _get_category_names_for_routing()
        if candidate in category_names:
            return _make_resolved(
                intent="list_category_items",
                source="deterministic",
                reason="deterministic_match:list_category_items",
                items=[{"category": candidate}],
            )

    # "do you have X" / "is X in stock" — route to describe_item (handles availability)
    m = _RE_AVAILABILITY.match(normalized)
    if m:
        item_name = (m.group(1) or m.group(2) or "").strip()
        if item_name and len(item_name) > 1:
            return _make_resolved(
                intent="describe_item",
                source="deterministic",
                reason="deterministic_match:availability",
                items=[{"item_name": item_name}],
            )

    # "how much is X" / "price of X" — route to describe_item
    m = _RE_PRICE.match(normalized)
    if m:
        item_name = (m.group(1) or "").strip()
        if item_name and len(item_name) > 1:
            return _make_resolved(
                intent="describe_item",
                source="deterministic",
                reason="deterministic_match:price_query",
                items=[{"item_name": item_name}],
            )

    update_match = _RE_UPDATE_ITEM_TO_OPTION.match(normalized) or _RE_MAKE_ITEM_OPTION.match(normalized)
    if update_match:
        item_name = (update_match.group(1) or "").strip()
        modifier = (update_match.group(2) or "").strip()
        if (
            item_name
            and modifier
            and _extract_explicit_quantity(modifier) is None
            and item_name not in {"it", "that", "that one", "this"}
        ):
            return _make_resolved(
                intent="update_item",
                confidence=1.0,
                items=[{
                    "item_name": item_name,
                    "item_query": item_name,
                    "quantity": None,
                    "modifiers": [modifier],
                    "notes": [],
                    "follow_up_ref": None,
                    "use_defaults": False,
                }],
                needs_clarification=False,
                reason="deterministic_match:update_item_option",
                source="deterministic",
                route_to_fallback=False,
            )

    correction_normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized.lower())
    correction_normalized = " ".join(correction_normalized.split())
    _correction_match = _RE_CORRECTION.match(correction_normalized)
    if not _correction_match and session_stage == "guided_ordering":
        _correction_match = _RE_CORRECTION_STAGED.match(correction_normalized)

    if _correction_match:
        new_item_query = _correction_match.group(1).strip()
        if new_item_query:
            return _make_resolved(
                intent="add_items",
                confidence=0.95,
                items=[{
                    "item_name": new_item_query,
                    "item_query": new_item_query,
                    "quantity": 1,
                    "modifiers": [],
                    "notes": [],
                    "follow_up_ref": None,
                    "use_defaults": False,
                }],
                needs_clarification=False,
                reason="correction_pattern",
                source="layer2_correction",
                route_to_fallback=False,
            )

    if _RE_ADD_ONE_MORE.match(normalized) and session is not None:
        last_items = session.get("last_items") or []
        if isinstance(last_items, list) and last_items:
            last_item = last_items[0] if isinstance(last_items[0], dict) else None
            item_name = str(
                (last_item or {}).get("item_name")
                or (last_item or {}).get("name")
                or ""
            ).strip()
            if item_name:
                return _make_resolved(
                    intent="add_items",
                    confidence=1.0,
                    items=[{
                        "item_name": item_name,
                        "item_query": item_name,
                        "quantity": 1,
                        "modifiers": [],
                        "notes": [],
                        "follow_up_ref": item_name,
                        "use_defaults": False,
                    }],
                    needs_clarification=False,
                    reason="add_one_more_pattern",
                    source="layer2_add_one_more",
                    route_to_fallback=False,
                )

    # If the message contains a known menu category name and a query-like
    # word, route to list_category_items without the LLM.
    category_names = await _get_category_names_for_routing()
    normalized_words = set(normalized.split())

    matched_category = None
    category_match_map = _build_category_match_map(category_names)
    for match_form, canonical_name in sorted(
        category_match_map.items(), key=lambda item: -len(item[0])
    ):
        if re.search(rf"(?<!\w){re.escape(match_form)}(?!\w)", normalized):
            matched_category = canonical_name
            break

    if matched_category and not _MULTI_INTENT_SIGNALS.search(normalized):
        bare_category = normalized.strip("?").strip()
        is_bare_category = (
            bare_category == matched_category.lower()
            or (
                bare_category in category_match_map
                and category_match_map[bare_category] == matched_category
            )
        )
        has_query_word = bool(normalized_words & _CATEGORY_QUERY_WORDS)

        if is_bare_category or has_query_word:
            return {
                "intent": "list_category_items",
                "items": [{"category": matched_category}],
                "confidence": 0.95,
                "needs_clarification": False,
                "reason": "category_name_match",
                "source": "layer2_category",
                "route_to_fallback": False,
                "fallback_needed": False,
                "follow_up_ref": None,
            }

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Layer 4 — Resolver / Validator
# ─────────────────────────────────────────────────────────────────────────────

def _layer4_resolve(
    raw: dict,
    normalized_message: str,
    session: dict,
    menu: list,
) -> dict:
    """
    Enriches, validates, and makes the final routing decision.
    Does NOT reclassify intent — only adds context, resolves references,
    normalises quantities, and sets route_to_fallback.

    When raw["operations"] is present, resolves each operation independently
    and returns them on result["operations"] while keeping legacy top-level
    fields mirrored from the first resolved operation.
    """
    operations = raw.get("operations") or []

    if operations:
        top_confidence = float(raw.get("confidence") or 0.0)
        resolved_ops = []
        for op in operations:
            # Build a synthetic single-op raw dict so existing logic can process it.
            # Inject the top-level confidence since per-operation dicts don't carry it.
            synthetic_raw = {
                "intent": op.get("intent"),
                "items": op.get("items") or [],
                "follow_up_ref": op.get("follow_up_ref"),
                "needs_clarification": op.get("needs_clarification", False),
                "reason": op.get("reason") or "",
                "confidence": top_confidence,
                "fallback_needed": raw.get("fallback_needed", False),
            }
            op_resolved = _layer4_resolve(synthetic_raw, normalized_message, session, menu)
            if op_resolved.get("route_to_fallback"):
                op_resolved["intent"] = "unknown"
            resolved_ops.append(op_resolved)

        if not resolved_ops:
            return _make_resolved(
                intent=raw.get("intent") or "unknown",
                confidence=top_confidence,
                items=list(raw.get("items") or []),
                follow_up_ref=raw.get("follow_up_ref"),
                needs_clarification=bool(raw.get("needs_clarification", False)),
                reason=raw.get("reason") or "",
                source="llm",
                route_to_fallback=bool(raw.get("fallback_needed", False)),
                operations=[],
            )

        primary = resolved_ops[0]
        return _make_resolved(
            intent=primary.get("intent") or "unknown",
            confidence=min(float(op.get("confidence") or 0.0) for op in resolved_ops),
            items=list(primary.get("items") or []),
            follow_up_ref=primary.get("follow_up_ref"),
            needs_clarification=bool(primary.get("needs_clarification", False)),
            reason=primary.get("reason") or "",
            source=primary.get("source") or "llm",
            route_to_fallback=bool(primary.get("route_to_fallback", False)),
            operations=resolved_ops,
        )

    # ── Single-op path (unchanged) ─────────────────────────────────────────────
    result = _make_resolved(
        intent=raw.get("intent") or "unknown",
        confidence=float(raw.get("confidence") or 0.0),
        items=list(raw.get("items") or []),
        follow_up_ref=raw.get("follow_up_ref"),
        needs_clarification=bool(raw.get("needs_clarification", False)),
        reason=raw.get("reason") or "",
        source="llm",
        route_to_fallback=False,
    )

    if result["intent"] not in _VALID_INTENTS:
        result["intent"] = "unknown"
        result["confidence"] = 0.0
        result["reason"] = "invalid_intent_from_llm"

    # ── 4a: Bare-affirmation context gate ─────────────────────────────────────
    # Deterministic intercept: if the entire message is a bare affirmation we
    # override whatever the LLM returned — including any spurious
    # "confirm_checkout" — and route purely on session stage.  This makes the
    # gate immune to LLM variance.
    if normalized_message in _BARE_AFFIRMATIONS:
        session_id = session.get("session_id") or ""
        stage = get_session_stage(session_id)
        if stage == "checkout_summary":
            result["intent"] = "confirm_checkout"
            result["confidence"] = 1.0
            result["source"] = "resolver"
            result["route_to_fallback"] = False
            result["fallback_needed"] = False
        else:
            result["intent"] = "unknown"
            result["reason"] = "bare_affirmation_needs_context"
            result["route_to_fallback"] = True
            result["fallback_needed"] = True
        return result  # short-circuit — skip all remaining resolver steps

    # ── 4b: Follow-up reference resolution ───────────────────────────────────
    # This remains load-bearing for legacy resolved dict flows that still need
    # item back-references materialized before later intent-specific branches.
    # The compiler duplicates this logic for the typed path.
    visible_choice = _visible_choice_for_ordinal(normalized_message, session)
    if visible_choice and result["intent"] in {"add_items", "describe_item"}:
        item_name = str(visible_choice.get("item_name") or visible_choice.get("label") or "").strip()
        if item_name:
            existing_item = result["items"][0] if result["items"] and isinstance(result["items"][0], dict) else {}
            existing_modifiers = [
                str(modifier).strip()
                for modifier in (existing_item.get("modifiers") or [])
                if str(modifier).strip()
            ]
            ordinal_modifiers = existing_modifiers or (
                _ordinal_add_modifiers_from_message(normalized_message)
                if result["intent"] == "add_items"
                else []
            )
            result["items"] = [{
                "item_name": item_name,
                "item_query": item_name,
                "quantity": 1 if result["intent"] == "add_items" else None,
                "modifiers": ordinal_modifiers,
                "notes": [],
                "follow_up_ref": None,
                "use_defaults": False,
            }]
            result["follow_up_ref"] = None
            result["confidence"] = max(result["confidence"], 0.95)
            result["reason"] = "visible_choice_ordinal_resolved"
            result["route_to_fallback"] = False
            result["fallback_needed"] = False
    elif _is_ordinal_reference(normalized_message) and result.get("follow_up_ref"):
        result["intent"] = "unknown"
        result["items"] = []
        result["follow_up_ref"] = None
        result["needs_clarification"] = True
        result["reason"] = "visible_choice_ordinal_unresolvable"
        result["route_to_fallback"] = True
        result["fallback_needed"] = True

    if result["follow_up_ref"] is not None:
        session_items: list = session.get("last_items") or []
        if isinstance(session_items, list) and session_items:
            session_item = session_items[0]
            if isinstance(session_item, dict) and (session_item.get("item_name") or "").strip():
                items = result["items"]
                has_named_item = any(
                    (i.get("item_name") or "").strip() for i in items
                )
                if not has_named_item:
                    # Carry the session item forward; keep quantity if the LLM
                    # specified one (e.g. "actually make that 3").
                    llm_quantity: int | None = (
                        items[0].get("quantity") if items else None
                    )
                    resolved_item = dict(session_item)
                    if result["intent"] in {"add_items", "repeat_order"}:
                        resolved_item["quantity"] = llm_quantity if llm_quantity is not None else 1
                    elif result["intent"] == "update_quantity":
                        resolved_item["quantity"] = llm_quantity
                    elif llm_quantity is not None:
                        resolved_item["quantity"] = llm_quantity
                    if (
                        result["intent"] in {"add_items", "repeat_order"}
                        and resolved_item.get("quantity") is None
                    ):
                        resolved_item["quantity"] = 1
                    result["items"] = [resolved_item]
        else:
            # Reference present but no session context to resolve against
            result["needs_clarification"] = True

    # ── 4c: update_quantity / remove_item should target exactly one item ─────
    if result["intent"] in {"update_quantity", "remove_item"} and len(result["items"]) > 1:
        result["confidence"] = min(result["confidence"], 0.4)
        result["needs_clarification"] = True

    if result["intent"] == "update_quantity":
        explicit_quantity = _extract_explicit_quantity(normalized_message)
        if explicit_quantity is not None:
            for item in result["items"]:
                if isinstance(item, dict) and item.get("quantity") is None:
                    item["quantity"] = explicit_quantity

    # ── 4d: Menu entity matching (deferred) ───────────────────────────────────
    # Execution-layer already fuzzy-matches item names against the menu catalog.
    # Full pre-flight matching here would require an async call and is deferred
    # to the execution layer to avoid an extra network round-trip on every turn.
    # If the caller passes a non-empty menu list this could be wired up later.

    # ── 4e: Quantity normalization ────────────────────────────────────────────
    for item in result["items"]:
        if not isinstance(item, dict):
            continue
        qty = item.get("quantity")
        if qty is None:
            # Default quantity for ordering intents
            if result["intent"] in {"add_items", "repeat_order"}:
                item["quantity"] = 1
        elif isinstance(qty, (int, float)) and int(qty) > 20:
            # Suspiciously large quantity — ask for clarification
            result["needs_clarification"] = True

    # ── 4f: Final routing decision ────────────────────────────────────────────
    # Route to the fallback assistant for low-confidence or unresolvable intents.
    # needs_clarification alone does NOT force fallback — the execution layer can
    # return a targeted clarification prompt instead of a generic fallback reply.
    if (
        (result["confidence"] < 0.6 and result["intent"] != "guided_order_response")
        or result["intent"] == "unknown"
    ):
        result["route_to_fallback"] = True
        result["fallback_needed"] = True

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def resolve_intent(
    message: str,
    session: dict,
    cart: dict,
    menu: list,
) -> dict:
    """
    Run the full 3-layer intent pipeline and return a resolved intent object.

    Args:
        message:  The already-normalised user message (lowercase, trimmed).
        session:  The current session dict (must contain "session_id").
        cart:     Current cart contents (reserved for future use in Layer 4d).
        menu:     Menu catalog (reserved for future entity-matching in Layer 4d).

    Returns:
        A dict with keys: intent, confidence, items, follow_up_ref,
        needs_clarification, reason, source, route_to_fallback, fallback_needed.
    """
    # Belt-and-suspenders normalisation in case the caller skips it
    normalized = " ".join(message.strip().lower().split())
    session_stage = session.get("stage")
    session_id = session.get("session_id") or ""
    if session_id:
        session_stage = get_session_stage(session_id)

    # ── Layer 2: Deterministic Router ────────────────────────────────────────
    deterministic = await _layer2_deterministic(
        normalized,
        session_stage=session_stage,
        session=session,
    )
    if deterministic is not None:
        logger.info({
            "stage": "pipeline_layer2_match",
            "normalized": normalized,
            "intent": deterministic["intent"],
        })
        return deterministic

    # ── Layer 3: LLM Intent Parser ────────────────────────────────────────────
    guided_current_group = None
    guided_order_phase = None
    guided_groups = session.get("guided_order_groups") or []
    guided_step = int(session.get("guided_order_step") or 0)
    guided_item_name = session.get("guided_order_item_name")
    if (
        session_stage == "guided_ordering"
        and isinstance(guided_groups, list)
        and 0 <= guided_step < len(guided_groups)
        and isinstance(guided_groups[guided_step], dict)
    ):
        guided_current_group = guided_groups[guided_step].get("name")
    elif session_stage == "guided_ordering":
        guided_current_group = "Special Instructions"

    if session_id and session_stage == "guided_ordering":
        guided_order_phase = get_guided_order_phase(session_id)

    last_bot_message = str(session.get("last_bot_response") or "").strip()[:200]
    last_user_message = str(session.get("last_user_message") or "").strip()[:100]
    last_added_items = [
        str(item.get("item_name") or item.get("name") or "").strip()
        for item in (session.get("last_items") or [])
        if isinstance(item, dict)
        and str(item.get("item_name") or item.get("name") or "").strip()
    ][:3]
    cart_item_names = [
        str(item.get("item_name") or item.get("name") or "").strip()
        for item in (session.get("cart_items") or [])
        if isinstance(item, dict)
        and str(item.get("item_name") or item.get("name") or "").strip()
    ][:5]
    visible_choices = [
        str(choice.get("label") or choice.get("item_name") or "").strip()
        for choice in (session.get("last_visible_choices") or [])
        if isinstance(choice, dict)
        and str(choice.get("label") or choice.get("item_name") or "").strip()
    ][:8]

    raw = await try_interpret_message(
        normalized,
        context={
            "session_stage": session_stage,
            "guided_order_phase": guided_order_phase,
            "guided_current_group": guided_current_group,
            "guided_order_item_name": guided_item_name,
            "last_bot_message": last_bot_message,
            "last_user_message": last_user_message,
            "last_added_items": last_added_items,
            "cart_item_names": cart_item_names,
            "visible_choices": visible_choices,
        },
    )
    if raw is None:
        logger.warning({
            "stage": "pipeline_layer3_failed",
            "normalized": normalized,
        })
        return _make_resolved(
            intent="unknown",
            confidence=0.0,
            reason="llm_parse_failed",
            source="llm",
            route_to_fallback=True,
        )

    logger.info({
        "stage": "pipeline_layer3_result",
        "normalized": normalized,
        "intent": raw.get("intent"),
        "confidence": raw.get("confidence"),
        "follow_up_ref": raw.get("follow_up_ref"),
    })

    # ── Layer 4: Resolver / Validator ─────────────────────────────────────────
    resolved = _layer4_resolve(raw, normalized, session, menu)

    logger.info({
        "stage": "pipeline_layer4_result",
        "normalized": normalized,
        "intent": resolved["intent"],
        "confidence": resolved["confidence"],
        "route_to_fallback": resolved["route_to_fallback"],
        "reason": resolved["reason"],
        "source": resolved["source"],
    })

    return resolved
