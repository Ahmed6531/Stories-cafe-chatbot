import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { ENV } from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { errorHandler } from "./utils/error.js";

function validateEnv() {
  const required = ["JWT_SECRET", "TOKEN_SECRET", "COOKIE_SECRET", "CORS_ORIGIN", "NODE_ENV"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function createApp() {
  validateEnv();

  const app = express();

  // Security headers: must be first
  app.use(helmet());

  // CORS
  app.use(cors({
    origin: ENV.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ["x-cart-id"],
    allowedHeaders: ["Content-Type", "x-cart-id", "Cache-Control"],
  }));

  app.use(express.json());
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // General rate limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" } },
  });
  app.use(apiLimiter);

  // Routes
  app.use("/health", healthRoutes);
  app.use("/menu", menuRoutes);
  app.use("/orders", ordersRoutes);
  app.use("/cart", cartRoutes);
  app.use("/auth", authRoutes);
  app.use("/admin", adminRoutes);

  app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

  // Error handler: must be last
  app.use(errorHandler);

  return app;
}