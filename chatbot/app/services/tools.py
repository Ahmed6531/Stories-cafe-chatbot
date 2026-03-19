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

async def find_menu_item_by_name(menu_items, query):
    query_lower = query.lower()
    for item in menu_items:
        if query_lower in item["name"].lower():
            return item
    return None

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
