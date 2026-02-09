import express from "express";
import {
  getMenu,
  getMenuItem,
  getFeaturedMenu,
} from "../controllers/menu.controller.js";

const router = express.Router();

// GET /api/menu - All menu items (minimal data)
router.get("/", getMenu);

// GET /api/menu/featured - Featured items with full variant data
router.get("/featured", getFeaturedMenu);

// GET /api/menu/:id - Single item with full variant data
router.get("/:id", getMenuItem);

export default router;
