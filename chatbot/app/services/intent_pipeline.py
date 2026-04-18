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
import time
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
    r"(?:\s+(?:do\s+you\s+have|you\s+have|you\s+serve|you\s+offer|options?|items?|menu))?(?:\s*\?)?$"
    r"|^do\s+you\s+have\s+any\s+(\w+)(?:\s*\?)?$"
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

# ── Dynamic category cache ────────────────────────────────────────
# Built from live menu data. Refreshed every 5 minutes.
# Falls back to hardcoded set if fetch fails.

_CATEGORY_CACHE: frozenset[str] = frozenset()
_CATEGORY_CACHE_TIMESTAMP: float = 0.0
_CATEGORY_CACHE_TTL: float = 300.0  # 5 minutes

_CATEGORY_KEYWORDS_FALLBACK: frozenset[str] = frozenset({
    "drink", "drinks", "beverage", "beverages",
    "coffee", "coffees", "tea", "teas",
    "juice", "juices", "smoothie", "smoothies",
    "milkshake", "milkshakes", "food", "foods",
    "eat", "snack", "snacks", "pastry", "pastries",
    "cake", "cakes", "dessert", "desserts",
    "sweet", "sweets", "sandwich", "sandwiches",
    "wrap", "wraps", "salad", "salads",
    "breakfast", "lunch", "brunch", "meal", "meals",
    "hot", "cold", "iced", "yogurt", "yogurts",
    "froyo", "platter", "platters", "bowl", "bowls",
})


async def _get_category_keywords() -> frozenset[str]:
    """
    Returns a frozenset of category keywords built from live menu data.
    Refreshes every 5 minutes. Falls back to hardcoded set on failure.
    """
    global _CATEGORY_CACHE, _CATEGORY_CACHE_TIMESTAMP

    now = time.monotonic()
    if (
        _CATEGORY_CACHE
        and (now - _CATEGORY_CACHE_TIMESTAMP) < _CATEGORY_CACHE_TTL
    ):
        return _CATEGORY_CACHE

    try:
        from app.services.tools import fetch_menu_items
        menu_items = await fetch_menu_items()

        keywords: set[str] = set()
        for item in menu_items:
            if not isinstance(item, dict):
                continue

            # Extract category name and subcategory
            cat = item.get("category")
            if isinstance(cat, dict):
                cat_name = str(cat.get("name") or "").strip().lower()
                if cat_name:
                    keywords.add(cat_name)
                    # Add singular/plural variants
                    if cat_name.endswith("s") and len(cat_name) > 3:
                        keywords.add(cat_name[:-1])
                    else:
                        keywords.add(cat_name + "s")
            elif isinstance(cat, str) and cat.strip():
                cat_name = cat.strip().lower()
                keywords.add(cat_name)
                if cat_name.endswith("s") and len(cat_name) > 3:
                    keywords.add(cat_name[:-1])
                else:
                    keywords.add(cat_name + "s")

            # Also extract subcategory if present
            subcat = item.get("subcategory")
            if isinstance(subcat, dict):
                subcat_name = str(subcat.get("name") or "").strip().lower()
                if subcat_name:
                    keywords.add(subcat_name)
            elif isinstance(subcat, str) and subcat.strip():
                keywords.add(subcat.strip().lower())

        # Always include fallback keywords so common terms always work
        keywords.update(_CATEGORY_KEYWORDS_FALLBACK)

        _CATEGORY_CACHE = frozenset(keywords)
        _CATEGORY_CACHE_TIMESTAMP = now
        logger.info({
            "stage": "category_cache_refreshed",
            "keyword_count": len(_CATEGORY_CACHE),
        })
        return _CATEGORY_CACHE

    except Exception as exc:
        logger.warning({
            "stage": "category_cache_fetch_failed",
            "error": str(exc),
        })
        return _CATEGORY_KEYWORDS_FALLBACK


# ─────────────────────────────────────────────────────────────────────────────
# Layer 2 — Deterministic Router
# ─────────────────────────────────────────────────────────────────────────────

async def _layer2_deterministic(normalized: str) -> Optional[dict]:
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
        candidate = (m.group(1) or m.group(2) or "").strip().lower()
        category_keywords = await _get_category_keywords()
        if candidate in category_keywords:
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

    # ── Layer 2: Deterministic Router ────────────────────────────────────────
    deterministic = await _layer2_deterministic(normalized)
    if deterministic is not None:
        logger.info({
            "stage": "pipeline_layer2_match",
            "normalized": normalized,
            "intent": deterministic["intent"],
        })
        return deterministic

    # ── Layer 3: LLM Intent Parser ────────────────────────────────────────────
    session_stage = session.get("stage")
    session_id = session.get("session_id") or ""
    if session_id:
        session_stage = get_session_stage(session_id)

    guided_current_group = None
    guided_order_phase = 1
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

    if session_id:
        guided_order_phase = get_guided_order_phase(session_id)

    raw = await try_interpret_message(
        normalized,
        context={
            "session_stage": session_stage,
            "guided_order_phase": guided_order_phase,
            "guided_current_group": guided_current_group,
            "guided_order_item_name": guided_item_name,
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
