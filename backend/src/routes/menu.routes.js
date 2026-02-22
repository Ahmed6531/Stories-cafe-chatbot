import express from "express";
import { protect } from "../middleware/protect.js";
import { authorize } from "../middleware/auth.js";
import {
  getMenu,
  getMenuItem,
  getFeaturedMenu,
  getMenuByCategory, // Add this import
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menu.controller.js";

const router = express.Router();

// GET /api/menu - All menu items (minimal data)
router.get("/", getMenu);

// GET /api/menu/featured - Featured items with full variant data
router.get("/featured", getFeaturedMenu);

// GET /api/menu/category/:category - Items by category with full variant data
router.get("/category/:category", getMenuByCategory); // Add this line

// GET /api/menu/:id - Single item with full variant data
router.get("/:id", getMenuItem);

router.post("/", protect, authorize("admin"), createMenuItem);
router.patch("/:id",protect, authorize("admin"), updateMenuItem);
router.delete("/:id",protect, authorize("admin"), deleteMenuItem);

export default router;
