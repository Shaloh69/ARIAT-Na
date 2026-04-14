import { Router } from "express";
import { getClusters, getClusterById } from "../controllers/cluster.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = Router();
router.get("/", asyncHandler(getClusters));
router.get("/:id", asyncHandler(getClusterById));
export default router;
