import { Router } from 'express';
import {
  getRoads,
  getRoadById,
  createRoad,
  updateRoad,
  deleteRoad,
  getRoadsGeoJSON,
} from '../controllers/road.controller';
import { authenticateAdmin, optionalAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// Public/optional auth routes
router.get(
  '/geojson',
  optionalAuth,
  asyncHandler(getRoadsGeoJSON)
);

router.get(
  '/',
  optionalAuth,
  asyncHandler(getRoads)
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(getRoadById)
);

// Admin only routes
router.post(
  '/',
  authenticateAdmin,
  asyncHandler(createRoad)
);

router.put(
  '/:id',
  authenticateAdmin,
  asyncHandler(updateRoad)
);

router.delete(
  '/:id',
  authenticateAdmin,
  asyncHandler(deleteRoad)
);

export default router;
