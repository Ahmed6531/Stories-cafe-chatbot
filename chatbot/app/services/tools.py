# app/services/tools.py
import logging

from app.services.http_client import ExpressHttpClient, ExpressAPIError

logger = logging.getLogger(__name__)

async def fetch_menu_items():
    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/menu",
            "cart_id": None,
        })
        data, _ = await client.get("/menu")
        return data.get("items", [])
    except ExpressAPIError:
        return []

async def fetch_menu_item_detail(menu_item_id):
    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": f"/menu/{menu_item_id}",
            "cart_id": None,
        })
        data, _ = await client.get(f"/menu/{menu_item_id}")
        return data.get("item")
    except ExpressAPIError:
        return None

async def fetch_featured_items():
    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/menu/featured",
            "cart_id": None,
        })
        data, _ = await client.get("/menu/featured")
        return data.get("items", [])
    except ExpressAPIError:
        return []

async def get_cart(cart_id=None):
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
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
        logger.info({
            "service": "express",
            "status": 200,
            "returned_cart_id": resp_headers.get("x-cart-id"),
        })
        return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}

async def add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
    # ExpressAPIError is intentionally NOT caught here so the orchestrator
    # can inspect the error and return a meaningful message to the user.
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
    resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
    logger.info({
        "service": "express",
        "status": 201,
        "returned_cart_id": resp_headers.get("x-cart-id"),
    })
    return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}

async def update_cart_item_quantity(line_id, qty, cart_id):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.patch(
            f"/cart/items/{line_id}",
            json={"qty": qty},
            headers=headers,
        )
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
        return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}

async def remove_item_from_cart(line_id, cart_id):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.delete(f"/cart/items/{line_id}", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
        return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}

async def remove_from_cart(*args, **kwargs):
    return await remove_item_from_cart(*args, **kwargs)

async def clear_cart(cart_id):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.delete("/cart", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
        return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}

from difflib import get_close_matches


async def find_menu_item_by_name(menu_items, item_query):
    if not item_query:
        return None

    item_query = item_query.strip().lower()

    # 1) exact match
    for item in menu_items:
        name = item.get("name", "").strip().lower()
        if item_query == name:
            return item

    # 2) contains match
    for item in menu_items:
        name = item.get("name", "").strip().lower()
        if item_query in name or name in item_query:
            return item

    # 3) word-overlap match
    query_words = set(item_query.split())
    best_item = None
    best_overlap = 0

    for item in menu_items:
        name = item.get("name", "").strip().lower()
        name_words = set(name.split())
        overlap = len(query_words & name_words)

        if overlap > best_overlap:
            best_overlap = overlap
            best_item = item

    if best_item and best_overlap > 0:
        return best_item

    # 4) fuzzy match
    menu_name_map = {
        item.get("name", "").strip().lower(): item
        for item in menu_items
        if item.get("name")
    }

    matches = get_close_matches(item_query, menu_name_map.keys(), n=1, cutoff=0.6)
    if matches:
        return menu_name_map[matches[0]]

    return None


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
