import express from "express";
import bcrypt from "bcryptjs";
import { signToken } from "../utils/jwt.js";
import User from "../models/User.js";
import { sendEmail } from "../utils/mailer.js";
import { accountVerifyTemplate } from "../utils/EmailTemplates.js";
import { generateVerificationToken, verifyVerificationToken } from "../utils/tokens.js";
import { requireAuth } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { validate } from "../utils/validate.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, please try again later" } },
});

const router = express.Router();
console.log("✅ auth routes loaded");

// REGISTER
router.post("/register", validate([
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("name").notEmpty().isLength({ min: 2, max: 50 }).withMessage("Name must be 2–50 characters"),
]), async (req, res) => {
  const { name, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Missing fields" } });
  }

  try {
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: { code: "CONFLICT", message: "User already exists" } });
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashed });

    const verificationToken = generateVerificationToken(email);
    const actionLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    sendEmail(
      email,
      "Verify Your Account",
      accountVerifyTemplate,
      { name: email.split("@")[0], actionLink }
    )
      .then(() => {})
      .catch((err) => console.error("Error sending welcome email:", err));

    res.status(201).json({ message: "User created" });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Server error" } });
  }
});

// LOGIN
router.post("/login", authLimiter, validate([
  body("email").notEmpty().withMessage("Email is required"),
  body("password").notEmpty().withMessage("Password is required"),
]), async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
    }

    if (user.role === "admin") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin accounts must use the admin login" } });
    }

    if (!user.isVerified) {
      const verificationToken = generateVerificationToken(email);
      const actionLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
      try {
        await sendEmail(
          email,
          "Verify Your Account",
          accountVerifyTemplate,
          { name: email.split("@")[0], actionLink }
        );
      } catch (e) {
        console.error("Re-send verification email failed:", e);
      }
      return res.status(403).json({ error: { code: "EMAIL_NOT_VERIFIED", message: "Please verify your email. A new verification email has been sent." } });
    }

    const token = signToken({ id: user._id, email: user.email, role: user.role });

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    res.clearCookie("admin_token", cookieOpts);
    res.cookie("user_token", token, cookieOpts);

    res.set("Cache-Control", "no-store");
    res.json({ user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Server error" } });
  }
});

// LOGOUT
router.post("/logout", (_req, res) => {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };
  res.clearCookie("user_token", cookieOpts);
  res.clearCookie("admin_token", cookieOpts);
  res.set("Cache-Control", "no-store");
  res.json({ success: true });
});

// SESSION — returns current user from cookie
router.get("/me", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "User not found" } });
    }
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified } });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Server error" } });
  }
});

// SEND VERIFICATION EMAIL
router.post("/send-verification", authLimiter, validate([
  body("email").isEmail().normalizeEmail(),
]), async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });

    const verificationToken = generateVerificationToken(email);
    const actionLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await sendEmail(
      email,
      "Verify Your Account",
      accountVerifyTemplate,
      { name: email.split("@")[0], actionLink }
    );

    res.set("Cache-Control", "no-store");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Server error" } });
  }
});

// VERIFY EMAIL
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Missing token" } });

  try {
    const { email } = verifyVerificationToken(token);

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });

    user.isVerified = true;
    await user.save();

    res.set("Cache-Control", "no-store");
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
  }
});

export default router;
