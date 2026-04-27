/**
 * Shared test helpers for checkout/orders tests.
 *
 * Every test file in this folder imports from here.
 * Pattern mirrors the existing orders.controller.test.js style:
 *   - plain object mocks for req/res
 *   - jest.fn() stubs for model methods
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// req / res factories
// ---------------------------------------------------------------------------

/**
 * Build a minimal Express request mock.
 * @param {object} opts
 * @param {object} [opts.body]
 * @param {object} [opts.user]   — set to non-null to simulate authenticated request
 * @param {object} [opts.params]
 * @param {object} [opts.query]
 * @param {object} [opts.headers]
 */
export function mockReq({ body = {}, user = undefined, params = {}, query = {}, headers = {} } = {}) {
  return {
    body,
    user,
    params,
    query,
    get: jest.fn((name) => headers[name.toLowerCase()] ?? null),
  };
}

/**
 * Build a minimal Express response mock (chainable: res.status().json() works).
 */
export function mockRes() {
  const res = {
    _status: null,
    _body: null,
    _headers: {},
  };
  res.status = jest.fn().mockImplementation((code) => {
    res._status = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((body) => {
    res._body = body;
    return res;
  });
  res.set = jest.fn().mockImplementation((key, value) => {
    res._headers[key] = value;
    return res;
  });
  return res;
}

// ---------------------------------------------------------------------------
// Model-object factories
// ---------------------------------------------------------------------------

/**
 * Build a MenuItem-like plain object.
 */
export function makeMenuItem(overrides = {}) {
  return {
    id: 101,
    name: "Test Item",
    basePrice: 10000,
    isAvailable: true,
    variantGroups: [],
    options: [],
    ...overrides,
  };
}

/**
 * Build an Order-like plain object (as returned from Order.create / findById).
 * Provides .save(), .toObject() stubs so the controller can call them.
 */
export function makeOrder(overrides = {}) {
  const order = {
    _id: "order-id-001",
    orderNumber: "SC-20240101-00001",
    status: "received",
    orderType: "pickup",
    customer: { name: "Jane Doe", phone: "70123456", address: "" },
    notesToBarista: "",
    items: [],
    subtotal: 10000,
    total: 10800,
    userId: null,
    updatedAt: new Date("2024-01-01T10:00:00Z"),
    ...overrides,
  };
  order.save = jest.fn().mockResolvedValue(order);
  order.toObject = jest.fn().mockReturnValue({ ...order });
  return order;
}

/**
 * Build a Cart-like plain object with Mongoose subdocument helpers.
 */
export function makeCart(overrides = {}) {
  const cart = {
    cartId: "cart-uuid-001",
    items: [],
    ...overrides,
  };

  // Mongoose .items.id(lineId) — find subdoc by _id
  cart.items.id = (lineId) =>
    cart.items.find((l) => String(l._id) === String(lineId)) ?? null;

  // Mongoose .items.pull(lineId) — remove subdoc by _id
  cart.items.pull = (lineId) => {
    const idx = cart.items.findIndex((l) => String(l._id) === String(lineId));
    if (idx !== -1) cart.items.splice(idx, 1);
  };

  cart.save = jest.fn().mockResolvedValue(cart);

  return cart;
}

/**
 * Build a single cart line item (subdocument).
 */
export function makeCartLine(overrides = {}) {
  return {
    _id: "line-id-001",
    menuItemId: 101,
    qty: 1,
    selectedOptions: [],
    instructions: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Common order body (valid, passes all validation)
// ---------------------------------------------------------------------------

export function validOrderBody(overrides = {}) {
  return {
    orderType: "pickup",
    customer: { name: "Jane Doe", phone: "70123456" },
    items: [{ menuItemId: 101, qty: 1 }],
    ...overrides,
  };
}
