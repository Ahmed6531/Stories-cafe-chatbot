from typing import Any
from app.services.http_client import ExpressHttpClient


client = ExpressHttpClient()


async def fetch_menu_items() -> list[dict[str, Any]]:
    data, _ = await client.get("/menu/")

    if isinstance(data, dict):
        return data.get("items", [])

    if isinstance(data, list):
        return data

    return []


async def fetch_featured_items() -> list[dict[str, Any]]:
    data, _ = await client.get("/menu/featured")

    if isinstance(data, dict):
        return data.get("items", [])

    if isinstance(data, list):
        return data

    return []


async def get_cart(cart_id: str | None = None) -> dict[str, Any]:
    headers = {}
    params = {}

    if cart_id:
        headers["x-cart-id"] = cart_id
        params["cartId"] = cart_id

    data, response_headers = await client.get("/cart/", params=params, headers=headers)

    returned_cart_id = response_headers.get("x-cart-id") or data.get("cartId")

    return {
        "cart": data,
        "cart_id": returned_cart_id,
    }


async def add_item_to_cart(
    menu_item_id: str | int,
    qty: int = 1,
    selected_options: list[str] | None = None,
    instructions: str = "",
    cart_id: str | None = None,
) -> dict[str, Any]:
    headers = {}

    if cart_id:
        headers["x-cart-id"] = cart_id

    payload = {
        "menuItemId": menu_item_id,
        "qty": qty,
        "selectedOptions": selected_options or [],
        "instructions": instructions.strip(),
    }

    print("ADDING TO CART:", payload)

    print("ADD TO CART -> incoming cart_id:", cart_id)
    print("ADD TO CART -> payload:", payload)

    data, response_headers = await client.post("/cart/items", json=payload, headers=headers)

    print("ADD TO CART -> response headers x-cart-id:", response_headers.get("x-cart-id"))
    print("ADD TO CART -> response body:", data)


    returned_cart_id = response_headers.get("x-cart-id") or data.get("cartId")

    return {
        "cart": data,
        "cart_id": returned_cart_id,
    }


def find_menu_item_by_name(menu_items: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    q = query.lower().strip()

    if not q:
        return None

    exact_match = None
    contains_match = None

    for item in menu_items:
        name = str(item.get("name", "")).lower().strip()

        if name == q:
            exact_match = item
            break

        if q in name or name in q:
            contains_match = item

    return exact_match or contains_match