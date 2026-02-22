import { Router } from "express";
import { getMenu, getMenuItem } from "../controllers/menu.controller.js";

const router = Router();

router.get("/", getMenu);
router.get("/:id", getMenuItem);

export default router;
