import { Router } from 'express';
import {
  calculateRouteByIntersections,
  calculateRouteByCoordinates,
  getNearestIntersection,
} from '../controllers/route.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /routes/calculate
 * Calculate route between two intersections
 * Body: { start_intersection_id, end_intersection_id, optimize_for?: 'distance' | 'time' }
 */
router.post('/calculate', authenticate, calculateRouteByIntersections);

/**
 * POST /routes/calculate-gps
 * Calculate route between two GPS coordinates
 * Body: { start_lat, start_lon, end_lat, end_lon, optimize_for?: 'distance' | 'time' }
 */
router.post('/calculate-gps', authenticate, calculateRouteByCoordinates);

/**
 * GET /routes/nearest
 * Find nearest intersection to GPS coordinates
 * Query: latitude, longitude
 */
router.get('/nearest', getNearestIntersection);

export default router;
