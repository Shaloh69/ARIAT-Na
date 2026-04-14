import { Router } from "express";
import { authenticateAdmin } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  listUsers,
  getActiveUsers,
  deleteUser,
} from "../controllers/admin-users.controller";

const router = Router();

router.use(authenticateAdmin);

router.get("/", asyncHandler(listUsers));
router.get("/active", asyncHandler(getActiveUsers));
router.delete("/:id", asyncHandler(deleteUser));

export default router;
