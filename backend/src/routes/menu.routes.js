import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import {
  getMenu,
  getMenuCategories,
  getMenuItem,
  getFeaturedMenu,
  getMenuByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menu.controller.js";

const router = Router();

// GET /menu - All menu items (minimal data)
router.get("/", getMenu);

// GET /menu/featured - Featured items
router.get("/featured", getFeaturedMenu);

// GET /menu/categories - Distinct top-level categories
router.get("/categories", getMenuCategories);

// GET /menu/category/:category - Items by category
router.get("/category/:category", getMenuByCategory);

// GET /menu/:id - Single item by numeric ID
router.get("/:id", getMenuItem);

router.post("/", requireRole("admin"), createMenuItem);
router.patch("/:id", requireRole("admin"), updateMenuItem);
router.delete("/:id", requireRole("admin"), deleteMenuItem);

export default router;
