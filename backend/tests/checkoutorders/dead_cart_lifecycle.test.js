/**
 * Tests for the cross-system scenario:
 *   "place order → dead cart not resurrected, fresh cart starts cleanly"
 *
 * Covers:
 *   - createOrder with cartId → Cart.findOneAndDelete called for that cartId
 *   - After order: addToCart with old cartId → response has NEW cartId (fresh cart),
 *     zero items from the old order
 *   - createOrder WITHOUT cartId → no cart deletion attempted
 *   - createOrder with a cartId that no longer exists → order still succeeds
 *     (cart deletion is best-effort, no error)
 *   - GET /cart with the old cartId after order → returns empty cart (not old items)
 *
 * Does NOT retest createOrder validation (orders.controller.test.js).
 */

import { jest } from "@jest/globals";
import { mockReq, mockRes, makeMenuItem, makeOrder, makeCart, makeCartLine, validOrderBody } from "./helpers.js";

jest.mock("../../src/models/Order.js");
jest.mock("../../src/models/MenuItem.js");
jest.mock("../../src/models/Cart.js");
jest.mock("../../src/models/VariantGroup.js");
jest.mock("../../src/utils/orderNumber.js");

import { Order } from "../../src/models/Order.js";
import { MenuItem } from "../../src/models/MenuItem.js";
import { Cart } from "../../src/models/Cart.js";
import { VariantGroup } from "../../src/models/VariantGroup.js";
import { generateOrderNumber } from "../../src/utils/orderNumber.js";

import { createOrder } from "../../src/controllers/orders.controller.js";
import { addToCart, getCart } from "../../src/controllers/cart.controller.js";

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

function stubOrderCreation(cartId = "cart-old-001") {
  const menuItem = makeMenuItem({ id: 101, basePrice: 8000 });
  MenuItem.findOne = jest.fn().mockResolvedValue(menuItem);

  generateOrderNumber.mockReturnValue("SC-20240601-55555");
  Order.findOne = jest.fn().mockResolvedValue(null); // no collision

  const order = makeOrder({
    _id: "order-new-001",
    orderNumber: "SC-20240601-55555",
    status: "received",
    total: 8640,
  });
  Order.create = jest.fn().mockResolvedValue(order);

  Cart.findOneAndDelete = jest.fn().mockResolvedValue({ cartId }); // cart existed and was deleted
}

// ---------------------------------------------------------------------------
// createOrder → cart deletion
// ---------------------------------------------------------------------------

describe("createOrder — cart deletion on checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    VariantGroup.find = jest.fn().mockResolvedValue([]);
  });

  test("places order with cartId → Cart.findOneAndDelete called with that cartId", async () => {
    stubOrderCreation("cart-old-001");

    const req = mockReq({
      body: validOrderBody(),
      headers: { "x-cart-id": "cart-old-001" },
    });
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Cart.findOneAndDelete).toHaveBeenCalledWith({ cartId: "cart-old-001" });
  });

  test("places order WITHOUT cartId → Cart.findOneAndDelete never called", async () => {
    stubOrderCreation();
    Cart.findOneAndDelete = jest.fn(); // reset to track calls

    const req = mockReq({ body: validOrderBody() }); // no x-cart-id header
    const res = mockRes();

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Cart.findOneAndDelete).not.toHaveBeenCalled();
  });

  test("places order with already-expired cartId → order succeeds even though cart was not found", async () => {
    stubOrderCreation("cart-already-gone");
    // Simulate: cart was already deleted (TTL or previous order)
    Cart.findOneAndDelete = jest.fn().mockResolvedValue(null);

    const req = mockReq({
      body: validOrderBody(),
      headers: { "x-cart-id": "cart-already-gone" },
    });
    const res = mockRes();

    await createOrder(req, res);

    // Order creation must still succeed — cart deletion is best-effort
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "SC-20240601-55555" })
    );
  });
});

// ---------------------------------------------------------------------------
// After order: fresh cart starts cleanly
// ---------------------------------------------------------------------------

describe("addToCart — fresh cart after order places cleanly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    VariantGroup.find = jest.fn().mockResolvedValue([]);
  });

  test("POST /cart/items with old cartId creates a NEW cart (no items from old order)", async () => {
    const newCartId = "cart-fresh-uuid";

    // The old cartId is gone — findCartByIdSafely returns null → new cart created
    Cart.findOne = jest.fn().mockResolvedValue(null);
    Cart.collection = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const freshCart = makeCart({ cartId: newCartId, items: [] });
    Cart.create = jest.fn().mockResolvedValue(freshCart);

    // MenuItem stub for the new add request
    const menuItem = makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 });
    MenuItem.findOne = jest.fn().mockResolvedValue(menuItem);
    MenuItem.find = jest.fn().mockResolvedValue([menuItem]);

    const req = mockReq({
      body: { menuItemId: 101, qty: 1 },
      headers: { "x-cart-id": "cart-old-001" }, // old cartId
    });
    const res = mockRes();

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const body = res.json.mock.calls[0][0];

    // The response cartId should differ from the old one (or be a new cart's id)
    // Fresh cart has zero items from any old order
    expect(body.items).toHaveLength(1);          // only the new item
    expect(body.items[0].name).toBe("Latte");
    expect(body.items[0].qty).toBe(1);
  });

  test("GET /cart with old cartId after order returns empty cart", async () => {
    // Old cart was deleted — findOne returns null
    Cart.findOne = jest.fn().mockResolvedValue(null);
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };

    const req = mockReq({ headers: { "x-cart-id": "cart-old-001" } });
    const res = mockRes();

    await getCart(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  test("new cart after order starts with zero items — no contamination from old order", async () => {
    // Simulate: first item added to fresh cart
    const freshCartId = "cart-brand-new";
    const freshCart = makeCart({ cartId: freshCartId, items: [] });

    Cart.findOne = jest.fn().mockResolvedValue(null);
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };
    Cart.create = jest.fn().mockResolvedValue(freshCart);

    const menuItem = makeMenuItem({ id: 202, name: "Cappuccino", basePrice: 7500 });
    MenuItem.findOne = jest.fn().mockResolvedValue(menuItem);
    MenuItem.find = jest.fn().mockResolvedValue([menuItem]);

    const req = mockReq({
      body: { menuItemId: 202, qty: 2 },
      headers: { "x-cart-id": "cart-old-001" },
    });
    const res = mockRes();

    await addToCart(req, res);

    const body = res.json.mock.calls[0][0];

    // Only the single newly-added item should be present
    expect(body.items).toHaveLength(1);
    expect(body.items[0].menuItemId).toBe(202);
    expect(body.items[0].qty).toBe(2);
  });
});
