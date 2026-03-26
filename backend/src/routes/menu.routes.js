import { Router } from "express";
import { protect } from "../middleware/protect.js";
import { authorize } from "../middleware/auth.js";
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

router.post("/", protect, authorize("admin"), createMenuItem);
router.patch("/:id",protect,authorize("admin"), updateMenuItem);
router.delete("/:id",protect, authorize("admin"), deleteMenuItem);

export default router;
