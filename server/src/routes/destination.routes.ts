import { Router } from 'express';
import {
  getDestinations,
  getDestinationById,
  createDestination,
  updateDestination,
  deleteDestination,
  getFeaturedDestinations,
  getPopularDestinations,
  getDestinationsGeoJSON,
} from '../controllers/destination.controller';
import {
  createDestinationValidator,
  updateDestinationValidator,
  destinationIdValidator,
  paginationValidator,
  searchValidator,
} from '../utils/validators';
import { validate } from '../middleware/validation.middleware';
import { authenticateAdmin, optionalAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// Public routes (with optional auth for personalization)
router.get(
  '/',
  paginationValidator,
  searchValidator,
  validate,
  optionalAuth,
  asyncHandler(getDestinations)
);

router.get(
  '/geojson',
  optionalAuth,
  asyncHandler(getDestinationsGeoJSON)
);

router.get(
  '/featured',
  optionalAuth,
  asyncHandler(getFeaturedDestinations)
);

router.get(
  '/popular',
  optionalAuth,
  asyncHandler(getPopularDestinations)
);

router.get(
  '/:id',
  destinationIdValidator,
  validate,
  optionalAuth,
  asyncHandler(getDestinationById)
);

// Admin only routes
router.post(
  '/',
  authenticateAdmin,
  createDestinationValidator,
  validate,
  asyncHandler(createDestination)
);

router.put(
  '/:id',
  authenticateAdmin,
  updateDestinationValidator,
  validate,
  asyncHandler(updateDestination)
);

router.delete(
  '/:id',
  authenticateAdmin,
  destinationIdValidator,
  validate,
  asyncHandler(deleteDestination)
);

export default router;
