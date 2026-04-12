import random
from typing import Any
from unicodedata import category


def safe_lower(value: Any) -> str:
    if value is None:
        return ""
    return str(value).lower()


# ---------------------------------------------------------------------------
# Category extraction from user message
# ---------------------------------------------------------------------------

_DRINK_KEYWORDS = {
    "drink", "drinks", "beverage", "beverages", "coffee", "coffees",
    "latte", "lattes", "tea", "teas", "frap", "frappe", "frappuccino",
    "espresso", "cappuccino", "americano", "cold brew", "iced",
    "hot drink", "hot drinks",
}
_FOOD_KEYWORDS = {
    "food", "foods", "eat", "snack", "snacks", "pastry", "pastries",
    "dessert", "desserts", "bakery", "cake", "cakes", "cookie", "cookies",
    "muffin", "muffins", "croissant", "croissants", "sandwich", "sandwiches",
    "something to eat", "bite",
}


def extract_recommendation_category(message: str) -> str | None:
    """Return 'drink', 'food', or None based on keywords in the message."""
    msg = message.lower()
    for kw in _DRINK_KEYWORDS:
        if kw in msg:
            return "drink"
    for kw in _FOOD_KEYWORDS:
        if kw in msg:
            return "food"
    return None


def filter_by_category(
    suggestions: list[dict],
    category_filter: str | None,
    menu_items_by_name: dict | None = None,
) -> list[dict]:
    """
    Filter suggestion dicts to only those matching category_filter ('drink' or 'food').
    Uses menu_items_by_name for a precise category lookup; falls through if unknown.
    """
    if not category_filter or not suggestions:
        return suggestions

    check = is_drink_category if category_filter == "drink" else is_food_category
    result = []
    for s in suggestions:
        name = safe_lower(s.get("item_name") or "")
        if menu_items_by_name:
            menu_item = menu_items_by_name.get(name)
            if menu_item:
                cat = safe_lower(menu_item.get("category") or "")
                sub = safe_lower(menu_item.get("subcategory") or "")
                if check(cat) or check(sub):
                    result.append(s)
                continue  # known item — only include if category matched
        result.append(s)  # category unknown — keep to avoid silent drops
    return result


def suggest_popular_items(featured_items: list[dict[str, Any]], limit: int = 2) -> list[dict]:
    """
    Returns a small random selection of featured menu items.
    """
    if not featured_items:
        return []

    sample = random.sample(featured_items, min(limit, len(featured_items)))

    return [
        {
            "type": "popular",
            "item_name": item["name"],
            "menu_item_id": item.get("id"),
        }
        for item in sample
    ]


def is_drink_category(category: str) -> bool:
    category = safe_lower(category)
    return any(word in category for word in ["beverage", "beverages", "drink", "coffee", "frap", "latte", "tea"])


def is_food_category(category: str) -> bool:
    category = safe_lower(category)
    return any(word in category for word in ["dessert", "desserts", "pastry", "bakery", "cake", "cookie", "muffin", "croissant"])


def suggest_complementary_items(
    menu_items: list[dict[str, Any]],
    last_item: dict[str, Any] | None,
    limit: int = 2,
) -> list[dict]:
    """
    Suggest complementary items based on category/subcategory.
    """
    if not last_item:
        return []

    last_item_name = safe_lower(last_item.get("name"))
    category = safe_lower(last_item.get("category"))
    subcategory = safe_lower(last_item.get("subcategory"))

    last_item_is_drink = is_drink_category(category) or is_drink_category(subcategory)
    last_item_is_food = is_food_category(category) or is_food_category(subcategory)

    complementary_pool = []

    for item in menu_items:
        item_name = safe_lower(item.get("name"))
        item_category = safe_lower(item.get("category"))
        item_subcategory = safe_lower(item.get("subcategory"))

        # don't suggest the same item
        if item_name == last_item_name:
            continue

        item_is_drink = is_drink_category(item_category) or is_drink_category(item_subcategory)
        item_is_food = is_food_category(item_category) or is_food_category(item_subcategory)

        # drink -> suggest food
        if last_item_is_drink and item_is_food:
            complementary_pool.append(item)

        # food -> suggest drink
        elif last_item_is_food and item_is_drink:
            complementary_pool.append(item)

    if not complementary_pool:
        return []

    sample = random.sample(complementary_pool, min(limit, len(complementary_pool)))

    return [
        {
            "type": "complementary",
            "item_name": item["name"],
            "menu_item_id": item.get("id"),
        }
        for item in sample
    ]
