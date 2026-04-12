import express from "express";
import {
  getVariantGroups,
  createVariantGroup,
  updateVariantGroup,
  deleteVariantGroup,
} from "../controllers/variantGroup.controller.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

// Public — anyone can read variant groups (needed for order form)
router.get("/", getVariantGroups);

// Admin-only mutations
router.post("/", requireRole("admin"), createVariantGroup);
router.patch("/:groupId", requireRole("admin"), updateVariantGroup);
router.delete("/:groupId", requireRole("admin"), deleteVariantGroup);

export default router;
