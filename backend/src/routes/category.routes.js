import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
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

router.post(   "/",    authenticate, authorize("admin"), createCategory);
router.post("/:id/image", authenticate, authorize("admin"), uploadCategoryImage, uploadCategoryImageController);
router.patch(  "/:id", authenticate, authorize("admin"), updateCategory);
router.delete( "/:id", authenticate, authorize("admin"), deleteCategory);

// ── Nested variant-group routes ───────────────────────────────────────────────

// GET /categories/:categoryId/variant-groups — public (needed on order form)
router.get("/:categoryId/variant-groups", getVariantGroupsByCategory);

// POST /categories/:categoryId/variant-groups — admin
router.post(
  "/:categoryId/variant-groups",
  authenticate,
  authorize("admin"),
  createVariantGroup,
);

// PATCH /categories/:categoryId/variant-groups/:groupId — admin
router.patch(
  "/:categoryId/variant-groups/:groupId",
  authenticate,
  authorize("admin"),
  updateVariantGroup,
);

// DELETE /categories/:categoryId/variant-groups/:groupId — admin (soft)
router.delete(
  "/:categoryId/variant-groups/:groupId",
  authenticate,
  authorize("admin"),
  deleteVariantGroup,
);

export default router;
