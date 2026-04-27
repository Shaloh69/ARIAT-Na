import { Router } from "express";
import {
  calculateRouteByIntersections,
  calculateRouteByCoordinates,
  getNearestIntersection,
  recalculateRouteFromCurrent,
  checkOffCourse,
  calculateMultiModalRouteHandler,
  calculateCommuteRouteHandler,
} from "../controllers/route.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

/**
 * POST /routes/calculate
 * Calculate route between two intersections
 * Body: { start_intersection_id, end_intersection_id, optimize_for?: 'distance' | 'time' }
 */
router.post("/calculate", authenticate, calculateRouteByIntersections);

/**
 * POST /routes/calculate-gps
 * Calculate route between two GPS coordinates
 * Body: { start_lat, start_lon, end_lat, end_lon, optimize_for?: 'distance' | 'time' }
 */
router.post("/calculate-gps", authenticate, calculateRouteByCoordinates);

/**
 * POST /routes/recalculate
 * Recalculate route from current position (for off-course scenarios)
 * Body: { current_lat, current_lon, destination_lat, destination_lon, optimize_for?, threshold? }
 */
router.post("/recalculate", authenticate, recalculateRouteFromCurrent);

/**
 * POST /routes/check-off-course
 * Check if user is off the planned route
 * Body: { current_lat, current_lon, planned_path, planned_roads, threshold? }
 */
router.post("/check-off-course", authenticate, checkOffCourse);

/**
 * POST /routes/calculate-multimodal
 * Calculate multi-modal route (bus commute, taxi, ferry, walk, etc.)
 * Body: { start_lat, start_lon, end_lat, end_lon, transport_mode, optimize_for? }
 */
router.post(
  "/calculate-multimodal",
  authenticate,
  calculateMultiModalRouteHandler,
);

/**
 * POST /routes/calculate-commute
 * Build a multi-leg commute route.
 * Body: { start_lat, start_lon, end_lat, end_lon, sub_mode?: 'saver'|'metered_taxi'|'grab'|'maxim' }
 */
router.post("/calculate-commute", authenticate, calculateCommuteRouteHandler);

/**
 * GET /routes/nearest
 * Find nearest intersection to GPS coordinates
 * Query: latitude, longitude
 */
router.get("/nearest", getNearestIntersection);

export default router;
