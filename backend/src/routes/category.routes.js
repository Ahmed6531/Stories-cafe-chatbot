import express from "express";
import { authorize } from "../middleware/auth.js";
import { protect } from "../middleware/protect.js";
import {
  renameCategory,
  deleteCategory,
} from "../controllers/category.controller.js";

const router = express.Router();

router.patch( "/", protect, authorize("admin"), renameCategory);

router.delete("/:name", protect, authorize("admin"), deleteCategory);

export default router;