import { Router } from "express";
import { addToCart, getCart, updateCartItem, removeFromCart, clearCart } from "../controllers/cart.controller.js";

const router = Router();

router.get("/", getCart);
router.post("/items", addToCart);
router.patch("/items/:lineId", updateCartItem);
router.delete("/items/:lineId", removeFromCart);
router.delete("/", clearCart);

export default router;
