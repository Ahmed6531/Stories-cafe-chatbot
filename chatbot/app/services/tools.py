# app/services/tools.py

import logging
import re
import time
from difflib import SequenceMatcher, get_close_matches

from app.services.http_client import ExpressHttpClient, ExpressAPIError
from app.utils.normalize import normalize_user_message

logger = logging.getLogger(__name__)

# ---------- Simple in‑memory cache with TTL ----------
_cache = {}
CACHE_TTL_SECONDS = 60  # 1 minute


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and entry["expires"] > time.time():
        return entry["value"]
    return None


def _cache_set(key: str, value):
    _cache[key] = {"value": value, "expires": time.time() + CACHE_TTL_SECONDS}


# ------------------ MENU ------------------

async def fetch_menu_items():
    cache_key = "menu_items"
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info({"service": "express", "cache_hit": True, "path": "/menu"})
        return cached

    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/menu",
        })
        data, _ = await client.get("/menu")
        items = data.get("items", []) if isinstance(data, dict) else []
        normalized_items = [item for item in items if isinstance(item, dict)]

        # New category model: /menu payload may not include category.isActive.
        # Cross-check with active categories endpoint to avoid suggesting inactive categories.
        try:
            categories_data, _ = await client.get("/menu/categories")
            categories = categories_data.get("categories", []) if isinstance(categories_data, dict) else []

            active_category_names = {
                str(category.get("name") or "").strip().lower()
                for category in categories
                if isinstance(category, dict) and str(category.get("name") or "").strip()
            }
            active_category_slugs = {
                str(category.get("slug") or "").strip().lower()
                for category in categories
                if isinstance(category, dict) and str(category.get("slug") or "").strip()
            }

            def _item_category_tokens(item: dict) -> set[str]:
                category = item.get("category")
                tokens: set[str] = set()
                if isinstance(category, dict):
                    for key in ("name", "slug"):
                        value = str(category.get(key) or "").strip().lower()
                        if value:
                            tokens.add(value)
                elif isinstance(category, str):
                    value = category.strip().lower()
                    if value:
                        tokens.add(value)
                return tokens

            if active_category_names or active_category_slugs:
                active_tokens = active_category_names | active_category_slugs
                normalized_items = [
                    item
                    for item in normalized_items
                    if bool(_item_category_tokens(item) & active_tokens)
                ]
        except ExpressAPIError:
            # Fail open for menu rendering if categories endpoint is unavailable.
            pass

        _cache_set(cache_key, normalized_items)
        return normalized_items
    except ExpressAPIError:
        return []


def invalidate_menu_cache():
    _cache.pop("menu_items", None)
    logger.info("Menu cache invalidated")


async def fetch_menu_item_detail(menu_item_id):
    cache_key = f"menu_item_detail_{menu_item_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info({"service": "express", "cache_hit": True, "path": f"/menu/{menu_item_id}"})
        return cached

    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": f"/menu/{menu_item_id}",
            "cart_id": None,
        })
        data, _ = await client.get(f"/menu/{menu_item_id}")
        result = data.get("item")
        _cache_set(cache_key, result)
        return result
    except ExpressAPIError:
        return None

async def fetch_my_orders(auth_cookie: str | None = None, limit: int = 20):
    """Fetch authenticated user's recent orders from backend."""
    try:
        client = ExpressHttpClient()
        headers = {}
        if isinstance(auth_cookie, str) and auth_cookie.strip():
            headers["cookie"] = auth_cookie.strip()

        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/orders/my",
        })

        data, _ = await client.get("/orders/my", headers=headers)
        orders = data.get("orders", []) if isinstance(data, dict) else []
        if not isinstance(orders, list):
            return []
        if isinstance(limit, int) and limit > 0:
            return [order for order in orders if isinstance(order, dict)][:limit]
        return [order for order in orders if isinstance(order, dict)]
    except ExpressAPIError:
        return []

async def fetch_featured_items():
    cache_key = "featured_items"
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info({"service": "express", "cache_hit": True, "path": "/menu/featured"})
        return cached

    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/menu/featured",
        })
        data, _ = await client.get("/menu/featured")
        items = data.get("items", []) if isinstance(data, dict) else []
        result = [item for item in items if isinstance(item, dict)]
        _cache_set(cache_key, result)
        return result
    except ExpressAPIError:
        return []


# ------------------ CART ------------------

async def get_cart(cart_id=None):
    # Carts are session‑specific, so we don't cache them.
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}

        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/cart",
            "cart_id": cart_id,
        })

        data, resp_headers = await client.get("/cart", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or (data.get("cartId") if isinstance(data, dict) else None)
        cart_items = data.get("items", []) if isinstance(data, dict) else []

        logger.info({
            "service": "express",
            "status": 200,
            "returned_cart_id": resp_headers.get("x-cart-id"),
        })

        return {"cart_id": resolved_cart_id, "cart": [item for item in cart_items if isinstance(item, dict)]}

    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}


async def add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
    client = ExpressHttpClient()
    headers = {"x-cart-id": cart_id} if cart_id else {}

    payload = {
        "menuItemId": menu_item_id,
        "qty": qty,
        "selectedOptions": selected_options or [],
        "instructions": instructions or "",
    }

    logger.info({
        "service": "express",
        "method": "POST",
        "path": "/cart/items",
        "cart_id": cart_id,
    })

    data, resp_headers = await client.post("/cart/items", json=payload, headers=headers)
    resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or (data.get("cartId") if isinstance(data, dict) else None)
    cart_items = data.get("items", []) if isinstance(data, dict) else []

    return {"cart_id": resolved_cart_id, "cart": [item for item in cart_items if isinstance(item, dict)]}


async def update_cart_item_quantity(line_id, qty, cart_id):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.patch(
            f"/cart/items/{line_id}",
            json={"qty": qty},
            headers=headers,
        )
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or (data.get("cartId") if isinstance(data, dict) else None)
        cart_items = data.get("items", []) if isinstance(data, dict) else []
        return {"cart_id": resolved_cart_id, "cart": [item for item in cart_items if isinstance(item, dict)]}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}


async def remove_item_from_cart(line_id, cart_id):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.delete(f"/cart/items/{line_id}", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or (data.get("cartId") if isinstance(data, dict) else None)
        cart_items = data.get("items", []) if isinstance(data, dict) else []

        return {"cart_id": resolved_cart_id, "cart": [item for item in cart_items if isinstance(item, dict)]}

    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}


async def remove_from_cart(*args, **kwargs):
    return await remove_item_from_cart(*args, **kwargs)


async def clear_cart(cart_id):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.delete("/cart", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or (data.get("cartId") if isinstance(data, dict) else None)
        cart_items = data.get("items", []) if isinstance(data, dict) else []
        return {"cart_id": resolved_cart_id, "cart": [item for item in cart_items if isinstance(item, dict)]}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}


# ------------------ ANALYTICS (UPSELL) ------------------

async def observe_combo(anchor_menu_item_ids, suggested_menu_item_id, source="cart_add"):
    try:
        client = ExpressHttpClient()
        payload = {
            "anchorMenuItemIds": anchor_menu_item_ids or [],
            "suggestedMenuItemId": suggested_menu_item_id,
            "source": source,
        }
        data, _ = await client.post("/analytics/combos/observe", json=payload)
        return {
            "success": bool(data.get("success")),
            "observed": data.get("observed", 0),
        }
    except ExpressAPIError:
        return {"success": False, "observed": 0}


async def fetch_combo_suggestions(anchor_menu_item_ids, exclude_menu_item_ids=None, limit=5):
    try:
        client = ExpressHttpClient()
        params = {
            "anchorMenuItemIds": ",".join(str(i) for i in (anchor_menu_item_ids or [])),
            "excludeMenuItemIds": ",".join(str(i) for i in (exclude_menu_item_ids or [])),
            "limit": limit,
        }
        data, _ = await client.get("/analytics/combos", params=params)
        return data.get("combos", [])
    except ExpressAPIError:
        return []


def _normalize_lookup_text(value: str) -> str:
    normalized = normalize_user_message(str(value or "")).strip().lower()
    normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized)
    return " ".join(normalized.split())


_FUZZY_GENERIC_TOKENS = {
    "iced", "hot", "cold", "small", "medium", "large", "drink", "drinks",
    "beverage", "beverages", "with", "and", "the", "a", "an",
}


def _is_safe_fuzzy_candidate(item_query: str, candidate: str) -> bool:
    query_tokens = [t for t in item_query.split() if t]
    cand_tokens = [t for t in candidate.split() if t]

    if len(query_tokens) < 2:
        return True

    query_content = [t for t in query_tokens if t not in _FUZZY_GENERIC_TOKENS]
    cand_content = [t for t in cand_tokens if t not in _FUZZY_GENERIC_TOKENS]

    # If both sides have non-generic tokens, require either direct overlap or
    # typo-like similarity; this blocks semantic swaps like matcha -> mocha.
    if query_content and cand_content:
        if set(query_content) & set(cand_content):
            return True

        if len(query_content) == len(cand_content):
            for q_token, c_token in zip(query_content, cand_content):
                if q_token == c_token:
                    continue
                if SequenceMatcher(None, q_token, c_token).ratio() < 0.86:
                    return False
            return True

        return False

    # If there's no meaningful content token, avoid aggressive fuzzy picks.
    return False


async def find_menu_item_by_name(menu_items, item_query):
    if not item_query:
        return None

    item_query = _normalize_lookup_text(item_query)

    # Only consider items that are currently available
    available_items = [
        item for item in menu_items
        if isinstance(item, dict) and item.get("isAvailable", True) is not False
    ]

    # Special case: "water" or "cold water" etc should map to "Rim 330ML" not "Rim Sparkling Water"
    # unless the user explicitly says "sparkling"
    if "water" in item_query and "sparkling" not in item_query:
        for item in available_items:
            if item.get("name", "").strip().lower() == "rim 330ml":
                return item

    # 1) exact match
    for item in available_items:
        name = _normalize_lookup_text(item.get("name", ""))
        if item_query == name:
            return item

    # 2) contains match
    for item in available_items:
        name = _normalize_lookup_text(item.get("name", ""))
        if item_query in name or name in item_query:
            return item

    # 3) word-overlap match
    query_words = {w for w in item_query.split() if w}
    query_word_count = len(query_words)
    best_item = None
    best_overlap = 0

    for item in available_items:
        name = _normalize_lookup_text(item.get("name", ""))
        name_words = set(name.split())
        overlap = len(query_words & name_words)

        if overlap > best_overlap:
            best_overlap = overlap
            best_item = item

    # For multi-word queries, require at least 2 overlapping words; otherwise
    # fall through to fuzzy match to handle typos like "cinammon roll".
    if best_item and best_overlap > 0:
        if query_word_count <= 1 or best_overlap >= 2:
            return best_item

    # 4) fuzzy match
    menu_name_map = {
        _normalize_lookup_text(item.get("name", "")): item
        for item in available_items
        if item.get("name")
    }

    matches = get_close_matches(item_query, menu_name_map.keys(), n=3, cutoff=0.68)
    matches = [candidate for candidate in matches if _is_safe_fuzzy_candidate(item_query, candidate)]
    if matches:
        best_name = max(
            matches,
            key=lambda candidate: (
                SequenceMatcher(None, item_query, candidate).ratio(),
                len(set(item_query.split()) & set(candidate.split())),
            ),
        )
        return menu_name_map[best_name]

    return None
