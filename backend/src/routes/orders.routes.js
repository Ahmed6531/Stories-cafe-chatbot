import { Router } from "express";
import {
  createOrder,
  listOrders,
  getMyOrders,
  updateOrderStatus
} from "../controllers/orders.controller.js";
import { authenticateOptional } from "../middleware/auth.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/my", requireAuth, getMyOrders);

router.post("/", authenticateOptional, requireAuth, createOrder);

// Admin only
router.get("/", requireRole("admin"), listOrders);
router.patch("/:id/status", requireRole("admin"), updateOrderStatus);

export default router;