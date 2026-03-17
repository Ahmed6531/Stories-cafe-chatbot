# app/services/tools.py
from app.services.http_client import ExpressHttpClient, ExpressAPIError

async def fetch_menu_items():
    try:
        client = ExpressHttpClient()
        data, _ = await client.get("/menu")
        return data.get("items", [])
    except ExpressAPIError:
        return []

async def fetch_featured_items():
    try:
        client = ExpressHttpClient()
        data, _ = await client.get("/menu/featured")
        return data.get("items", [])
    except ExpressAPIError:
        return []

async def get_cart(cart_id=None):
    try:
        client = ExpressHttpClient()
        headers = {"x-cart-id": cart_id} if cart_id else {}
        data, resp_headers = await client.get("/cart", headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
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
        data, resp_headers = await client.post("/cart/items", json=payload, headers=headers)
        resolved_cart_id = resp_headers.get("x-cart-id") or cart_id or data.get("cartId")
        return {"cart_id": resolved_cart_id, "cart": data.get("items", [])}
    except ExpressAPIError:
        return {"cart_id": cart_id, "cart": []}

async def find_menu_item_by_name(menu_items, query):
    query_lower = query.lower()
    for item in menu_items:
        if query_lower in item["name"].lower():
            return item
    return None