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
from app.utils.normalize import normalize_user_message


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
    "you have",
    "u have",
    "o you have",
    "o u have",
    "have you got",
    "tell me about",
    "tell me more",
    "tell me more about",
    "what about",
    "how about",
    "describe",
    "what is",
    "what's",
    "whats",
    "can you describe",
    "can u describe",
]

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

_STRIP_WORDS = {
    "what", "which", "are", "is", "the", "for", "of", "a", "an",
    "available", "avialable", "availble", "avalable",
    "do", "you", "have", "can", "tell", "me", "about",
    "o",
    "describe", "please", "pls", "u", "in", "on", "this", "options",
    "sizes", "size", "flavors", "flavour", "flavours", "flavor",
    "toppings", "topping", "milk", "add-ons", "addons", "add-on",
    "addon", "variants", "variant", "comes", "with", "whats", "s",
    "it",
}

_DIETARY_ALIASES: dict[str, list[str]] = {
    "vegan": ["vegan", "plant based", "plant-based", "no dairy", "dairy free", "dairy-free"],
    "vegetarian": ["vegetarian", "veggie"],
    "gluten-free": ["gluten free", "gluten-free", "no gluten"],
    "dairy-free": ["dairy free", "dairy-free", "no dairy", "lactose free", "lactose-free"],
}


def is_menu_detail_query(message: str) -> bool:
    msg = message.lower()
    return any(phrase in msg for phrase in DETAIL_TRIGGER_PHRASES)


def extract_detail_query(message: str) -> tuple[str, str | None]:
    msg = re.sub(r"[^a-z0-9\s\-]+", " ", message.lower()).strip()

    focus: str | None = None
    for kw, mapped in _FOCUS_MAP.items():
        if re.search(r"\b" + re.escape(kw) + r"\b", msg):
            focus = mapped
            break

    prefixes = [
        "do you have",
        "do u have",
        "you have",
        "u have",
        "o you have",
        "o u have",
        "have you got",
        "can you describe",
        "can u describe",
        "can you tell me about",
        "can u tell me about",
        "tell me about",
        "what about",
        "how about",
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
    ]
    for prefix in prefixes:
        if msg.startswith(prefix):
            msg = msg[len(prefix):].strip()
            break

    msg = re.sub(r"\b(have|offer|available|offered)\b\??\s*$", "", msg).strip()
    msg = re.sub(r"\?$", "", msg).strip()

    tokens = [token for token in msg.split() if token and token not in _STRIP_WORDS]
    item_name = " ".join(tokens).strip()
    return item_name, focus


def _normalize_item_query_alias(item_name: str) -> str:
    normalized = normalize_user_message(str(item_name or "")).strip().lower()
    return re.sub(r"\s+", " ", normalized)


def _looks_like_ice_cream_query(item_name: str) -> bool:
    normalized = _normalize_item_query_alias(item_name)
    tokens = normalized.split()
    if len(tokens) != 2:
        return False

    first, second = tokens
    return first == "ice" and SequenceMatcher(None, second, "cream").ratio() >= 0.72


def _is_availability_question(message: str) -> bool:
    msg = (message or "").lower().strip()
    return (
        msg.startswith("do you have")
        or msg.startswith("do u have")
        or msg.startswith("you have")
        or msg.startswith("u have")
        or msg.startswith("o you have")
        or msg.startswith("o u have")
        or msg.startswith("have you got")
        or bool(re.search(r"\bis\s+.+\s+available\b", msg))
    )


def _extract_dietary_preferences(message: str, item_query: str) -> list[str]:
    hay = f"{(message or '').lower()} {(item_query or '').lower()}"
    matched: list[str] = []
    for canonical, aliases in _DIETARY_ALIASES.items():
        if any(alias in hay for alias in aliases):
            matched.append(canonical)
    return matched


def _find_dietary_menu_matches(menu_items: list[dict], preferences: list[str], limit: int = 5) -> list[str]:
    if not preferences:
        return []

    results: list[str] = []
    seen: set[str] = set()

    for item in menu_items:
        if not isinstance(item, dict):
            continue
        if item.get("isAvailable", True) is False:
            continue

        name = str(item.get("name") or "").strip()
        if not name:
            continue

        hay = " ".join(
            [
                str(item.get("name") or ""),
                str(item.get("description") or ""),
                str(item.get("category") or ""),
                str(item.get("subcategory") or ""),
            ]
        ).lower()

        matched_all = True
        for pref in preferences:
            aliases = _DIETARY_ALIASES.get(pref, [pref])
            if not any(alias in hay for alias in aliases):
                matched_all = False
                break

        if matched_all:
            key = name.lower()
            if key not in seen:
                seen.add(key)
                results.append(name)
            if len(results) >= limit:
                break

    return results


def _resolve_ordinal_reference(message: str, session: dict | None) -> str:
    if not isinstance(session, dict):
        return ""

    candidates = session.get("last_recommendation_items")
    if not isinstance(candidates, list):
        return ""

    names = [str(name).strip() for name in candidates if isinstance(name, str) and str(name).strip()]
    if not names:
        return ""

    msg = (message or "").lower()
    if any(phrase in msg for phrase in ["first one", "1st", "number one", "the first"]):
        return names[0]
    if len(names) >= 2 and any(phrase in msg for phrase in ["second one", "2nd", "number two", "the second"]):
        return names[1]
    if len(names) >= 3 and any(phrase in msg for phrase in ["third one", "3rd", "number three", "the third"]):
        return names[2]
    if any(phrase in msg for phrase in ["last one", "the last"]):
        return names[-1]

    return ""


def _is_confident_availability_match(item_query: str, matched_item: dict | None) -> bool:
    if not item_query or not isinstance(matched_item, dict):
        return False

    query = normalize_user_message(str(item_query or ""))
    matched_name = normalize_user_message(str(matched_item.get("name") or ""))
    query = " ".join(query.lower().strip().split())
    matched_name = " ".join(matched_name.lower().strip().split())
    if not query or not matched_name:
        return False

    if query == matched_name:
        return True

    query_words = set(query.split())
    matched_words = set(matched_name.split())
    if query_words.issubset(matched_words):
        return True

    if len(query_words) == 1 and len(matched_words) == 1:
        q = next(iter(query_words))
        m = next(iter(matched_words))
        if q[:3] == m[:3] and SequenceMatcher(None, q, m).ratio() >= 0.72:
            return True

    return SequenceMatcher(None, query, matched_name).ratio() >= 0.84


def _fmt_price(value) -> str:
    return f"L.L {int(float(value or 0)):,}"


def _group_label(group: dict) -> str:
    return (
        str(group.get("customerLabel") or "").strip()
        or str(group.get("name") or "").strip()
        or str(group.get("adminName") or "").strip()
    )


def _build_variants_text(variants: list[dict], focus: str | None) -> str:
    if not isinstance(variants, list) or not variants:
        return ""

    lines: list[str] = []
    for group in variants:
        if not isinstance(group, dict):
            continue

        group_name = _group_label(group)
        if not group_name:
            continue

        if focus and focus.lower() not in group_name.lower():
            continue

        options = group.get("options") or []
        active_options = [
            option for option in options
            if isinstance(option, dict) and option.get("isActive", True) is not False and option.get("name")
        ]
        if not active_options:
            continue

        max_sel = group.get("maxSelections", 1)
        header = f"{group_name} (pick up to {max_sel})" if max_sel and max_sel > 1 else group_name
        lines.append(header)

        for option in active_options:
            opt_name = option.get("name", "").strip()
            price_delta = option.get("additionalPrice") or option.get("priceDelta") or 0
            if price_delta and float(price_delta) > 0:
                lines.append(f"- {opt_name} (+{_fmt_price(price_delta)})")
            else:
                lines.append(f"- {opt_name}")

        lines.append("")

    return "\n".join(lines).strip()


def build_item_detail_reply(source_item: dict, focus: str | None = None) -> str:
    item_name = (source_item.get("name") or "This item").strip()
    description = (source_item.get("description") or "").strip()
    base_price = source_item.get("basePrice") or source_item.get("price")
    variants = get_menu_detail_variants(source_item)

    parts: list[str] = []
    parts.append(f"{item_name}\n{description}" if description else item_name)

    if base_price:
        parts.append(f"\nStarting price: {_fmt_price(base_price)}")

    variants_text = _build_variants_text(variants, focus)
    if variants_text:
        parts.append(f"\n{variants_text}")
    elif focus:
        parts.append(f"\nNo {focus} options were found for {item_name}.")

    return "\n".join(parts)


async def process_describe_item(
    *,
    session_id: str,
    normalized_message: str,
    intent: str,
    cart_id: str | None,
) -> ChatMessageResponse:
    from app.services.tools import fetch_menu_items, fetch_menu_item_detail, find_menu_item_by_name
    from app.services.session_store import get_session, set_session_stage

    item_name, focus = extract_detail_query(normalized_message)
    item_name = _normalize_item_query_alias(item_name)
    is_availability_query = _is_availability_question(normalized_message)
    is_ice_cream_query = _looks_like_ice_cream_query(item_name)

    if not item_name:
        fallback = re.sub(r"[^a-z0-9\s\-]+", " ", (normalized_message or "").lower()).strip()
        fallback = re.sub(
            r"^(do you have|do u have|you have|u have|o you have|o u have|have you got|can you describe|can u describe|tell me about|describe|what is|what s|whats)\s+",
            "",
            fallback,
        ).strip()
        tokens = [token for token in fallback.split() if token and token not in _STRIP_WORDS]
        item_name = " ".join(tokens).strip()
        item_name = _normalize_item_query_alias(item_name)
        is_ice_cream_query = _looks_like_ice_cream_query(item_name)

    sess = get_session(session_id)

    if not item_name and sess:
        candidate = sess.get("last_item_query") or sess.get("last_described_item")
        if not candidate:
            last_items = sess.get("last_items")
            if isinstance(last_items, list) and last_items and isinstance(last_items[0], dict):
                candidate = last_items[0].get("item_name")

        if isinstance(candidate, str) and candidate.strip():
            item_name = _normalize_item_query_alias(candidate)
            is_ice_cream_query = _looks_like_ice_cream_query(item_name)

    if sess:
        ordinal_item = _resolve_ordinal_reference(normalized_message, sess)
        if ordinal_item:
            item_name = _normalize_item_query_alias(ordinal_item)
            is_ice_cream_query = _looks_like_ice_cream_query(item_name)

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
            metadata={"normalized_message": normalized_message, "pipeline_stage": "describe_item_missing_query"},
        )

    menu_items = await fetch_menu_items()

    dietary_preferences = _extract_dietary_preferences(normalized_message, item_name)
    if is_availability_query and dietary_preferences:
        dietary_matches = _find_dietary_menu_matches(menu_items, dietary_preferences)
        dietary_label = " and ".join(dietary_preferences)
        if dietary_matches:
            lines = "\n".join(f"- {name}" for name in dietary_matches)
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=f"Yes, we have some {dietary_label} options:\n{lines}",
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "item_query": item_name,
                    "dietary_preferences": dietary_preferences,
                    "pipeline_stage": "describe_item_dietary_match",
                },
            )

        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=(
                f"I don't currently see items explicitly labeled {dietary_label}. "
                "If you'd like, I can suggest customizable drinks and food options."
            ),
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "item_query": item_name,
                "dietary_preferences": dietary_preferences,
                "pipeline_stage": "describe_item_dietary_no_match",
            },
        )

    matched_item = await find_menu_item_by_name(menu_items, item_name)
    if is_availability_query and matched_item and not _is_confident_availability_match(item_name, matched_item):
        matched_item = None

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
            metadata={"normalized_message": normalized_message, "item_query": item_name, "pipeline_stage": "describe_item_unavailable"},
        )

    if not matched_item:
        if is_ice_cream_query:
            reply = "No, we don't have ice cream right now, but we do have frozen yogurt."
        elif is_availability_query:
            reply = f"No, we don't have {item_name} right now."
        else:
            reply = f"I couldn't find \"{item_name}\" on the menu. Want me to recommend something?"
        if not is_availability_query and not is_ice_cream_query and item_name:
            set_session_stage(session_id, "recommendation_requested")
            sess = get_session(session_id)
            if sess:
                sess["last_recommendation_query"] = item_name
                sess["last_item_query"] = item_name

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
                "recommendation_category": item_name if not is_ice_cream_query else None,
            },
        )

    menu_item_id = matched_item.get("id") or matched_item.get("_id")
    item_detail = await fetch_menu_item_detail(menu_item_id) if menu_item_id is not None else None
    source_item = item_detail if isinstance(item_detail, dict) else matched_item

    sess = get_session(session_id)
    if sess and item_name:
        sess["last_item_query"] = item_name

    detail_text = build_item_detail_reply(source_item, focus=focus)
    reply_text = f"Yes, we have {(source_item.get('name') or matched_item.get('name') or item_name).strip()}.\n\n{detail_text}" if is_availability_query else detail_text

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
            "matched_item": {"id": matched_item.get("id") or matched_item.get("_id"), "name": matched_item.get("name")},
            "pipeline_stage": "describe_item_done",
        },
    )
