import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendEmail } from "../utils/mailer.js";
import { welcomeTemplate , verifyButtonTemplate } from "../utils/EmailTemplates.js";


const router = express.Router();
console.log("✅ auth routes loaded");


// REGISTER
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Missing fields" });

  try {
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed });

    sendEmail(
      email,                        
      "Welcome to Stories Cafe!",    
      welcomeTemplate,               
      { name: email.split("@")[0] }
    )
      .then(() => console.log("✅ Welcome email sent"))
      .catch(err => console.error("❌ Error sending welcome email:", err));

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
    if (!user)
      return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id ,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

//FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: "If this email exists, a verification email will be sent" });
    }

     const actionLink = `${process.env.BACKEND_URL}/auth/verify-email?email=${email}`; 

    await sendEmail(
      email,
      "Verify Your Account",
      verifyButtonTemplate,
      { name: email.split("@")[0], actionLink }
    );

    res.status(200).json({ message: "Verification email sent" });
  } catch (err) {
    console.error(err);
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

    res.send("<h1>Email verified! ✅</h1><p>You can now continue using your account.</p>");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

export default router;
