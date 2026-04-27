import { jest } from "@jest/globals";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as jwtUtils from "../../utils/jwt.js";

// Mock the entire jwt utility module
jest.mock("../../utils/jwt.js");

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

  beforeEach(() => {
    jest.clearAllMocks();
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

    test("valid token calls next and populates req.user", () => {
      const mockUser = { id: "user-123", email: "user@example.com", role: "customer" };
      // Mock verifyToken to return the user object
      jwtUtils.verifyToken.mockReturnValue(mockUser);

      const req = { cookies: { user_token: "valid-token" } };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(jwtUtils.verifyToken).toHaveBeenCalledWith("valid-token");
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test("invalid/expired token returns 401 UNAUTHORIZED", () => {
      // Mock verifyToken to throw an error
      jwtUtils.verifyToken.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      const req = { cookies: { user_token: "invalid-token" } };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(jwtUtils.verifyToken).toHaveBeenCalledWith("invalid-token");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    test("uses admin_token if user_token not present", () => {
      const mockAdmin = { id: "admin-1", email: "admin@example.com", role: "admin" };
      jwtUtils.verifyToken.mockReturnValue(mockAdmin);

      const req = { cookies: { admin_token: "admin-token" } };
      const res = createRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(jwtUtils.verifyToken).toHaveBeenCalledWith("admin-token");
      expect(req.user).toEqual(mockAdmin);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("requireRole", () => {
    test("valid token with correct role calls next", () => {
      const mockUser = { id: "admin-1", email: "admin@example.com", role: "admin" };
      jwtUtils.verifyToken.mockReturnValue(mockUser);

      const req = { cookies: { user_token: "valid-token" } };
      const res = createRes();
      const next = jest.fn();

      requireRole("admin")(req, res, next);

      expect(jwtUtils.verifyToken).toHaveBeenCalledWith("valid-token");
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test("valid token with wrong role returns 403 FORBIDDEN", () => {
      const mockUser = { id: "user-123", email: "user@example.com", role: "customer" };
      jwtUtils.verifyToken.mockReturnValue(mockUser);

      const req = { cookies: { user_token: "valid-token" } };
      const res = createRes();
      const next = jest.fn();

      requireRole("admin")(req, res, next);

      expect(jwtUtils.verifyToken).toHaveBeenCalledWith("valid-token");
      expect(req.user).toEqual(mockUser);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test("no token returns 401 before role check", () => {
      const req = { cookies: {} };
      const res = createRes();
      const next = jest.fn();

      requireRole("admin")(req, res, next);

      expect(jwtUtils.verifyToken).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test("multiple allowed roles works", () => {
      const mockUser = { id: "staff-1", email: "staff@example.com", role: "staff" };
      jwtUtils.verifyToken.mockReturnValue(mockUser);

      const req = { cookies: { user_token: "valid-token" } };
      const res = createRes();
      const next = jest.fn();

      requireRole("admin", "staff")(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});