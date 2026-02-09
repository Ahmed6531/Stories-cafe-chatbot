import { Router } from "express";
import { addToCart, getCart } from "../controllers/cart.controller.js";

const router = Router();

router.get("/", getCart);
router.post("/items", addToCart);

export default router;
