/**
 * Tests for updateOrderStatus (PATCH /orders/:id/status)
 *
 * Covers the full state machine:
 *   Valid:   received→{in_progress,completed,cancelled}
 *            in_progress→{completed,cancelled}
 *   Invalid: completed→anything, cancelled→anything, in_progress→received
 *   Bad input: unknown status value, missing status body, unknown order _id
 *
 * Does NOT retest anything in orders.controller.test.js (createOrder tests).
 */

import { jest } from "@jest/globals";
import { mockReq, mockRes, makeOrder } from "./helpers.js";

jest.mock("../../src/models/Order.js");
import { Order } from "../../src/models/Order.js";

import { updateOrderStatus } from "../../src/controllers/orders.controller.js";

// ---------------------------------------------------------------------------
// Helper: build a req for PATCH /orders/:id/status
// ---------------------------------------------------------------------------
function patchStatusReq(orderId, newStatus) {
  return mockReq({ params: { id: orderId }, body: { status: newStatus } });
}

describe("updateOrderStatus — state machine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Valid transitions
  // -------------------------------------------------------------------------

  describe("valid transitions → 200", () => {
    const validCases = [
      { from: "received",    to: "in_progress" },
      { from: "received",    to: "completed"   },
      { from: "received",    to: "cancelled"   },
      { from: "in_progress", to: "completed"   },
      { from: "in_progress", to: "cancelled"   },
    ];

    test.each(validCases)(
      "$from → $to returns 200 with updated status",
      async ({ from, to }) => {
        const order = makeOrder({ status: from });
        Order.findById = jest.fn().mockResolvedValue(order);

        const req = patchStatusReq("order-id-001", to);
        const res = mockRes();

        await updateOrderStatus(req, res);

        // status should have been updated on the order object
        expect(order.status).toBe(to);
        expect(order.save).toHaveBeenCalledTimes(1);

        // response: 200 (no explicit res.status call means it defaults to 200)
        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(res.status).not.toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            order: expect.objectContaining({ status: to }),
          })
        );
      }
    );
  });

  // -------------------------------------------------------------------------
  // Invalid transitions (terminal or backwards)
  // -------------------------------------------------------------------------

  describe("invalid transitions → 400 INVALID_TRANSITION", () => {
    const invalidCases = [
      { from: "completed",   to: "received",    reason: "terminal state" },
      { from: "completed",   to: "in_progress", reason: "terminal state" },
      { from: "completed",   to: "cancelled",   reason: "terminal state" },
      { from: "cancelled",   to: "received",    reason: "terminal state" },
      { from: "cancelled",   to: "in_progress", reason: "terminal state" },
      { from: "cancelled",   to: "completed",   reason: "terminal state" },
      { from: "in_progress", to: "received",    reason: "backwards transition" },
    ];

    test.each(invalidCases)(
      "$from → $to is rejected ($reason)",
      async ({ from, to }) => {
        const order = makeOrder({ status: from });
        Order.findById = jest.fn().mockResolvedValue(order);

        const req = patchStatusReq("order-id-001", to);
        const res = mockRes();

        await updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: "INVALID_TRANSITION" }),
          })
        );
        // The order status must NOT have changed
        expect(order.status).toBe(from);
        expect(order.save).not.toHaveBeenCalled();
      }
    );
  });

  // -------------------------------------------------------------------------
  // Bad input — invalid status value
  // -------------------------------------------------------------------------

  describe("bad status value → 400 VALIDATION_ERROR", () => {
    const badValues = ["shipped", "pending", "", null, undefined, 0, "COMPLETED"];

    test.each(badValues)(
      "status=%p returns 400 VALIDATION_ERROR",
      async (badStatus) => {
        const req = mockReq({ params: { id: "order-id-001" }, body: { status: badStatus } });
        const res = mockRes();

        await updateOrderStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
          })
        );
        // Should not touch DB for bad input
        expect(Order.findById).not.toHaveBeenCalled?.();
      }
    );
  });

  // -------------------------------------------------------------------------
  // Order not found
  // -------------------------------------------------------------------------

  test("unknown order _id returns 404", async () => {
    Order.findById = jest.fn().mockResolvedValue(null);

    const req = patchStatusReq("nonexistent-id", "in_progress");
    const res = mockRes();

    await updateOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "NOT_FOUND" }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Error message includes current status and allowed transitions
  // -------------------------------------------------------------------------

  test("INVALID_TRANSITION error message lists allowed next states", async () => {
    const order = makeOrder({ status: "completed" });
    Order.findById = jest.fn().mockResolvedValue(order);

    const req = patchStatusReq("order-id-001", "in_progress");
    const res = mockRes();

    await updateOrderStatus(req, res);

    const errorMessage = res.json.mock.calls[0][0].error.message;
    expect(errorMessage).toMatch(/completed/);
    expect(errorMessage).toMatch(/terminal/i);
  });

  test("in_progress INVALID_TRANSITION message mentions the attempted target", async () => {
    const order = makeOrder({ status: "in_progress" });
    Order.findById = jest.fn().mockResolvedValue(order);

    const req = patchStatusReq("order-id-001", "received");
    const res = mockRes();

    await updateOrderStatus(req, res);

    const errorMessage = res.json.mock.calls[0][0].error.message;
    expect(errorMessage).toMatch(/in_progress/);
    expect(errorMessage).toMatch(/received/);
  });
});
