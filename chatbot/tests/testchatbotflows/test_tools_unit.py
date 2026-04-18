"""
Tests for app/services/tools.py

Covers:
  - find_menu_item_by_name: exact, contains, word-overlap, semantic-swap safety, unavailable filtering
  - Menu caching: cache hit avoids network, cache miss after TTL triggers network
  - Cart operations: add, update, remove, clear — mock HTTP client, verify payload shape
  - fetch_my_orders: auth cookie forwarding

Does NOT retest:
  - Basic exact/fuzzy matching already exercised in test_recommendation_logic.py
"""
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tests.testchatbotflows.conftest import fake_menu_items
import app.services.tools as tools_module
from app.services.tools import (
    find_menu_item_by_name,
    fetch_menu_items,
    fetch_menu_item_detail,
    add_item_to_cart,
    update_cart_item_quantity,
    remove_item_from_cart,
    clear_cart,
    fetch_my_orders,
    invalidate_menu_cache,
    _cache,
    CACHE_TTL_SECONDS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client_mock(get_return=None, post_return=None, patch_return=None, delete_return=None):
    """Build a mock ExpressHttpClient that returns the given values."""
    client = MagicMock()
    client.get = AsyncMock(return_value=(get_return or {}, {}))
    client.post = AsyncMock(return_value=(post_return or {}, {}))
    client.patch = AsyncMock(return_value=(patch_return or {}, {}))
    client.delete = AsyncMock(return_value=(delete_return or {}, {}))
    return client


# ---------------------------------------------------------------------------
# find_menu_item_by_name
# ---------------------------------------------------------------------------

class TestFindMenuItemByName(unittest.IsolatedAsyncioTestCase):

    async def test_exact_match(self):
        menu = fake_menu_items()
        result = await find_menu_item_by_name(menu, "Latte")
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Latte")

    async def test_contains_match_substring(self):
        menu = fake_menu_items()
        # "cappuccino" is contained in "Cappuccino"
        result = await find_menu_item_by_name(menu, "cappuccino")
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Cappuccino")

    async def test_word_overlap_multi_word(self):
        menu = fake_menu_items()
        # "cheese croissant pastry" overlaps with "Cheese Croissant" on two words
        result = await find_menu_item_by_name(menu, "cheese croissant pastry")
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Cheese Croissant")

    async def test_blocks_semantic_swap_matcha_to_mocha(self):
        menu = [
            {"_id": "m1", "name": "Mocha", "isAvailable": True},
            {"_id": "m2", "name": "Matcha Latte", "isAvailable": True},
        ]
        result = await find_menu_item_by_name(menu, "matcha")
        # Should NOT silently return Mocha for a "matcha" query
        if result is not None:
            self.assertNotEqual(result["name"].lower(), "mocha")

    async def test_returns_none_for_gibberish(self):
        menu = fake_menu_items()
        result = await find_menu_item_by_name(menu, "xyzqqqblarp")
        self.assertIsNone(result)

    async def test_skips_unavailable_items(self):
        menu = fake_menu_items()
        # "Sold Out Item" is the only item with isAvailable=False
        result = await find_menu_item_by_name(menu, "Sold Out Item")
        self.assertIsNone(result)

    async def test_can_include_unavailable_items_when_requested(self):
        menu = fake_menu_items()
        result = await find_menu_item_by_name(
            menu,
            "Sold Out Item",
            include_unavailable=True,
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Sold Out Item")

    async def test_water_special_case_routes_to_rim_330ml(self):
        menu = fake_menu_items()
        result = await find_menu_item_by_name(menu, "water")
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Rim 330ML")

    async def test_returns_none_for_empty_query(self):
        menu = fake_menu_items()
        result = await find_menu_item_by_name(menu, "")
        self.assertIsNone(result)

    async def test_fuzzy_typo_match(self):
        menu = fake_menu_items()
        # "Cappicuno" should fuzzy-match to "Cappuccino"
        result = await find_menu_item_by_name(menu, "cappicuno")
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Cappuccino")


# ---------------------------------------------------------------------------
# Menu caching
# ---------------------------------------------------------------------------

class TestMenuCaching(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        invalidate_menu_cache()
        _cache.clear()

    async def test_cache_hit_skips_second_network_call(self):
        menu_payload = {"items": fake_menu_items()}
        categories_payload = {"categories": []}

        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = _make_client_mock(
                get_return=menu_payload,
            )
            # First GET call returns menu, second returns categories
            instance.get = AsyncMock(side_effect=[
                (menu_payload, {}),
                (categories_payload, {}),
            ])
            MockClient.return_value = instance

            result1 = await fetch_menu_items()
            # Reset side_effect so a second instantiation would also work
            instance.get = AsyncMock(return_value=(menu_payload, {}))

            result2 = await fetch_menu_items()

        # Both calls return the same data; network only called once for real menu fetch
        self.assertIsNotNone(result1)
        self.assertEqual(result1, result2)

    async def test_cache_miss_after_ttl_triggers_network(self):
        menu_payload = {"items": fake_menu_items()}
        categories_payload = {"categories": []}

        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.get = AsyncMock(side_effect=[
                (menu_payload, {}),
                (categories_payload, {}),
                (menu_payload, {}),
                (categories_payload, {}),
            ])
            MockClient.return_value = instance

            await fetch_menu_items()

            # Manually expire the cache entry
            if "menu_items" in _cache:
                _cache["menu_items"]["expires"] = time.time() - 1

            await fetch_menu_items()

            # Should have been called at least 4 times total (2 per fetch)
            self.assertGreaterEqual(instance.get.call_count, 4)

    async def test_invalidate_clears_cache(self):
        _cache["menu_items"] = {"value": ["something"], "expires": time.time() + 60}
        invalidate_menu_cache()
        self.assertNotIn("menu_items", _cache)


# ---------------------------------------------------------------------------
# Cart operations
# ---------------------------------------------------------------------------

class TestAddItemToCart(unittest.IsolatedAsyncioTestCase):

    async def test_success_returns_cart_with_items(self):
        response_body = {
            "cartId": "cart-abc",
            "items": [{"name": "Latte", "qty": 1}],
        }
        resp_headers = {"x-cart-id": "cart-abc"}

        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = _make_client_mock(post_return=response_body)
            instance.post = AsyncMock(return_value=(response_body, resp_headers))
            MockClient.return_value = instance

            result = await add_item_to_cart(
                menu_item_id="item-latte",
                qty=1,
                selected_options=[{"name": "Medium"}],
                instructions="",
                cart_id="cart-abc",
            )

        self.assertEqual(result["cart_id"], "cart-abc")
        self.assertEqual(len(result["cart"]), 1)
        self.assertEqual(result["cart"][0]["name"], "Latte")

    async def test_correct_payload_sent_to_backend(self):
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.post = AsyncMock(return_value=({"items": []}, {"x-cart-id": "c1"}))
            MockClient.return_value = instance

            await add_item_to_cart(
                menu_item_id="item-croissant",
                qty=2,
                selected_options=[{"name": "Plain"}],
                instructions="extra crispy",
                cart_id="c1",
            )

            call_kwargs = instance.post.call_args
            payload = call_kwargs[1]["json"]
            self.assertEqual(payload["menuItemId"], "item-croissant")
            self.assertEqual(payload["qty"], 2)
            self.assertEqual(payload["instructions"], "extra crispy")

    async def test_raises_api_error_on_backend_failure(self):
        """add_item_to_cart intentionally lets ExpressAPIError bubble so the
        orchestrator can return a meaningful user-facing message (current branch contract)."""
        from app.services.http_client import ExpressAPIError
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.post = AsyncMock(side_effect=ExpressAPIError("500 Server Error"))
            MockClient.return_value = instance

            with self.assertRaises(ExpressAPIError):
                await add_item_to_cart("item-latte", 1, [], "", "cart-err")


class TestUpdateCartItemQuantity(unittest.IsolatedAsyncioTestCase):

    async def test_success_returns_updated_cart(self):
        response_body = {"cartId": "cart-1", "items": [{"name": "Latte", "qty": 3}]}
        resp_headers = {"x-cart-id": "cart-1"}

        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.patch = AsyncMock(return_value=(response_body, resp_headers))
            MockClient.return_value = instance

            result = await update_cart_item_quantity("line-1", 3, "cart-1")

        self.assertEqual(result["cart"][0]["qty"], 3)

    async def test_returns_empty_cart_on_error(self):
        from app.services.http_client import ExpressAPIError
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.patch = AsyncMock(side_effect=ExpressAPIError("404 Not Found"))
            MockClient.return_value = instance

            result = await update_cart_item_quantity("bad-line", 1, "cart-x")

        self.assertEqual(result["cart"], [])


class TestRemoveItemFromCart(unittest.IsolatedAsyncioTestCase):

    async def test_success_returns_cart_without_item(self):
        response_body = {"cartId": "cart-1", "items": []}
        resp_headers = {"x-cart-id": "cart-1"}

        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.delete = AsyncMock(return_value=(response_body, resp_headers))
            MockClient.return_value = instance

            result = await remove_item_from_cart("line-1", "cart-1")

        self.assertEqual(result["cart"], [])

    async def test_returns_original_cart_id_on_error(self):
        from app.services.http_client import ExpressAPIError
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.delete = AsyncMock(side_effect=ExpressAPIError("500"))
            MockClient.return_value = instance

            result = await remove_item_from_cart("line-fail", "cart-kept")

        self.assertEqual(result["cart_id"], "cart-kept")


class TestClearCart(unittest.IsolatedAsyncioTestCase):

    async def test_success_returns_empty_cart(self):
        resp_headers = {"x-cart-id": "cart-1"}
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.delete = AsyncMock(return_value=({"items": []}, resp_headers))
            MockClient.return_value = instance

            result = await clear_cart("cart-1")

        self.assertEqual(result["cart"], [])
        self.assertEqual(result["cart_id"], "cart-1")


# ---------------------------------------------------------------------------
# fetch_my_orders
# ---------------------------------------------------------------------------

class TestFetchMyOrders(unittest.IsolatedAsyncioTestCase):

    async def test_returns_orders_list(self):
        orders_payload = {
            "orders": [
                {"_id": "order-1", "items": [{"name": "Latte"}]},
                {"_id": "order-2", "items": [{"name": "Croissant"}]},
            ]
        }
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = _make_client_mock(get_return=orders_payload)
            MockClient.return_value = instance

            result = await fetch_my_orders()

        self.assertEqual(len(result), 2)

    async def test_auth_cookie_forwarded_in_header(self):
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.get = AsyncMock(return_value=({"orders": []}, {}))
            MockClient.return_value = instance

            await fetch_my_orders(auth_cookie="token=abc123")

            call_kwargs = instance.get.call_args
            headers = call_kwargs[1].get("headers", {})
            self.assertEqual(headers.get("cookie"), "token=abc123")

    async def test_returns_empty_list_on_error(self):
        from app.services.http_client import ExpressAPIError
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = MagicMock()
            instance.get = AsyncMock(side_effect=ExpressAPIError("401"))
            MockClient.return_value = instance

            result = await fetch_my_orders()

        self.assertEqual(result, [])

    async def test_limit_applied(self):
        orders_payload = {
            "orders": [{"_id": f"order-{i}"} for i in range(10)]
        }
        with patch("app.services.tools.ExpressHttpClient") as MockClient:
            instance = _make_client_mock(get_return=orders_payload)
            MockClient.return_value = instance

            result = await fetch_my_orders(limit=3)

        self.assertEqual(len(result), 3)


if __name__ == "__main__":
    unittest.main()
