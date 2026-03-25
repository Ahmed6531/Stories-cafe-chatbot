import { Router } from "express";
import { createOrder, listOrders } from "../controllers/orders.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireRole("admin"), listOrders);
router.post("/", requireAuth, createOrder);

export default router;
