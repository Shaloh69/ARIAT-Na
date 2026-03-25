import { Router } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticateAdmin } from '../middleware/auth.middleware';
import {
  getTransitStops,
  createTransitStop,
  updateTransitStop,
  deleteTransitStop,
  getTransitRoutes,
  getTransitRouteById,
  createTransitRoute,
  updateTransitRoute,
  deleteTransitRoute,
} from '../controllers/transit.controller';

const router = Router();

// ── Transit Stops ─────────────────────────────────────────────
router.get('/stops',          asyncHandler(getTransitStops));
router.post('/stops',         authenticateAdmin,asyncHandler(createTransitStop));
router.put('/stops/:id',      authenticateAdmin,asyncHandler(updateTransitStop));
router.delete('/stops/:id',   authenticateAdmin,asyncHandler(deleteTransitStop));

// ── Transit Routes ────────────────────────────────────────────
router.get('/routes',         asyncHandler(getTransitRoutes));
router.get('/routes/:id',     asyncHandler(getTransitRouteById));
router.post('/routes',        authenticateAdmin,asyncHandler(createTransitRoute));
router.put('/routes/:id',     authenticateAdmin,asyncHandler(updateTransitRoute));
router.delete('/routes/:id',  authenticateAdmin,asyncHandler(deleteTransitRoute));

export default router;
