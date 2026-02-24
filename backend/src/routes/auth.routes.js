import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendEmail } from "../utils/mailer.js";
import { accountVerifyTemplate } from "../utils/EmailTemplates.js";

const router = express.Router();
console.log("✅ auth routes loaded");

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

// VERIFY
router.get("/verify-email", async (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).send("Missing email");

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found");

    user.isVerified = true;
    await user.save();

    const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`;
    res.status(200).send(`
      <div style="text-align:center; padding:50px; font-family: sans-serif;">
        <h1 style="color:#00704a;">Email Verified!</h1>
        <p>Your account is now confirmed. You can sign in.</p>
        <a href="${loginUrl}" style="padding:10px 20px; background:#00704a; color:white; text-decoration:none; border-radius:5px;">Go to Login</a>
      </div>
    `);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

export default router;
