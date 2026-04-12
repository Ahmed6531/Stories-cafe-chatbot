import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { uploadCategoryImage } from "../middleware/upload.js";
import {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  getVariantGroupsByCategory,
  uploadCategoryImage as uploadCategoryImageController,
} from "../controllers/category.controller.js";
import {
  createVariantGroup,
  updateVariantGroup,
  deleteVariantGroup,
} from "../controllers/variantGroup.controller.js";

const router = Router();

// ── Category CRUD ─────────────────────────────────────────────────────────────

// Order matters: slug/:slug before /:id to avoid collision
router.get("/",          getCategories);
router.get("/slug/:slug", getCategoryBySlug);

router.post(   "/",    requireRole("admin"), createCategory);
router.post("/:id/image", requireRole("admin"), uploadCategoryImage, uploadCategoryImageController);
router.patch(  "/:id", requireRole("admin"), updateCategory);
router.delete( "/:id", requireRole("admin"), deleteCategory);

// ── Nested variant-group routes ───────────────────────────────────────────────

// GET /categories/:categoryId/variant-groups — public (needed on order form)
router.get("/:categoryId/variant-groups", getVariantGroupsByCategory);

// POST /categories/:categoryId/variant-groups — admin
router.post(
  "/:categoryId/variant-groups",
  requireRole("admin"),
  createVariantGroup,
);

// PATCH /categories/:categoryId/variant-groups/:groupId — admin
router.patch(
  "/:categoryId/variant-groups/:groupId",
  requireRole("admin"),
  updateVariantGroup,
);

// DELETE /categories/:categoryId/variant-groups/:groupId — admin (soft)
router.delete(
  "/:categoryId/variant-groups/:groupId",
  requireRole("admin"),
  deleteVariantGroup,
);

export default router;
