import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";
import {
  getMenu,
  getMenuCategories,
  getMenuItem,
  getFeaturedMenu,
  getMenuByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuItemImage,
} from "../controllers/menu.controller.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

// Order matters: specific paths before :id wildcard
router.get("/featured",    getFeaturedMenu);
router.get("/categories",  getMenuCategories);
router.get("/category/:category", getMenuByCategory);
router.get("/:id",         getMenuItem);
router.get("/",            getMenu);

// ── Admin ─────────────────────────────────────────────────────────────────────

router.post("/", requireRole("admin"), createMenuItem);
router.patch("/:id", requireRole("admin"), updateMenuItem);
router.delete("/:id", requireRole("admin"), deleteMenuItem);

// Image upload — multer runs before the controller
router.post(
  "/:id/image",
  requireRole("admin"),
  uploadImage,          // multer: parses multipart, saves file, populates req.file
  uploadMenuItemImage   // controller: patches MenuItem.image, returns URL
);

export default router;
