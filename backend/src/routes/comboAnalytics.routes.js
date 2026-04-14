import { Router } from "express";
import { getTopCombos, observeCombo } from "../controllers/comboAnalytics.controller.js";

const router = Router();

router.get("/combos", getTopCombos);
router.post("/combos/observe", observeCombo);

export default router;