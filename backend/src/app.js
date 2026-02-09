import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { authenticate } from "./middleware/auth.js";
import healthRoutes from "./routes/health.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import authRoutes from "./routes/auth.routes.js";
import 'dotenv/config'; 
import { transporter } from "./utils/mailer.js";


export function createApp() {
  const app = express();


  console.log("CORS_ORIGIN =", ENV.CORS_ORIGIN)


 

  // Allows the frontend (5173) to call the backend (5000) in the browser
  app.use(cors({ origin: ENV.CORS_ORIGIN }));
  app.use(express.json());

  //routes
  app.use("/health", healthRoutes);
  app.use("/menu", menuRoutes);
  app.use("/orders", ordersRoutes);
  app.use("/auth", authRoutes);

  
  app.get("/api/protected", authenticate, (req, res) => {
    res.json({
      message: "This is protected!",
      userId: req.user.id
    });
  });
  app.use((req, res) => res.status(404).json({ error: "Not Found" }));

  return app;
}
