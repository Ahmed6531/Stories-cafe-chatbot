import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendEmail } from "../utils/mailer.js";
import { accountVerifyTemplate } from "../utils/EmailTemplates.js";

const router = express.Router();
console.log("auth routes loaded");

// REGISTER
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });

    const actionLink = `${process.env.BACKEND_URL}/auth/verify-email?email=${email}`;

    sendEmail(
      email,
      "Verify Your Account",
      accountVerifyTemplate,
      { name: email.split("@")[0], actionLink }
    )
      .then(() => console.log("Welcome email sent"))
      .catch((err) => console.error("Error sending welcome email:", err));

    res.status(201).json({ message: "User created" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
  const actionLink = `${process.env.BACKEND_URL}/auth/verify-email?email=${email}`;
   await sendEmail(
    email,
    "Verify Your Account",
    accountVerifyTemplate,
    { name: email.split("@")[0], actionLink }
  );
  return res.status(403).json({ message: "Please verify your email. A new verification email has been sent." });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// FORGOT PASSWORD (currently sends account verification email)
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: "If this email exists, an account verification email will be sent" });
    }

    const actionLink = `${process.env.BACKEND_URL}/auth/verify-email?email=${email}`;

    await sendEmail(
      email,
      "Confirm Your Stories Cafe Account",
      accountVerifyTemplate,
      { name: email.split("@")[0], actionLink }
    );

    res.status(200).json({ message: "Account verification email sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// VERIFY
router.get("/verify-email", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).send("Missing email");
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send("User not found");
    }

    user.isVerified = true;
    await user.save();

    const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`;
    const html = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Stories Cafe - Verified</title>
          <style>
            :root { --brand: #00704a; --text: #1f2937; --muted: #6b7280; --line: #e6ece8; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px;
              font-family: Arial, Helvetica, sans-serif;
              color: var(--text);
              background: #f8faf9;
            }
            .card {
              width: 100%;
              max-width: 480px;
              background: #fff;
              border: 1px solid var(--line);
              border-top: 4px solid var(--brand);
              border-radius: 14px;
              padding: 28px;
              text-align: center;
            }
            h1 {
              margin: 0 0 10px;
              font-size: 26px;
              line-height: 1.2;
              color: var(--brand);
            }
            p { margin: 0 0 10px; line-height: 1.6; }
            .muted { color: var(--muted); font-size: 13px; margin-top: 14px; }
            .btn {
              display: inline-block;
              margin-top: 14px;
              padding: 11px 18px;
              border-radius: 10px;
              background: var(--brand);
              color: #fff;
              text-decoration: none;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <section class="card">
            <h1>Email Verified</h1>
            <p>Your account is now confirmed.</p>
            <p>You can sign in to continue.</p>
            <a class="btn" href="${loginUrl}">Go to Login</a>
            <p class="muted">If the button fails, open: ${loginUrl}</p>
          </section>
        </body>
      </html>
    `;

    res.status(200).send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

export default router;
