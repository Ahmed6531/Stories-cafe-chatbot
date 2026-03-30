from typing import Any

from app.services.tools import fetch_recent_orders


# In-memory profile store by session. This keeps chatbot-only personalization
# logic self-contained until order-history wiring is implemented elsewhere.
_session_tag_scores: dict[str, dict[str, int]] = {}


def _safe_lower(value: Any) -> str:
    return str(value).lower() if value else ""


def _extract_tags(item: dict[str, Any] | None) -> set[str]:
    if not item:
        return set()

    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    name = _safe_lower(item.get("name"))
    hay = f"{category} {subcategory} {name}"

    tags: set[str] = set()

    if any(w in hay for w in ["coffee", "latte", "espresso", "cappuccino", "americano"]):
        tags.add("coffee")
    if any(w in hay for w in ["tea", "matcha", "chai"]):
        tags.add("tea")
    if any(w in hay for w in ["frap", "frappe", "iced"]):
        tags.add("cold")
    if any(w in hay for w in ["croissant", "pastry", "bakery", "cake", "cookie", "muffin"]):
        tags.add("pastry")
    if any(w in hay for w in ["cheese", "savory", "savory"]):
        tags.add("savory")
    if any(w in hay for w in ["chocolate", "caramel", "vanilla", "hazelnut", "sweet"]):
        tags.add("sweet")

    if "drink" in hay or "beverage" in hay:
        tags.add("drink")
    if "dessert" in hay or "pastry" in hay or "bakery" in hay:
        tags.add("food")

    return tags


def update_session_profile(
    session_id: str,
    cart_items: list[dict[str, Any]],
    menu_items: list[dict[str, Any]],
) -> None:
    menu_by_id = {
        int(item.get("id")): item
        for item in menu_items
        if item.get("id") is not None
    }

    profile = _session_tag_scores.setdefault(session_id, {})

    for cart_item in cart_items:
        source = None
        menu_item_id = cart_item.get("menuItemId")
        if menu_item_id is not None:
            source = menu_by_id.get(int(menu_item_id))
        if not source:
            source = cart_item

        for tag in _extract_tags(source):
            profile[tag] = profile.get(tag, 0) + 1


def pick_personalized_combo(
    session_id: str,
    combo_suggestions: list[dict[str, Any]],
    menu_items: list[dict[str, Any]],
    external_tag_hints: list[str] | None = None,
) -> dict[str, Any] | None:
    if not combo_suggestions:
        return None

    menu_by_id = {
        int(item.get("id")): item
        for item in menu_items
        if item.get("id") is not None
    }

    def _score(suggestion: dict[str, Any]) -> tuple[int, int]:
        tag_score = score_combo_for_session(
            session_id=session_id,
            suggestion=suggestion,
            menu_items=menu_items,
            external_tag_hints=external_tag_hints,
        )
        combo_weight = 10 if suggestion.get("upsell_source") == "combo" else 0
        return (combo_weight + tag_score, tag_score)

    ranked = sorted(combo_suggestions, key=_score, reverse=True)
    return ranked[0]


def score_combo_for_session(
    session_id: str,
    suggestion: dict[str, Any],
    menu_items: list[dict[str, Any]],
    external_tag_hints: list[str] | None = None,
) -> int:
    menu_by_id = {
        int(item.get("id")): item
        for item in menu_items
        if item.get("id") is not None
    }

    profile = dict(_session_tag_scores.get(session_id, {}))
    for tag in external_tag_hints or []:
        k = _safe_lower(tag).strip()
        if not k:
            continue
        profile[k] = profile.get(k, 0) + 3

    menu_item_id = suggestion.get("menu_item_id")
    item = None
    if menu_item_id is not None:
        item = menu_by_id.get(int(menu_item_id))

    tags = _extract_tags(item or suggestion)
    return sum(profile.get(tag, 0) for tag in tags)


def is_usual_combo_pick(
    session_id: str,
    suggestion: dict[str, Any],
    menu_items: list[dict[str, Any]],
    min_tag_score: int = 2,
    external_tag_hints: list[str] | None = None,
) -> bool:
    score = score_combo_for_session(
        session_id=session_id,
        suggestion=suggestion,
        menu_items=menu_items,
        external_tag_hints=external_tag_hints,
    )
    return score >= min_tag_score


async def get_order_history_tag_hints(
    session_id: str,
    user_id: str | None,
    limit: int = 50,
) -> list[str]:
    """
    Placeholder adapter for real order-history personalization.

    Current behavior (temporary): reads real orders from backend and filters by
    user_id when available.
    Future behavior: resolve user_id directly from session/auth context.
    """
    _ = session_id
    if not user_id:
        return []

    orders = await fetch_recent_orders(limit=limit)
    if not orders:
        return []

    tag_counts: dict[str, int] = {}

    for order in orders:
        order_user_id = order.get("userId")
        if str(order_user_id) != str(user_id):
            continue
        for line in order.get("items", []) or []:
            line_item = {
                "name": line.get("name"),
                # Order lines do not carry category/subcategory today.
                "category": "",
                "subcategory": "",
            }
            for tag in _extract_tags(line_item):
                tag_counts[tag] = tag_counts.get(tag, 0) + int(line.get("qty") or 1)

    if not tag_counts:
        return []

    ranked = sorted(tag_counts.items(), key=lambda kv: kv[1], reverse=True)
    return [tag for tag, _ in ranked[:4]]
