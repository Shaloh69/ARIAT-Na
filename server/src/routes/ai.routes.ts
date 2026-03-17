import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  generateItinerary,
  saveItinerary,
  getSavedItineraries,
  getSavedItineraryById,
  deleteItinerary,
} from '../controllers/ai.controller';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * POST /ai/itinerary/generate
 * Generate an AI itinerary from user constraints.
 * Body: { start: {lat, lon}, available_hours, budget, interests[], max_stops, optimize_for }
 */
router.post('/itinerary/generate', authenticate, asyncHandler(generateItinerary));

/**
 * POST /ai/itinerary/save
 * Persist a generated itinerary to the database.
 * Body: { title, description?, stops[], total_distance, estimated_time, estimated_cost, ... }
 */
router.post('/itinerary/save', authenticate, asyncHandler(saveItinerary));

/**
 * GET /ai/itinerary/saved
 * List all saved itineraries for the authenticated user.
 */
router.get('/itinerary/saved', authenticate, asyncHandler(getSavedItineraries));

/**
 * GET /ai/itinerary/:id
 * Get a specific saved itinerary with full destination details.
 */
router.get('/itinerary/:id', authenticate, asyncHandler(getSavedItineraryById));

/**
 * DELETE /ai/itinerary/:id
 * Delete a saved itinerary (must belong to the authenticated user).
 */
router.delete('/itinerary/:id', authenticate, asyncHandler(deleteItinerary));

export default router;
