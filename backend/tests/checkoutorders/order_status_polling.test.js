/**
 * Tests for getOrderStatus (GET /orders/:orderNumber/status)
 *
 * Simulates the success-page polling flow:
 *   received → in_progress → completed / cancelled
 *
 * Covers:
 *   - Correct status returned at each stage
 *   - Response shape contains only orderNumber, status, updatedAt (no PII)
 *   - Works without authentication (public endpoint)
 *   - Works with an authenticated user (auth doesn't change output)
 *   - Returns 404 for unknown orderNumber
 *   - Returns 500 when DB throws
 *
 * Does NOT retest createOrder (orders.controller.test.js).
 */

import { jest } from "@jest/globals";
import { mockReq, mockRes, makeOrder } from "./helpers.js";

jest.mock("../../src/models/Order.js");
import { Order } from "../../src/models/Order.js";

import { getOrderStatus } from "../../src/controllers/orders.controller.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function pollReq(orderNumber, user = undefined) {
  return mockReq({ params: { orderNumber }, user });
}

describe("getOrderStatus — success-page polling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Correct status at each lifecycle stage
  // -------------------------------------------------------------------------

  const stages = ["received", "in_progress", "completed", "cancelled"];

  test.each(stages)(
    "returns status=%s correctly",
    async (status) => {
      const order = makeOrder({ orderNumber: "SC-20240101-00001", status });
      // getOrderStatus calls .select() so we need a chainable mock
      Order.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(order),
      });

      const req = pollReq("SC-20240101-00001");
      const res = mockRes();

      await getOrderStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status })
      );
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
    }
  );

  // -------------------------------------------------------------------------
  // Response shape — only safe fields exposed
  // -------------------------------------------------------------------------

  test("response contains orderNumber, status, updatedAt — no PII or internal fields", async () => {
    const updatedAt = new Date("2024-06-01T12:00:00Z");
    const order = makeOrder({
      orderNumber: "SC-20240601-11111",
      status: "in_progress",
      updatedAt,
    });
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(order),
    });

    const req = pollReq("SC-20240601-11111");
    const res = mockRes();

    await getOrderStatus(req, res);

    const body = res.json.mock.calls[0][0];

    expect(body).toHaveProperty("orderNumber", "SC-20240601-11111");
    expect(body).toHaveProperty("status", "in_progress");
    expect(body).toHaveProperty("updatedAt");

    // Must NOT leak customer or userId
    expect(body).not.toHaveProperty("customer");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("total");
  });

  // -------------------------------------------------------------------------
  // Auth is irrelevant — endpoint is public
  // -------------------------------------------------------------------------

  test("returns 200 without authentication (no req.user)", async () => {
    const order = makeOrder({ orderNumber: "SC-20240101-00002", status: "received" });
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(order),
    });

    const req = pollReq("SC-20240101-00002", undefined); // no user
    const res = mockRes();

    await getOrderStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "received" })
    );
  });

  test("returns same data for authenticated user (auth does not add or change fields)", async () => {
    const order = makeOrder({ orderNumber: "SC-20240101-00003", status: "completed" });
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(order),
    });

    const authenticatedUser = { id: "user-abc", role: "user" };
    const req = pollReq("SC-20240101-00003", authenticatedUser);
    const res = mockRes();

    await getOrderStatus(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty("status", "completed");
    expect(body).not.toHaveProperty("userId");
  });

  // -------------------------------------------------------------------------
  // Polling sequence: simulate three consecutive polls through lifecycle
  // -------------------------------------------------------------------------

  test("sequential polls reflect status progression: received → in_progress → completed", async () => {
    const orderNumber = "SC-20240101-00004";

    // Poll 1: received
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(
        makeOrder({ orderNumber, status: "received" })
      ),
    });
    const res1 = mockRes();
    await getOrderStatus(pollReq(orderNumber), res1);
    expect(res1.json.mock.calls[0][0].status).toBe("received");

    // Poll 2: in_progress (simulated after admin update)
    jest.clearAllMocks();
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(
        makeOrder({ orderNumber, status: "in_progress" })
      ),
    });
    const res2 = mockRes();
    await getOrderStatus(pollReq(orderNumber), res2);
    expect(res2.json.mock.calls[0][0].status).toBe("in_progress");

    // Poll 3: completed
    jest.clearAllMocks();
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(
        makeOrder({ orderNumber, status: "completed" })
      ),
    });
    const res3 = mockRes();
    await getOrderStatus(pollReq(orderNumber), res3);
    expect(res3.json.mock.calls[0][0].status).toBe("completed");
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  test("unknown orderNumber returns 404 NOT_FOUND", async () => {
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const req = pollReq("SC-99999999-00000");
    const res = mockRes();

    await getOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "NOT_FOUND" }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // DB error → 500
  // -------------------------------------------------------------------------

  test("DB failure returns 500 INTERNAL_ERROR", async () => {
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockRejectedValue(new Error("DB connection lost")),
    });

    const req = pollReq("SC-20240101-00005");
    const res = mockRes();

    await getOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "INTERNAL_ERROR" }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Cache-Control header always set to no-store
  // -------------------------------------------------------------------------

  test("sets Cache-Control: no-store on success", async () => {
    const order = makeOrder({ orderNumber: "SC-20240101-00006", status: "received" });
    Order.findOne = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(order),
    });

    const req = pollReq("SC-20240101-00006");
    const res = mockRes();

    await getOrderStatus(req, res);

    expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
});
