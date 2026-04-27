/**
 * Tests for cross-system cart consistency:
 *   "add manually → chatbot view/remove/update → verify cart consistency"
 *
 * The chatbot calls the same Express cart endpoints as the frontend.
 * These tests verify the cart API contract is self-consistent across
 * sequential add → view → update → remove operations — the exact
 * sequence the chatbot's tool calls rely on.
 *
 * Covers:
 *   - Add item → GET /cart shows item with correct lineId, name, qty, price
 *   - PATCH /cart/items/:lineId (qty change) → GET /cart reflects new qty
 *   - DELETE /cart/items/:lineId → GET /cart shows item gone
 *   - Remove one of two items → remaining item and its lineId preserved
 *   - Add same item twice with identical options → merged into one line (summed qty)
 *   - PATCH qty=0 removes the line (acts as delete)
 *   - x-cart-id response header always matches cartId in body
 *
 * Does NOT retest isAvailable validation (already in orders.controller.test.js).
 */

import { jest } from "@jest/globals";
import { mockReq, mockRes, makeCart, makeCartLine, makeMenuItem } from "./helpers.js";

jest.mock("../../src/models/Cart.js");
jest.mock("../../src/models/MenuItem.js");
jest.mock("../../src/models/VariantGroup.js");

import { Cart } from "../../src/models/Cart.js";
import { MenuItem } from "../../src/models/MenuItem.js";
import { VariantGroup } from "../../src/models/VariantGroup.js";

import { addToCart, getCart, updateCartItem, removeFromCart } from "../../src/controllers/cart.controller.js";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const CART_ID = "cart-chatbot-001";

beforeEach(() => {
  jest.clearAllMocks();
  VariantGroup.find = jest.fn().mockResolvedValue([]);
});

/**
 * Build a req for the cart controller that includes the x-cart-id header.
 */
function cartReq({ body = {}, params = {}, cartId = CART_ID } = {}) {
  return mockReq({ body, params, headers: { "x-cart-id": cartId } });
}

/**
 * Teach Cart.findOne to return a given cart (or null).
 */
function stubCart(cart) {
  Cart.findOne = jest.fn().mockResolvedValue(cart);
  if (cart) {
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };
  }
}

/**
 * Teach MenuItem.find (used by buildCartResponse) to return given items.
 */
function stubMenuItems(items) {
  MenuItem.find = jest.fn().mockResolvedValue(items);
}

/**
 * Teach MenuItem.findOne (used by addToCart availability check) to return
 * the single item matching menuItemId.
 */
function stubMenuItemLookup(item) {
  MenuItem.findOne = jest.fn().mockResolvedValue(item);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cart consistency — add → view → update → remove", () => {

  // -------------------------------------------------------------------------
  // Add → view
  // -------------------------------------------------------------------------

  test("x-cart-id response header matches cartId in body", async () => {
    const menuItem = makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 });
    stubMenuItemLookup(menuItem);
    stubMenuItems([menuItem]);

    const cart = makeCart({ cartId: CART_ID, items: [] });
    Cart.findOne = jest.fn().mockResolvedValue(null);
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };
    Cart.create = jest.fn().mockResolvedValue(cart);

    const req = cartReq({ body: { menuItemId: 101, qty: 1 } });
    const res = mockRes();
    await addToCart(req, res);

    const body = res.json.mock.calls[0][0];
    const headerCartId = res._headers["x-cart-id"];

    expect(headerCartId).toBe(body.cartId);
  });

  // -------------------------------------------------------------------------
  // Update quantity
  // -------------------------------------------------------------------------

  test("PATCH qty → GET /cart reflects updated quantity on same lineId", async () => {
    const lineId = "line-001";
    const menuItem = makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 });
    const line = makeCartLine({ _id: lineId, menuItemId: 101, qty: 1 });
    const cart = makeCart({ cartId: CART_ID, items: [line] });

    stubCart(cart);
    stubMenuItems([menuItem]);

    const patchReq = cartReq({ body: { qty: 3 }, params: { lineId } });
    const patchRes = mockRes();
    await updateCartItem(patchReq, patchRes);

    const body = patchRes.json.mock.calls[0][0];
    expect(body.items).toHaveLength(1);
    expect(body.items[0].qty).toBe(3);
    expect(String(body.items[0].lineId)).toBe(lineId);
    expect(cart.save).toHaveBeenCalledTimes(1);
  });

  test("PATCH with invalid lineId returns 404 item not found", async () => {
    const cart = makeCart({ cartId: CART_ID, items: [makeCartLine({ _id: "line-real" })] });
    stubCart(cart);

    const req = cartReq({ body: { qty: 2 }, params: { lineId: "line-nonexistent" } });
    const res = mockRes();
    await updateCartItem(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  // -------------------------------------------------------------------------
  // Remove one item
  // -------------------------------------------------------------------------

  test("DELETE /cart/items/:lineId → item gone from GET /cart", async () => {
    const lineId = "line-to-remove";
    const menuItem = makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 });
    const line = makeCartLine({ _id: lineId, menuItemId: 101, qty: 2 });
    const cart = makeCart({ cartId: CART_ID, items: [line] });

    // After pull, items is empty → Cart.findOneAndDelete is called
    Cart.findOneAndDelete = jest.fn().mockResolvedValue(cart);
    stubCart(cart);
    stubMenuItems([menuItem]);

    const req = cartReq({ params: { lineId } });
    const res = mockRes();
    await removeFromCart(req, res);

    // Response should be the empty cart
    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  test("remove one of two items — remaining item and lineId are preserved", async () => {
    const lineA = makeCartLine({ _id: "line-A", menuItemId: 101, qty: 1 });
    const lineB = makeCartLine({ _id: "line-B", menuItemId: 102, qty: 2 });

    const menuA = makeMenuItem({ id: 101, name: "Latte",      basePrice: 8000 });
    const menuB = makeMenuItem({ id: 102, name: "Cappuccino", basePrice: 7500 });

    const cart = makeCart({ cartId: CART_ID, items: [lineA, lineB] });
    stubCart(cart);
    stubMenuItems([menuA, menuB]);

    // Remove lineA
    const req = cartReq({ params: { lineId: "line-A" } });
    const res = mockRes();
    await removeFromCart(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(1);
    expect(String(body.items[0].lineId)).toBe("line-B");
    expect(body.items[0].name).toBe("Cappuccino");
    expect(body.items[0].qty).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Merge duplicate lines
  // -------------------------------------------------------------------------

  test("adding same item twice with identical options merges into one line", async () => {
    const menuItem = makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 });
    stubMenuItemLookup(menuItem);
    stubMenuItems([menuItem]);

    // Cart already has one Latte (qty=1) with no options
    const existingLine = makeCartLine({ _id: "line-existing", menuItemId: 101, qty: 1, selectedOptions: [], instructions: "" });
    const cart = makeCart({ cartId: CART_ID, items: [existingLine] });

    // First call: cart exists
    Cart.findOne = jest.fn().mockResolvedValue(cart);
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };

    const req = cartReq({ body: { menuItemId: 101, qty: 1, selectedOptions: [], instructions: "" } });
    const res = mockRes();
    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];

    // Should still be one line with qty=2
    expect(body.items).toHaveLength(1);
    expect(body.items[0].qty).toBe(2);
  });

  // -------------------------------------------------------------------------
  // PATCH qty=0 removes the line
  // -------------------------------------------------------------------------

  test("PATCH qty=0 removes the line (acts as delete)", async () => {
    const lineId = "line-zero";
    const line = makeCartLine({ _id: lineId, menuItemId: 101, qty: 3 });
    const cart = makeCart({ cartId: CART_ID, items: [line] });

    Cart.findOneAndDelete = jest.fn().mockResolvedValue(cart);
    stubCart(cart);

    const req = cartReq({ body: { qty: 0 }, params: { lineId } });
    const res = mockRes();
    await updateCartItem(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Negative qty rejected
  // -------------------------------------------------------------------------

  test("PATCH with negative qty returns 400", async () => {
    const lineId = "line-neg";
    const line = makeCartLine({ _id: lineId, menuItemId: 101, qty: 2 });
    const cart = makeCart({ cartId: CART_ID, items: [line] });
    stubCart(cart);

    const req = cartReq({ body: { qty: -1 }, params: { lineId } });
    const res = mockRes();
    await updateCartItem(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // -------------------------------------------------------------------------
  // Cart not found for update / remove → handled gracefully
  // -------------------------------------------------------------------------

  test("PATCH on non-existent cartId returns 404 cart not found", async () => {
    Cart.findOne = jest.fn().mockResolvedValue(null);
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };

    const req = cartReq({ body: { qty: 2 }, params: { lineId: "line-x" }, cartId: "no-such-cart" });
    const res = mockRes();
    await updateCartItem(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("DELETE on non-existent cartId returns empty cart (not 500)", async () => {
    Cart.findOne = jest.fn().mockResolvedValue(null);
    Cart.collection = { findOne: jest.fn().mockResolvedValue(null) };

    const req = cartReq({ params: { lineId: "line-x" }, cartId: "no-such-cart" });
    const res = mockRes();
    await removeFromCart(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(0);
  });
});
