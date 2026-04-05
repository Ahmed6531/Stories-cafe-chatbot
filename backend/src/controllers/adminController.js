import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signToken } from "../utils/jwt.js";

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user || user.role !== "admin") {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid admin credentials" } });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid admin credentials" } });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: { code: "EMAIL_NOT_VERIFIED", message: "Account not verified" } });
    }

    const token = signToken({ id: user._id, email: user.email, role: user.role });

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    res.clearCookie("user_token", cookieOpts);
    res.cookie("admin_token", token, cookieOpts);

    res.json({ user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Server error" } });
  }
};
