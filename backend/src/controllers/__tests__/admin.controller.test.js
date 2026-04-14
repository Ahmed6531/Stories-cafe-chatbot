import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import bcrypt from "bcryptjs";
import { adminLogin } from "../../controllers/adminController.js";

jest.mock("../../models/User.js");
jest.mock("bcryptjs");
jest.mock("../../utils/jwt.js", () => ({
  signToken: jest.fn(),
  verifyToken: jest.fn(),
}));

import User from "../../models/User.js";
import * as jwtUtils from "../../utils/jwt.js";

describe("ADMIN AUTH", () => {
  let req, res;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
  });

  it("successfully logs in admin", async () => {
    const mockAdmin = {
      _id: "admin1",
      email: "admin@test.com",
      password: "hashed",
      role: "admin",
      isVerified: true,
    };

    User.findOne.mockResolvedValue(mockAdmin);
    bcrypt.compare.mockResolvedValue(true);
    jwtUtils.signToken.mockReturnValue("signed-admin-token");

    req.body = { email: "admin@test.com", password: "adminpass" };

    await adminLogin(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: "admin@test.com" });
    expect(bcrypt.compare).toHaveBeenCalledWith("adminpass", "hashed");
    expect(jwtUtils.signToken).toHaveBeenCalledWith({
      id: "admin1",
      email: "admin@test.com",
      role: "admin",
    });
    expect(res.clearCookie).toHaveBeenCalledWith("user_token", expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith(
      "admin_token",
      "signed-admin-token",
      expect.any(Object)
    );
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.json).toHaveBeenCalledWith({
      user: { id: "admin1", email: "admin@test.com", role: "admin" },
    });
  });

  // Additional tests for invalid credentials, non-admin, unverified, etc. can be added here.
});