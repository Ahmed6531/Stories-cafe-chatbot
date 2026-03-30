import express from "express";
import {
  getVariantGroups,
  createVariantGroup,
  updateVariantGroup,
  deleteVariantGroup,
} from "../controllers/variantGroup.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public — anyone can read variant groups (needed for order form)
router.get("/", getVariantGroups);

// Admin-only mutations
router.post("/", authenticate, authorize("admin"), createVariantGroup);
router.patch("/:groupId", authenticate, authorize("admin"), updateVariantGroup);
router.delete("/:groupId", authenticate, authorize("admin"), deleteVariantGroup);

export default router;
