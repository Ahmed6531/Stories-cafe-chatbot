import { Router } from "express";
import {
  getMenu,
  getMenuItem,
  getFeaturedMenu,
  getMenuByCategory,
} from "../controllers/menu.controller.js";

const router = Router();

// GET /menu - All menu items (minimal data)
router.get("/", getMenu);

// GET /menu/featured - Featured items
router.get("/featured", getFeaturedMenu);

// GET /menu/category/:category - Items by category
router.get("/category/:category", getMenuByCategory);

// GET /menu/:id - Single item by numeric ID
router.get("/:id", getMenuItem);

export default router;
