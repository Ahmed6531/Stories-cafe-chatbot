import random
import re
from typing import Any


def _extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        for key in ("name", "title", "label", "slug"):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip()
        return ""
    if isinstance(value, list):
        parts = [_extract_text(part) for part in value]
        return " ".join(part for part in parts if part)
    return str(value)


def safe_lower(value: Any) -> str:
    return _extract_text(value).lower()


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
    "salad", "salads",
    "something to eat", "bite",
}

_REC_STOPWORDS = {
    "can", "could", "would", "you", "u", "please", "pls", "me", "some", "any",
    "a", "an", "the", "for", "to", "i", "want", "like", "show", "give",
    "do", "have", "what", "whats", "what's", "recommend", "suggest", "suggestions",
}

_REC_PHRASE_ALIASES: dict[str, list[str]] = {
    "ice cream": ["frozen yogurt", "yogurt", "froyo", "dessert"],
    "frozen yogurt": ["frozen yogurt", "yogurt", "froyo"],
    "yogurt": ["yogurt", "froyo", "frozen yogurt"],
    "salad": ["salad"],
    "coffee": ["coffee", "espresso", "latte", "cappuccino", "americano", "mocha"],
}


def extract_recommendation_query_terms(message: str) -> list[str]:
    """Extract explicit target terms from recommendation asks, e.g. 'suggest salads'."""
    msg = (message or "").lower().strip()
    if not msg:
        return []

    match = re.search(r"(?:recommend|suggest)(?:\s+me)?\s+(.+)$", msg)
    target_text = match.group(1).strip() if match else ""
    if not target_text:
        return []

    target_text = re.sub(r"[?.!,]+$", "", target_text)

    # Phrase aliases first so terms like "ice cream" map to menu language.
    # Track which individual words are covered by matched phrases so they are
    # NOT re-added as raw tokens (e.g. "cream" from "ice cream" would otherwise
    # match "Caramel Cream Frap").
    phrase_terms: list[str] = []
    aliased_words: set[str] = set()
    for phrase, aliases in _REC_PHRASE_ALIASES.items():
        if phrase in target_text:
            phrase_terms.extend(aliases)
            aliased_words.update(phrase.split())

    tokens = [
        t for t in re.split(r"\s+", target_text)
        if t and t not in _REC_STOPWORDS and t not in aliased_words
    ]
    if not tokens and not phrase_terms:
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for term in phrase_terms:
        cleaned = term.strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)

    for token in tokens:
        # Use the singular form when the token looks plural — substring matching
        # in filter_by_category means "burger" still hits "burgers" in the haystack.
        canonical = token[:-1] if token.endswith("s") and len(token) > 3 else token
        if canonical not in seen:
            seen.add(canonical)
            normalized.append(canonical)
    return normalized


def extract_recommendation_category(message: str) -> str | None:
    """Return 'drink', 'food', 'yogurt', or None based on message keywords."""
    msg = message.lower()
    if any(kw in msg for kw in ["yogurt", "yoghurt", "froyo", "frozen yogurt"]):
        return "yogurt"
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
    query_terms: list[str] | None = None,
) -> list[dict]:
    """
    Filter suggestion dicts to only those matching category_filter.
    category_filter supports: 'drink', 'food', 'yogurt'.
    Filtering is strict when a category is requested.
    """
    if not suggestions:
        return suggestions

    terms = [t for t in (query_terms or []) if t]
    result = []
    for s in suggestions:
        name = safe_lower(s.get("item_name") or "")
        menu_item = menu_items_by_name.get(name) if isinstance(menu_items_by_name, dict) else None
        cat = safe_lower(menu_item.get("category") or "") if isinstance(menu_item, dict) else ""
        sub = safe_lower(menu_item.get("subcategory") or "") if isinstance(menu_item, dict) else ""
        hay = f"{name} {cat} {sub}"

        if terms and not any(term in hay for term in terms):
            continue

        if not category_filter:
            result.append(s)
            continue

        if category_filter == "drink":
            if is_drink_category(cat) or is_drink_category(sub) or is_drink_category(name):
                result.append(s)
            continue

        if category_filter == "food":
            if is_food_category(cat) or is_food_category(sub) or is_food_category(name):
                result.append(s)
            continue

        if category_filter == "yogurt":
            if any(kw in hay for kw in ["yogurt", "yoghurt", "froyo", "frozen yogurt"]):
                result.append(s)
            continue

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
    return any(word in category for word in [
        "dessert", "desserts", "pastry", "bakery", "cake", "cookie", "muffin", "croissant",
        "food", "foods", "sandwich", "sandwiches", "salad", "salads", "soft drink","soft drinks","mixed beverage","mixed beverages",
        "meal", "meals", "snack", "snacks", "bite", "eat",
    ])


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
