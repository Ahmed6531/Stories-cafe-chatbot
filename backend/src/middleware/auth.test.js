import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { requireAuth, requireRole } from "./auth.js";

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe("auth middleware", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  describe("requireAuth", () => {
    test("no cookie present returns 401 UNAUTHORIZED", () => {
      const req = { cookies: {} };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test("valid JWT calls next and populates req.user", () => {
      const token = jwt.sign(
        { id: "user-123", email: "user@example.com", role: "admin" },
        process.env.JWT_SECRET
      );
      const req = { cookies: { token } };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual(
        expect.objectContaining({
          id: "user-123",
          email: "user@example.com",
          role: "admin",
        })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    test("expired JWT returns 401 UNAUTHORIZED", () => {
      const token = jwt.sign(
        { id: "user-123", email: "user@example.com", role: "user" },
        process.env.JWT_SECRET,
        { expiresIn: -1 }
      );
      const req = { cookies: { token } };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    test("invalid JWT signature returns 401 UNAUTHORIZED", () => {
      const token = jwt.sign(
        { id: "user-123", email: "user@example.com", role: "user" },
        "wrong-secret"
      );
      const req = { cookies: { token } };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });

  describe("requireRole", () => {
    test("valid JWT with correct role calls next", async () => {
      const token = jwt.sign(
        { id: "admin-1", email: "admin@example.com", role: "admin" },
        process.env.JWT_SECRET
      );
      const req = { cookies: { token } };
      const res = createRes();
      const next = jest.fn();

      await requireRole("admin")(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual(
        expect.objectContaining({
          id: "admin-1",
          email: "admin@example.com",
          role: "admin",
        })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    test("valid JWT with wrong role returns 403 FORBIDDEN", async () => {
      const token = jwt.sign(
        { id: "user-123", email: "user@example.com", role: "user" },
        process.env.JWT_SECRET
      );
      const req = { cookies: { token } };
      const res = createRes();
      const next = jest.fn();

      await requireRole("admin")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test("no cookie returns 401 before role check", async () => {
      const req = { cookies: {} };
      const res = createRes();
      const next = jest.fn();

      await requireRole("admin")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
