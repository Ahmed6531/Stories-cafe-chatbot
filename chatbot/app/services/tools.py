# app/services/tools.py (mocked for local testing)
async def fetch_menu_items():
    return [
        {"id": 1, "name": "Iced Latte"},
        {"id": 2, "name": "Cappuccino"},
        {"id": 3, "name": "Croissant"},
        {"id": 4, "name": "Chocolate Croissant"},
        {"id": 5, "name": "Lazy Cake"},
    ]

async def fetch_featured_items():
    return [
        {"id": 1, "name": "Iced Latte"},
        {"id": 3, "name": "Croissant"},
        {"id": 5, "name": "Lazy Cake"},
    ]

async def get_cart(cart_id=None):
    return {"cart_id": cart_id or "cart123", "cart": []}

async def add_item_to_cart(menu_item_id, qty, selected_options, instructions, cart_id):
    return {"cart_id": cart_id or "cart123", "cart": [{"id": menu_item_id, "qty": qty, "name": f"Item {menu_item_id}"}]}

async def find_menu_item_by_name(menu_items, query):
    query_lower = query.lower()
    for item in menu_items:
        if query_lower in item["name"].lower():
            return item
    return None