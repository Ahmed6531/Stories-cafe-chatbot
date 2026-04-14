/**
 * Tests for ghost item pruning in getCart (GET /cart)
 *
 * Scenario: an admin deletes a MenuItem from the DB while it already sits
 * inside a user's cart. The next GET /cart call must:
 *   1. Filter the deleted item out of the response
 *   2. Remove it from the Cart document in the DB (save the pruned cart)
 *   3. Not crash or 500 if ALL items are ghosts (returns empty cart)
 *
 * Also verifies that isAvailable=false items are NOT pruned — pruning only
 * happens when the MenuItem document is entirely missing from the DB.
 *
 * Does NOT retest addToCart / removeFromCart validation logic.
 */

import { jest } from "@jest/globals";
import { mockReq, mockRes, makeCart, makeCartLine, makeMenuItem } from "./helpers.js";

jest.mock("../../src/models/Cart.js");
jest.mock("../../src/models/MenuItem.js");
jest.mock("../../src/models/VariantGroup.js");

import { Cart } from "../../src/models/Cart.js";
import { MenuItem } from "../../src/models/MenuItem.js";
import { VariantGroup } from "../../src/models/VariantGroup.js";

import { getCart } from "../../src/controllers/cart.controller.js";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  VariantGroup.find = jest.fn().mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a req for GET /cart with an x-cart-id header.
 */
function cartGetReq(cartId) {
  return mockReq({ headers: { "x-cart-id": cartId } });
}

/**
 * Teach Cart.findOne to return the given cart object (or null).
 */
function stubFindCart(cart) {
  Cart.findOne = jest.fn().mockResolvedValue(cart);
}

/**
 * Teach MenuItem.find to return the given array of items.
 * The controller calls: MenuItem.find({ id: { $in: [...] } })
 */
function stubMenuItems(items) {
  MenuItem.find = jest.fn().mockResolvedValue(items);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCart — ghost item pruning", () => {

  test("item present in cart but deleted from DB is absent from response", async () => {
    const liveItem   = makeCartLine({ _id: "line-live",  menuItemId: 101 });
    const ghostItem  = makeCartLine({ _id: "line-ghost", menuItemId: 999 });

    const cart = makeCart({ cartId: "cart-abc", items: [liveItem, ghostItem] });
    stubFindCart(cart);

    // MenuItem 101 exists; MenuItem 999 does NOT (deleted)
    stubMenuItems([makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 })]);

    const req = cartGetReq("cart-abc");
    const res = mockRes();

    await getCart(req, res);

    const body = res.json.mock.calls[0][0];

    // Only the live item should appear
    expect(body.items).toHaveLength(1);
    expect(body.items[0].menuItemId).toBe(101);

    // The ghost line must have been pulled from the cart
    const remainingIds = cart.items.map((l) => String(l._id));
    expect(remainingIds).not.toContain("line-ghost");
    expect(cart.save).toHaveBeenCalledTimes(1);
  });

  test("after pruning the DB cart no longer contains the ghost line", async () => {
    const liveItem  = makeCartLine({ _id: "line-a", menuItemId: 101 });
    const ghostItem = makeCartLine({ _id: "line-b", menuItemId: 404 });

    const cart = makeCart({ cartId: "cart-def", items: [liveItem, ghostItem] });
    stubFindCart(cart);
    stubMenuItems([makeMenuItem({ id: 101, name: "Cappuccino", basePrice: 7500 })]);

    const req = cartGetReq("cart-def");
    const res = mockRes();

    await getCart(req, res);

    // After the controller runs, the in-memory cart items should only have line-a
    expect(cart.items).toHaveLength(1);
    expect(String(cart.items[0]._id)).toBe("line-a");
  });

  test("cart with ALL items deleted returns empty cart response — not 500", async () => {
    const ghost1 = makeCartLine({ _id: "line-g1", menuItemId: 111 });
    const ghost2 = makeCartLine({ _id: "line-g2", menuItemId: 222 });

    const cart = makeCart({ cartId: "cart-all-gone", items: [ghost1, ghost2] });
    stubFindCart(cart);

    // Both MenuItems missing → all items are ghosts
    stubMenuItems([]);

    // The controller calls Cart.findOneAndDelete when all items are pruned
    Cart.findOneAndDelete = jest.fn().mockResolvedValue(cart);

    const req = cartGetReq("cart-all-gone");
    const res = mockRes();

    await getCart(req, res);

    // Must NOT 500
    expect(res.status).not.toHaveBeenCalledWith(500);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  test("isAvailable=false item is NOT pruned (only deleted items are pruned)", async () => {
    const unavailableLine = makeCartLine({ _id: "line-unavail", menuItemId: 200 });

    const cart = makeCart({ cartId: "cart-unavail", items: [unavailableLine] });
    stubFindCart(cart);

    // MenuItem 200 still EXISTS in DB but isAvailable=false
    stubMenuItems([makeMenuItem({ id: 200, name: "Sold Out Drink", basePrice: 5000, isAvailable: false })]);

    const req = cartGetReq("cart-unavail");
    const res = mockRes();

    await getCart(req, res);

    const body = res.json.mock.calls[0][0];

    // isAvailable=false items still appear in cart (they are not ghost items)
    // The cart buildCartResponse includes isAvailable flag for each line
    expect(body.items).toHaveLength(1);
    expect(body.items[0].isAvailable).toBe(false);

    // Cart was NOT modified (no ghost lines)
    expect(cart.save).not.toHaveBeenCalled();
  });

  test("cart with no ghost items is returned as-is without calling save", async () => {
    const line = makeCartLine({ _id: "line-ok", menuItemId: 101 });
    const cart = makeCart({ cartId: "cart-clean", items: [line] });
    stubFindCart(cart);
    stubMenuItems([makeMenuItem({ id: 101, name: "Latte", basePrice: 8000 })]);

    const req = cartGetReq("cart-clean");
    const res = mockRes();

    await getCart(req, res);

    expect(cart.save).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].items).toHaveLength(1);
  });

  test("GET /cart with no cartId header returns empty cart without hitting DB", async () => {
    const req = mockReq({}); // no x-cart-id
    const res = mockRes();

    await getCart(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(0);
    expect(Cart.findOne).not.toHaveBeenCalled();
  });

  test("multiple items: two live, one ghost — only ghost is removed", async () => {
    const line1  = makeCartLine({ _id: "line-1", menuItemId: 101 });
    const ghost  = makeCartLine({ _id: "line-g", menuItemId: 555 });
    const line2  = makeCartLine({ _id: "line-2", menuItemId: 102 });

    const cart = makeCart({ cartId: "cart-multi", items: [line1, ghost, line2] });
    stubFindCart(cart);

    stubMenuItems([
      makeMenuItem({ id: 101, name: "Latte",      basePrice: 8000 }),
      makeMenuItem({ id: 102, name: "Cappuccino", basePrice: 7500 }),
      // 555 missing → ghost
    ]);

    const req = cartGetReq("cart-multi");
    const res = mockRes();

    await getCart(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(2);

    const returnedIds = body.items.map((i) => i.menuItemId);
    expect(returnedIds).toContain(101);
    expect(returnedIds).toContain(102);
    expect(returnedIds).not.toContain(555);

    expect(cart.save).toHaveBeenCalledTimes(1);
  });
});
