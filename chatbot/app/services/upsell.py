import random
from typing import Any

from app.services.tools import fetch_combo_suggestions

# Cooldown: tracks the last turn index when upsell was shown per session
_upsell_last_shown: dict[str, int] = {}
_session_turn_counter: dict[str, int] = {}

UPSELL_COOLDOWN_TURNS = 3  # don't upsell again for 3 turns after showing one

_NO_UPSELL_INTENTS = {"checkout", "clear_cart", "remove_item"}
MIN_COMBO_COUNT_FOR_UPSELL = 2

_PAIR_FUN_FACTS = {
    ("latte", "cheese croissant"): "The creamy body of a latte balances the flaky, salty richness of a cheese croissant.",
    ("cappuccino", "croissant"): "Foamy cappuccino and buttery pastry is a classic cafe pairing because texture contrast makes both stand out.",
    ("espresso", "dessert"): "Espresso is often paired with sweets because bitterness helps highlight dessert flavors.",
}


def _safe_lower(value: Any) -> str:
    return str(value).lower() if value else ""


def _is_drink_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    hay = f"{category} {subcategory}"
    return any(
        word in hay
        for word in [
            "beverage",
            "beverages",
            "coffee",
            "latte",
            "tea",
            "drink",
            "drinks",
            "frap",
            "frappe",
        ]
    )


def _is_food_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    hay = f"{category} {subcategory}"
    return any(
        word in hay
        for word in [
            "pastry",
            "pastries",
            "dessert",
            "desserts",
            "bakery",
            "cake",
            "cakes",
            "cookie",
            "cookies",
            "muffin",
            "muffins",
            "croissant",
            "croissants",
        ]
    )


def _is_complementary_pair(anchor_item: dict[str, Any] | None, suggested_item: dict[str, Any] | None) -> bool:
    anchor_is_drink = _is_drink_item(anchor_item)
    anchor_is_food = _is_food_item(anchor_item)
    suggested_is_drink = _is_drink_item(suggested_item)
    suggested_is_food = _is_food_item(suggested_item)

    # Be conservative: only treat as "perfect pairing" if both sides are classifiable.
    if not (anchor_is_drink or anchor_is_food):
        return False
    if not (suggested_is_drink or suggested_is_food):
        return False

    return (anchor_is_drink and suggested_is_food) or (anchor_is_food and suggested_is_drink)


def _build_combo_fun_fact(anchor_item: dict[str, Any] | None, suggested_item: dict[str, Any] | None) -> str | None:
    anchor_name = _safe_lower(anchor_item.get("name") if anchor_item else "")
    suggested_name = _safe_lower(suggested_item.get("name") if suggested_item else "")

    if anchor_name and suggested_name:
        direct = _PAIR_FUN_FACTS.get((anchor_name, suggested_name))
        if direct:
            return direct

    anchor_is_drink = _is_drink_item(anchor_item)
    anchor_is_food = _is_food_item(anchor_item)
    suggested_is_drink = _is_drink_item(suggested_item)
    suggested_is_food = _is_food_item(suggested_item)

    if anchor_is_drink and suggested_is_food:
        return "Drink + pastry pairings work well because sweetness can soften coffee bitterness."
    if anchor_is_food and suggested_is_drink:
        return "A warm or iced drink helps cleanse the palate between rich pastry bites."
    return None


def should_upsell(session_id: str, intent: str, cart_items: list[dict]) -> bool:
    if intent in _NO_UPSELL_INTENTS:
        return False
    if not cart_items:
        return False

    # Increment turn counter for this session
    turn = _session_turn_counter.get(session_id, 0) + 1
    _session_turn_counter[session_id] = turn

    last_shown = _upsell_last_shown.get(session_id, -999)
    if turn - last_shown < UPSELL_COOLDOWN_TURNS:
        return False

    return True


async def suggest_upsell_items(
    cart_items: list[dict],
    menu_items: list[dict],
    limit: int = 1,
) -> list[dict]:
    menu_by_id = {
        int(item.get("id")): item
        for item in menu_items
        if item.get("id") is not None
    }
    menu_by_name = {
        _safe_lower(item.get("name")): item
        for item in menu_items
        if item.get("name")
    }
    cart_names = {_safe_lower(i.get("name")) for i in cart_items}
    cart_menu_item_ids = {
        int(i.get("menuItemId"))
        for i in cart_items
        if i.get("menuItemId") is not None
    }
    cart_categories = {_safe_lower(i.get("category")) for i in cart_items}

    combo_stats = await fetch_combo_suggestions(
        anchor_menu_item_ids=sorted(cart_menu_item_ids),
        exclude_menu_item_ids=sorted(cart_menu_item_ids),
        limit=max(limit * 3, 5),
    )
    combo_candidates = []
    combo_fun_facts_by_id: dict[int, str] = {}
    seen_combo_ids: set[int] = set()
    for combo in combo_stats:
        suggested_menu_item_id = combo.get("suggestedMenuItemId")
        if suggested_menu_item_id is None:
            continue
        combo_count = int(combo.get("count") or 0)
        if combo_count < MIN_COMBO_COUNT_FOR_UPSELL:
            continue

        item = menu_by_id.get(int(suggested_menu_item_id))
        if not item:
            continue

        anchor_menu_item_id = combo.get("anchorMenuItemId")
        anchor_item = menu_by_id.get(int(anchor_menu_item_id)) if anchor_menu_item_id is not None else None
        if not _is_complementary_pair(anchor_item, item):
            continue

        if not item.get("isAvailable", True):
            continue
        if int(suggested_menu_item_id) in seen_combo_ids:
            continue
        seen_combo_ids.add(int(suggested_menu_item_id))
        fun_fact = _build_combo_fun_fact(anchor_item, item)
        if fun_fact:
            combo_fun_facts_by_id[int(suggested_menu_item_id)] = fun_fact
        combo_candidates.append(item)

    has_drink = any(
        w in cat for cat in cart_categories
        for w in ["beverage", "coffee", "latte", "tea", "drink", "frap"]
    )
    has_food = any(
        w in cat for cat in cart_categories
        for w in ["pastry", "dessert", "bakery", "cake", "cookie", "muffin", "croissant"]
    )

    candidates = []
    for item in menu_items:
        if not item.get("isAvailable", True):
            continue
        name = _safe_lower(item.get("name", ""))
        if name in cart_names:
            continue
        cat = _safe_lower(item.get("category", ""))
        sub = _safe_lower(item.get("subcategory", ""))

        item_is_drink = any(w in cat or w in sub for w in ["beverage", "coffee", "latte", "tea", "drink", "frap"])
        item_is_food = any(w in cat or w in sub for w in ["pastry", "dessert", "bakery", "cake", "cookie", "muffin", "croissant"])

        # cross-suggest: cart has drink → suggest food, and vice versa
        if has_drink and item_is_food:
            candidates.append(item)
        elif has_food and item_is_drink:
            candidates.append(item)

    # Merge candidates while preserving combo priority and avoiding duplicates.
    merged_candidates: list[dict] = []
    seen_names: set[str] = set()

    for item in combo_candidates + candidates:
        name = _safe_lower(item.get("name"))
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        merged_candidates.append(item)

    if not merged_candidates:
        return []

    if combo_candidates:
        selected = merged_candidates[:limit]
    else:
        selected = random.sample(merged_candidates, min(limit, len(merged_candidates)))

    combo_candidate_ids = {
        int(item.get("id"))
        for item in combo_candidates
        if item.get("id") is not None
    }

    return [
        {
            "type": "upsell",
            "item_name": item["name"],
            "menu_item_id": item.get("id"),
            "upsell_source": "combo" if item.get("id") in combo_candidate_ids else "fallback",
            "fun_fact": combo_fun_facts_by_id.get(int(item.get("id"))) if item.get("id") in combo_candidate_ids and item.get("id") is not None else None,
        }
        for item in selected
    ]


async def get_upsell_suggestions(
    session_id: str,
    intent: str,
    cart_items: list[dict],
    menu_items: list[dict],
) -> list[dict]:
    if not should_upsell(session_id, intent, cart_items):
        return []
    suggestions = await suggest_upsell_items(cart_items, menu_items)
    if suggestions:
        _upsell_last_shown[session_id] = _session_turn_counter.get(session_id, 0)
    return suggestions
