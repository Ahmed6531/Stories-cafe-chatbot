import express from "express";
import rateLimit from "express-rate-limit";
import { adminLogin } from "../controllers/adminController.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, please try again later" } },
});

const router = express.Router();

router.post("/login", authLimiter, adminLogin);

export default router;
