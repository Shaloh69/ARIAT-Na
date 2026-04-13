import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  generateKioskItinerary,
  previewKioskSession,
  claimKioskSession,
  markScanSession,
  checkScanSession,
} from '../controllers/kiosk.controller';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * POST /kiosk/generate
 * Generate itinerary from kiosk — no auth required.
 * Body: { start_lat, start_lon, interests[], group_type, transport_mode, days, hours_per_day, budget, max_stops, cluster_ids[] }
 */
router.post('/generate', asyncHandler(generateKioskItinerary));

/**
 * GET /kiosk/preview/:token
 * Preview a kiosk session — no auth required.
 */
router.get('/preview/:token', asyncHandler(previewKioskSession));

/**
 * POST /kiosk/claim/:token
 * Claim a kiosk session (save to user account) — auth required.
 * Body: { title?: string, description?: string }
 */
router.post('/claim/:token', authenticate, asyncHandler(claimKioskSession));

/**
 * POST /kiosk/scan-ping/:session
 * Called by the download page when it loads — signals the kiosk the QR was scanned.
 */
router.post('/scan-ping/:session', markScanSession);

/**
 * GET /kiosk/scan-ping/:session
 * Polled by the kiosk to check whether the download QR was scanned.
 */
router.get('/scan-ping/:session', checkScanSession);

export default router;
