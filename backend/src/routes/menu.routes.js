import { Router } from "express";
import { protect } from "../middleware/protect.js";
import { authorize } from "../middleware/auth.js";
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

router.post(
  "/",
  protect,
  authorize("admin"),
  createMenuItem
);

// Image upload — multer runs before the controller
router.post(
  "/:id/image",
  protect,
  authorize("admin"),
  uploadImage,          // multer: parses multipart, saves file, populates req.file
  uploadMenuItemImage   // controller: patches MenuItem.image, returns URL
);

router.patch(
  "/:id",
  protect,
  authorize("admin"),
  updateMenuItem
);

router.delete(
  "/:id",
  protect,
  authorize("admin"),
  deleteMenuItem
);

export default router;