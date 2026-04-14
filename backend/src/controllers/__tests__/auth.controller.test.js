// Mock JWT utils before any imports (Jest hoists these)
jest.mock("../../utils/jwt.js", () => ({
  signToken: jest.fn(),
  verifyToken: jest.fn(),
}));

jest.mock("../../models/User.js");
jest.mock("../../utils/mailer.js");
jest.mock("../../utils/tokens.js");
jest.mock("bcryptjs");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (req, res, next) => next())
);

import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import bcrypt from "bcryptjs";

// Now import the router and mocked modules
import authRouter from "../../routes/auth.routes.js";
import User from "../../models/User.js";
import * as mailer from "../../utils/mailer.js";
import * as tokens from "../../utils/tokens.js";
import * as jwtUtils from "../../utils/jwt.js";

describe("AUTH SYSTEM", () => {
  let app;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use(cookieParser()); // <-- ADD THIS
    app.use(authRouter);

    jest.clearAllMocks();

    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
  });

  // =========================
  // POST /register
  // =========================
  describe("POST /register", () => {
    it("registers valid user and sends verification email", async () => {
      const mockUser = {
        _id: "123",
        name: "John",
        email: "john@test.com",
        password: "hashedPassword",
      };

      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue(mockUser);
      bcrypt.hash.mockResolvedValue("hashedPassword");
      tokens.generateVerificationToken.mockReturnValue("verification-token-xyz");
      mailer.sendEmail.mockResolvedValue(true);

      const res = await request(app)
        .post("/register")
        .send({
          name: "John",
          email: "john@test.com",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: "User created" });
      expect(User.findOne).toHaveBeenCalledWith({ email: "john@test.com" });
      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
      expect(User.create).toHaveBeenCalledWith({
        name: "John",
        email: "john@test.com",
        password: "hashedPassword",
      });
      expect(tokens.generateVerificationToken).toHaveBeenCalledWith("john@test.com");
      expect(mailer.sendEmail).toHaveBeenCalled();
    });

    it("rejects duplicate email with 409", async () => {
      User.findOne.mockResolvedValue({ email: "john@test.com" });

      const res = await request(app)
        .post("/register")
        .send({
          name: "John",
          email: "john@test.com",
          password: "password123",
        });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: { code: "CONFLICT", message: "User already exists" },
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it("rejects missing name (validation error) with 400", async () => {
      const res = await request(app)
        .post("/register")
        .send({
          email: "john@test.com",
          password: "password123",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("rejects short password (validation error) with 400", async () => {
      const res = await request(app)
        .post("/register")
        .send({
          name: "John",
          email: "john@test.com",
          password: "short",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("handles database error during creation with 500", async () => {
      User.findOne.mockResolvedValue(null);
      User.create.mockRejectedValue(new Error("DB error"));

      const res = await request(app)
        .post("/register")
        .send({
          name: "John",
          email: "john@test.com",
          password: "password123",
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Server error" },
      });
    });
  });

  // =========================
  // POST /login
  // =========================
  describe("POST /login", () => {
    it("logs in verified user and sets user_token cookie", async () => {
      const mockUser = {
        _id: "123",
        email: "user@test.com",
        password: "hashedPassword",
        role: "user",
        isVerified: true,
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwtUtils.signToken.mockReturnValue("signed-jwt-token");

      const res = await request(app)
        .post("/login")
        .send({
          email: "user@test.com",
          password: "correctpassword",
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { id: "123", email: "user@test.com", role: "user" },
      });

      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const userTokenCookie = cookies.find((c) => c.startsWith("user_token="));
      expect(userTokenCookie).toBeDefined();
      expect(userTokenCookie).toMatch(/HttpOnly/);
    });

    it("blocks admin login via customer route with 403", async () => {
      const mockAdmin = {
        _id: "admin1",
        email: "admin@test.com",
        password: "hashed",
        role: "admin",
        isVerified: true,
      };

      User.findOne.mockResolvedValue(mockAdmin);
      bcrypt.compare.mockResolvedValue(true);

      const res = await request(app)
        .post("/login")
        .send({
          email: "admin@test.com",
          password: "adminpass",
        });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: { code: "FORBIDDEN", message: "Admin accounts must use the admin login" },
      });
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("blocks unverified user login, resends verification email, and returns 403", async () => {
      const mockUser = {
        _id: "123",
        email: "unverified@test.com",
        password: "hashed",
        role: "user",
        isVerified: false,
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      tokens.generateVerificationToken.mockReturnValue("new-token");
      mailer.sendEmail.mockResolvedValue(true);

      const res = await request(app)
        .post("/login")
        .send({
          email: "unverified@test.com",
          password: "password",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
      expect(tokens.generateVerificationToken).toHaveBeenCalledWith("unverified@test.com");
      expect(mailer.sendEmail).toHaveBeenCalled();
    });

    it("returns 401 for invalid credentials (wrong password)", async () => {
      const mockUser = {
        _id: "123",
        email: "user@test.com",
        password: "hashed",
        role: "user",
        isVerified: true,
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      const res = await request(app)
        .post("/login")
        .send({
          email: "user@test.com",
          password: "wrongpassword",
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
      });
    });

    it("returns 401 for non-existent user", async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post("/login")
        .send({
          email: "nonexistent@test.com",
          password: "any",
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
      });
    });
  });

  // =========================
  // GET /verify-email
  // =========================
  describe("GET /verify-email", () => {
    it("verifies user with valid token", async () => {
      const mockUser = {
        _id: "123",
        email: "user@test.com",
        isVerified: false,
        save: jest.fn().mockResolvedValue(true),
      };

      tokens.verifyVerificationToken.mockReturnValue({ email: "user@test.com" });
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .get("/verify-email")
        .query({ token: "valid-token" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockUser.isVerified).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it("fails without token (400)", async () => {
      const res = await request(app).get("/verify-email");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: "VALIDATION_ERROR", message: "Missing token" },
      });
    });

    it("returns 400 for invalid/expired token", async () => {
      tokens.verifyVerificationToken.mockImplementation(() => {
        throw new Error("Invalid or expired token");
      });

      const res = await request(app)
        .get("/verify-email")
        .query({ token: "bad-token" });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe("Invalid or expired token");
    });

    it("returns 404 if user not found", async () => {
      tokens.verifyVerificationToken.mockReturnValue({ email: "missing@test.com" });
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .get("/verify-email")
        .query({ token: "valid-but-user-gone" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: "NOT_FOUND", message: "User not found" },
      });
    });
  });

  // =========================
  // POST /logout
  // =========================
  describe("POST /logout", () => {
    it("clears both user_token and admin_token cookies", async () => {
      const res = await request(app).post("/logout");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      const cookies = res.headers["set-cookie"];
      expect(cookies.some((c) => c.includes("user_token=;"))).toBe(true);
      expect(cookies.some((c) => c.includes("admin_token=;"))).toBe(true);
    });
  });

  // =========================
  // GET /me
  // =========================
  describe("GET /me", () => {
    it("returns user data when authenticated", async () => {
      // Mock verifyToken to return a decoded user
      jwtUtils.verifyToken.mockReturnValue({
        id: "123",
        email: "john@test.com",
        role: "user",
      });

      const mockUser = {
        _id: "123",
        name: "John",
        email: "john@test.com",
        role: "user",
        isVerified: true,
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const res = await request(app)
        .get("/me")
        .set("Cookie", ["user_token=valid-jwt"]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: {
          id: "123",
          name: "John",
          email: "john@test.com",
          role: "user",
          isVerified: true,
        },
      });
    });

    it("returns 401 if not authenticated", async () => {
      const res = await request(app).get("/me");
      expect(res.status).toBe(401);
    });
  });

  // =========================
  // POST /send-verification
  // =========================
  describe("POST /send-verification", () => {
    it("sends verification email for existing user", async () => {
      const mockUser = { email: "user@test.com" };
      User.findOne.mockResolvedValue(mockUser);
      tokens.generateVerificationToken.mockReturnValue("token");
      mailer.sendEmail.mockResolvedValue(true);

      const res = await request(app)
        .post("/send-verification")
        .send({ email: "user@test.com" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mailer.sendEmail).toHaveBeenCalled();
    });

    it("returns 404 if user not found", async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post("/send-verification")
        .send({ email: "notfound@test.com" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: "NOT_FOUND", message: "User not found" },
      });
    });
  });
});