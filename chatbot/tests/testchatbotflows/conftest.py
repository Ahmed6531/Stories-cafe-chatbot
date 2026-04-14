"""
Shared fixtures for chatbot flow tests.
All tests in this folder import from here instead of duplicating setup.
"""
import sys
from pathlib import Path

# Make `app/` importable from every test file in this folder.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


# ---------------------------------------------------------------------------
# Menu fixtures
# ---------------------------------------------------------------------------

def fake_menu_items() -> list[dict]:
    """Minimal menu that covers drink + food categories and has variant groups."""
    return [
        {
            "_id": "item-latte",
            "name": "Latte",
            "isAvailable": True,
            "category": "beverages",
            "subcategory": "coffee",
            "price": 8000,
        },
        {
            "_id": "item-cappuccino",
            "name": "Cappuccino",
            "isAvailable": True,
            "category": "beverages",
            "subcategory": "coffee",
            "price": 7500,
        },
        {
            "_id": "item-water",
            "name": "Rim 330ML",
            "isAvailable": True,
            "category": "beverages",
            "subcategory": "drinks",
            "price": 2000,
        },
        {
            "_id": "item-croissant",
            "name": "Cheese Croissant",
            "isAvailable": True,
            "category": "pastries",
            "subcategory": "croissants",
            "price": 6000,
        },
        {
            "_id": "item-muffin",
            "name": "Blueberry Muffin",
            "isAvailable": True,
            "category": "pastries",
            "subcategory": "muffins",
            "price": 5000,
        },
        {
            "_id": "item-unavailable",
            "name": "Sold Out Item",
            "isAvailable": False,
            "category": "beverages",
            "subcategory": "coffee",
            "price": 9000,
        },
    ]


def fake_menu_item_detail(name: str = "Latte") -> dict:
    """Returns a detailed item object with size + milk variant groups."""
    return {
        "_id": "item-latte",
        "name": name,
        "isAvailable": True,
        "category": "beverages",
        "subcategory": "coffee",
        "price": 8000,
        "variants": [
            {
                "name": "Choose Size",
                "customerLabel": "Size",
                "isRequired": True,
                "options": [
                    {"name": "Small", "isActive": True},
                    {"name": "Medium", "isActive": True},
                    {"name": "Large", "isActive": True},
                ],
            },
            {
                "name": "Milk",
                "customerLabel": "Milk",
                "isRequired": False,
                "options": [
                    {"name": "Full Fat", "isActive": True},
                    {"name": "Almond Milk", "isActive": True},
                    {"name": "Skim Milk", "isActive": True},
                ],
            },
        ],
    }


def fake_menu_item_detail_no_variants(name: str = "Cheese Croissant") -> dict:
    """An item with no variant groups — no clarification needed."""
    return {
        "_id": "item-croissant",
        "name": name,
        "isAvailable": True,
        "category": "pastries",
        "subcategory": "croissants",
        "price": 6000,
        "variants": [],
    }


def fake_menu_item_detail_single_option(name: str = "Water") -> dict:
    """An item whose only variant group has a single option — should be auto-skipped."""
    return {
        "_id": "item-water",
        "name": name,
        "isAvailable": True,
        "category": "beverages",
        "variants": [
            {
                "name": "Temperature",
                "customerLabel": "Temperature",
                "isRequired": True,
                "options": [
                    {"name": "Cold", "isActive": True},
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Session fixture
# ---------------------------------------------------------------------------

def fake_session(session_id: str = "test-session", stage: str | None = None) -> dict:
    """Returns a minimal session dict with all expected keys at their defaults."""
    return {
        "session_id": session_id,
        "cart_id": None,
        "last_items": [],
        "last_intent": None,
        "stage": stage,
        "checkout_initiated": False,
        "pending_clarification": None,
        "history": [],
        "last_user_message": None,
        "last_bot_response": None,
        "last_matched_items": None,
        "last_action_type": None,
        "last_action_data": None,
    }


# ---------------------------------------------------------------------------
# LLM response fixture
# ---------------------------------------------------------------------------

def mock_llm_response(intent: str, items: list[dict] | None = None) -> dict:
    """Returns a structured dict matching what try_interpret_message returns."""
    return {
        "intent": intent,
        "items": items or [],
        "confidence": 0.95,
        "fallback_needed": intent == "unknown",
    }


# ---------------------------------------------------------------------------
# Cart fixtures
# ---------------------------------------------------------------------------

def fake_cart(cart_id: str = "cart-123", items: list[dict] | None = None) -> dict:
    """Minimal cart response shape matching what tools.py returns."""
    return {
        "cart_id": cart_id,
        "cart": items or [],
    }


def fake_cart_with_latte(cart_id: str = "cart-123") -> dict:
    return fake_cart(cart_id, items=[
        {
            "_id": "line-1",
            "menuItemId": "item-latte",
            "name": "Latte",
            "qty": 1,
            "price": 8000,
            "category": "beverages",
            "subcategory": "coffee",
        }
    ])


def fake_cart_with_croissant(cart_id: str = "cart-123") -> dict:
    return fake_cart(cart_id, items=[
        {
            "_id": "line-2",
            "menuItemId": "item-croissant",
            "name": "Cheese Croissant",
            "qty": 1,
            "price": 6000,
            "category": "pastries",
            "subcategory": "croissants",
        }
    ])


def fake_requested_item(
    item_name: str = "Latte",
    size: str | None = None,
    milk: str | None = None,
) -> dict:
    """Minimal requested item dict as produced by the LLM interpreter."""
    return {
        "item_name": item_name,
        "quantity": 1,
        "size": size,
        "options": {"milk": milk, "sugar": None},
        "addons": [],
        "instructions": "",
    }
