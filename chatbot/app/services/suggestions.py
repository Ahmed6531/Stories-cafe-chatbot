import random
from typing import Any
from unicodedata import category


def safe_lower(value: Any) -> str:
    if value is None:
        return ""
    return str(value).lower()


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
            "menu_item_id": item.get("id") or item.get("_id"),
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
            "menu_item_id": item.get("id") or item.get("_id"),
        }
        for item in sample
    ]
