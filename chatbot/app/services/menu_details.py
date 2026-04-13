"""
menu_details.py
---------------
Handles "what options / sizes / flavors are available for <item>?" style queries.

Public API used by orchestrator.py:
  - is_menu_detail_query(message)   -> bool
  - extract_detail_query(message)   -> (item_name: str, focus: str | None)
  - process_describe_item(...)      -> ChatMessageResponse
"""

from __future__ import annotations

from difflib import SequenceMatcher
import re

from app.schemas.chat import ChatMessageResponse
from app.services.item_clarification import get_menu_detail_variants


# ---------------------------------------------------------------------------
# Keyword sets
# ---------------------------------------------------------------------------

# Phrases that route to this handler (used by detect_special_command /
# detect_intent in orchestrator to return "describe_item").
DETAIL_TRIGGER_PHRASES: list[str] = [
    "what sizes",
    "what size",
    "which sizes",
    "which size",
    "what flavors",
    "what flavour",
    "what flavours",
    "which flavors",
    "which flavour",
    "which flavours",
    "what toppings",
    "which toppings",
    "what options",
    "which options",
    "what milk",
    "which milk",
    "what add-ons",
    "what addons",
    "which add-ons",
    "which addons",
    "what comes with",
    "what variants",
    "which variants",
    "available for",
    "available in",
    "do you have",
    "do u have",
    "have you got",
    "tell me about",
    "describe",
    "what is",
    "what's",
    "whats",
    "can you describe",
    "can u describe",
]

# Maps user keywords to variant group name substrings for focused replies.
_FOCUS_MAP: dict[str, str] = {
    "size": "size",
    "sizes": "size",
    "flavor": "flavor",
    "flavour": "flavor",
    "flavors": "flavor",
    "flavours": "flavor",
    "topping": "topping",
    "toppings": "topping",
    "milk": "milk",
    "add-on": "add",
    "addon": "add",
    "add-ons": "add",
    "addons": "add",
}

# Words stripped when extracting the item name from a detail query.
_STRIP_WORDS = {
    "what", "which", "are", "is", "the", "for", "of", "a", "an",
    "available", "avialable", "availble", "avalable",  # common misspellings
    "do", "you", "have", "can", "tell", "me", "about",
    "describe", "please", "pls", "u", "in", "on", "this", "options",
    "sizes", "size", "flavors", "flavour", "flavours", "flavor",
    "toppings", "topping", "milk", "add-ons", "addons", "add-on",
    "addon", "variants", "variant", "comes", "with", "whats", "s",
    "it", "cost", "costs", "much", "price", "how", "does", "stock",
}


# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------

def is_menu_detail_query(message: str) -> bool:
    """Return True if the message looks like a menu-detail / describe query."""
    msg = message.lower()
    return any(phrase in msg for phrase in DETAIL_TRIGGER_PHRASES)


def extract_detail_query(message: str) -> tuple[str, str | None]:
    """
    Parse a menu-detail message into (item_name, focus).

    focus is a normalised variant-group keyword, e.g. "size", "flavor",
    "topping", "milk", "add" — or None if the user just asked generally.
    """
    msg = re.sub(r"[^a-z0-9\s\-]+", " ", message.lower()).strip()

    # Detect focus keyword before stripping
    focus: str | None = None
    for kw, mapped in _FOCUS_MAP.items():
        if re.search(r"\b" + re.escape(kw) + r"\b", msg):
            focus = mapped
            break

    # Remove known trigger prefixes
    prefixes = [
        "do you have",
        "do u have",
        "have you got",
        "can you describe",
        "can u describe",
        "can you tell me about",
        "can u tell me about",
        "tell me about",
        "what sizes are available for",
        "what size is available for",
        "which sizes are available for",
        "what flavors are available for",
        "what flavour is available for",
        "what flavours are available for",
        "which flavors are available for",
        "what toppings are available for",
        "which toppings are available for",
        "what options are available for",
        "which options are available for",
        "what options does",
        "what milk options are available for",
        "what milk options does",
        "what comes with",
        "what variants are available for",
        "which variants are available for",
        "available for",
        "available in",
        "describe",
        "what is",
        "what s",
        "whats",
        # Price query prefixes
        "how much is the",
        "how much is a",
        "how much is an",
        "how much is",
        "how much does the",
        "how much does a",
        "how much does",
        "how much for the",
        "how much for a",
        "how much for",
        "what is the price of the",
        "what is the price of",
        "what is the price for",
        "what's the price of the",
        "what's the price of",
        "what's the price for",
        "price of the",
        "price of",
        "price for",
        "cost of the",
        "cost of",
    ]
    for prefix in prefixes:
        if msg.startswith(prefix):
            msg = msg[len(prefix):].strip()
            break

    # Remove trailing "have", "offer", "available", "in stock", "on the menu" fragments
    msg = re.sub(r"\b(have|offer|available|offered|in\s+stock|on\s+(?:the\s+|your\s+)?menu)\b\??\s*$", "", msg).strip()
    msg = re.sub(r"\?$", "", msg).strip()

    # Strip noise words from remaining tokens
    tokens = [t for t in msg.split() if t and t not in _STRIP_WORDS]
    item_name = " ".join(tokens).strip()
    return item_name, focus


def _is_availability_question(message: str) -> bool:
    """Return True for direct availability checks like 'do you have X?'"""
    msg = (message or "").lower().strip()
    return (
        msg.startswith("do you have")
        or msg.startswith("do u have")
        or msg.startswith("have you got")
        or msg.startswith("do you sell")
        or msg.startswith("do you carry")
        or msg.startswith("do you serve")
        or msg.startswith("is there")
        or bool(re.search(r"\bis\s+.+\s+available\b", msg))
        or bool(re.search(r"\bin\s+stock\b", msg))
        or bool(re.search(r"\bon\s+(?:the\s+|your\s+)?menu\b", msg))
    )


def _is_confident_availability_match(item_query: str, matched_item: dict | None) -> bool:
    """Be stricter for yes/no availability checks to avoid weak fuzzy matches."""
    if not item_query or not isinstance(matched_item, dict):
        return False

    query = " ".join(str(item_query).lower().strip().split())
    matched_name = " ".join(str(matched_item.get("name") or "").lower().strip().split())
    if not query or not matched_name:
        return False

    if query == matched_name:
        return True

    # All words the user typed must appear in the matched item's name.
    # e.g. query="latte" → "iced latte" ✓ (subset)
    # but query="matcha latte" → "latte" ✗ ("matcha" missing)
    query_words = set(query.split())
    matched_words = set(matched_name.split())
    if query_words.issubset(matched_words):
        return True

    return SequenceMatcher(None, query, matched_name).ratio() >= 0.84


# ---------------------------------------------------------------------------
# Reply builder
# ---------------------------------------------------------------------------

def _fmt_price(value) -> str:
    return f"L.L {int(float(value or 0)):,}"


def _build_variants_text(variants: list[dict], focus: str | None) -> str:
    """Format variant groups into a readable reply section."""
    if not isinstance(variants, list) or not variants:
        return ""

    lines: list[str] = []
    for group in variants:
        if not isinstance(group, dict):
            continue

        group_name: str = (group.get("name") or "").strip()
        if not group_name:
            continue

        # If the user asked about a specific variant type, skip unrelated groups.
        if focus and focus.lower() not in group_name.lower():
            continue

        options = group.get("options") or []
        active_options = [
            o for o in options
            if isinstance(o, dict) and o.get("isActive", True) is not False and o.get("name")
        ]
        if not active_options:
            continue

        max_sel = group.get("maxSelections", 1)

        # Header line for the group
        if max_sel and max_sel > 1:
            header = f"{group_name} (pick up to {max_sel})"
        else:
            header = group_name
        lines.append(header)

        for opt in active_options:
            opt_name = opt.get("name", "").strip()
            price_delta = opt.get("additionalPrice") or opt.get("priceDelta") or 0
            if price_delta and float(price_delta) > 0:
                lines.append(f"• {opt_name} (+{_fmt_price(price_delta)})")
            else:
                lines.append(f"• {opt_name}")

        lines.append("")  # blank line between groups

    return "\n".join(lines).strip()


def build_item_detail_reply(
    source_item: dict,
    focus: str | None = None,
) -> str:
    """
    Build a human-readable reply for an item detail query.

    source_item should be the full detail dict returned by fetch_menu_item_detail.
    Falls back gracefully if variant groups are absent.
    """
    item_name = (source_item.get("name") or "This item").strip()
    description = (source_item.get("description") or "").strip()
    base_price = source_item.get("basePrice") or source_item.get("price")
    variants = get_menu_detail_variants(source_item)

    parts: list[str] = []

    # ---- Basic info --------------------------------------------------------
    if description:
        parts.append(f"{item_name}\n{description}")
    else:
        parts.append(item_name)

    if base_price:
        parts.append(f"\nStarting price: {_fmt_price(base_price)}")

    # ---- Variant groups ----------------------------------------------------
    variants_text = _build_variants_text(variants, focus)
    if variants_text:
        parts.append(f"\n{variants_text}")
    elif focus:
        # User asked about a specific group but none found
        parts.append(f"\nNo {focus} options were found for {item_name}.")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Main handler — called directly from orchestrator
# ---------------------------------------------------------------------------

async def process_describe_item(
    *,
    session_id: str,
    normalized_message: str,
    intent: str,
    cart_id: str | None,
) -> ChatMessageResponse:
    """
    Full handler for the describe_item intent.  Fetches item detail from the
    backend and returns a rich ChatMessageResponse.
    """
    from app.services.tools import (
        fetch_menu_items,
        fetch_menu_item_detail,
        find_menu_item_by_name,
    )

    # Determine query and focus
    item_name, focus = extract_detail_query(normalized_message)
    is_availability_query = _is_availability_question(normalized_message)

    # Keep extraction self-contained in this module.
    if not item_name:
        fallback = re.sub(r"[^a-z0-9\s\-]+", " ", (normalized_message or "").lower()).strip()
        fallback = re.sub(
            r"^(do you have|do u have|have you got|can you describe|can u describe|tell me about|describe|what is|what s|whats)\s+",
            "",
            fallback,
        ).strip()
        tokens = [t for t in fallback.split() if t and t not in _STRIP_WORDS]
        item_name = " ".join(tokens).strip()

    if not item_name:
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="Sure! Which menu item would you like to know more about?",
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
    matched_item = await find_menu_item_by_name(menu_items, item_name)
    if is_availability_query and matched_item and not _is_confident_availability_match(item_name, matched_item):
        matched_item = None

    # Item exists but is marked unavailable/out of stock
    if is_availability_query and matched_item and matched_item.get("isAvailable") is False:
        display_name = (matched_item.get("name") or item_name).strip()
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=f"Sorry, {display_name} is currently out of stock.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "item_query": item_name,
                "pipeline_stage": "describe_item_unavailable",
            },
        )

    if not matched_item:
        if is_availability_query:
            reply = f"No, we don't have {item_name} right now."
        else:
            reply = f"I couldn't find \"{item_name}\" on the menu. Want me to recommend something?"
        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=reply,
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "item_query": item_name,
                "pipeline_stage": "describe_item_not_found",
            },
        )

    menu_item_id = matched_item.get("id") or matched_item.get("_id")
    item_detail = await fetch_menu_item_detail(menu_item_id) if menu_item_id is not None else None
    source_item = item_detail if isinstance(item_detail, dict) else matched_item

    detail_text = build_item_detail_reply(source_item, focus=focus)
    if is_availability_query:
        display_name = (source_item.get("name") or matched_item.get("name") or item_name).strip()
        reply_text = f"Yes, we have {display_name}.\n\n{detail_text}"
    else:
        reply_text = detail_text

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
            "item_query": item_name,
            "focus": focus,
            "matched_item": {
                "id": matched_item.get("id") or matched_item.get("_id"),
                "name": matched_item.get("name"),
            },
            "pipeline_stage": "describe_item_done",
        },
    )
