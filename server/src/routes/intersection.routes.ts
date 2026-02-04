import { Router } from 'express';
import {
  getIntersections,
  getIntersectionById,
  createIntersection,
  updateIntersection,
  deleteIntersection,
  getIntersectionsGeoJSON,
} from '../controllers/intersection.controller';
import { authenticateAdmin, optionalAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// Public/optional auth routes
router.get(
  '/geojson',
  optionalAuth,
  asyncHandler(getIntersectionsGeoJSON)
);

router.get(
  '/',
  optionalAuth,
  asyncHandler(getIntersections)
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(getIntersectionById)
);

// Admin only routes
router.post(
  '/',
  authenticateAdmin,
  asyncHandler(createIntersection)
);

router.put(
  '/:id',
  authenticateAdmin,
  asyncHandler(updateIntersection)
);

router.delete(
  '/:id',
  authenticateAdmin,
  asyncHandler(deleteIntersection)
);

export default router;
