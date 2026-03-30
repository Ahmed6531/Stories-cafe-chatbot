# app/services/tools.py

import logging
from app.services.http_client import ExpressHttpClient, ExpressAPIError

logger = logging.getLogger(__name__)


# ------------------ MENU ------------------

async def fetch_menu_items():
    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/menu",
        })
        data, _ = await client.get("/menu")
        return data.get("items", [])
    except ExpressAPIError:
        return []


async def fetch_featured_items():
    try:
        client = ExpressHttpClient()
        logger.info({
            "service": "express",
            "method": "GET",
            "path": "/menu/featured",
        })
        data, _ = await client.get("/menu/featured")
        return data.get("items", [])
    except ExpressAPIError:
        return []


# ------------------ CART ------------------

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
    try:
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

    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}


async def remove_from_cart(line_id: str, cart_id: str | None = None) -> dict:
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}

        logger.info({
            "service": "express",
            "method": "DELETE",
            "path": f"/cart/items/{line_id}",
            "cart_id": cart_id,
        })

        data, resp_headers = await client.delete(f"/cart/items/{line_id}", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")

        return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}

    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}


async def clear_cart(cart_id: str | None = None) -> dict:
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}

        logger.info({
            "service": "express",
            "method": "DELETE",
            "path": "/cart",
            "cart_id": cart_id,
        })

        await client.delete("/cart", headers=headers)

        return {"cart_id": None, "cart": []}

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


# ------------------ HELPERS ------------------

async def find_menu_item_by_name(menu_items, query):
    query_lower = query.lower()

    for item in menu_items:
        if query_lower in item["name"].lower():
            return item

    return None