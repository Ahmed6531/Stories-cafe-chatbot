import { Router } from "express";
import { createOrder, listOrders } from "../controllers/orders.controller.js";
import { authenticateOptional } from "../middleware/auth.js";

const router = Router();

router.post("/", authenticateOptional, createOrder);
router.get("/", listOrders);

export default router;
