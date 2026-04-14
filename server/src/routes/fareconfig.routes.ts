import { Router } from "express";
import {
  getFareConfigs,
  getFareConfigById,
  createFareConfig,
  updateFareConfig,
  deleteFareConfig,
} from "../controllers/fareconfig.controller";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";

const router = Router();

// Public read routes
router.get("/", asyncHandler(getFareConfigs));
router.get("/:id", asyncHandler(getFareConfigById));

// Admin only routes
router.post("/", authenticateAdmin, asyncHandler(createFareConfig));
router.put("/:id", authenticateAdmin, asyncHandler(updateFareConfig));
router.delete("/:id", authenticateAdmin, asyncHandler(deleteFareConfig));

export default router;
