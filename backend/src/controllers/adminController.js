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

    const token = signToken({ id: user._id, email: user.email, role: user.role });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Server error" } });
  }
};
