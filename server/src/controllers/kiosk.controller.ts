/**
 * Kiosk Controller
 * Handles kiosk itinerary generation and claim flow.
 *
 * Flow:
 *   1. Kiosk calls POST /kiosk/generate (no auth) → server generates itinerary,
 *      stores it in kiosk_sessions with a short token, returns token.
 *   2. QR code encodes: airatna://kiosk/<TOKEN>
 *   3. Flutter scans QR → GET /kiosk/preview/:token → shows itinerary preview.
 *   4. Flutter (after auth) calls POST /kiosk/claim/:token → itinerary saved to
 *      user account, session marked claimed.
 */

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, AppError } from "../types";
import { pool } from "../config/database";
import { rankDestinations } from "../services/recommendation.service";
import {
  buildItinerary,
  buildMultiDayItinerary,
} from "../services/itinerary.service";
import { RowDataPacket } from "mysql2";
import { logger } from "../utils/logger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a short, URL-safe token (8 uppercase alphanumeric chars). */
function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous I/O/0/1
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// ─── POST /kiosk/generate ────────────────────────────────────────────────────

/**
 * Generate an itinerary from the kiosk and store it as a session.
 * This endpoint is unauthenticated — kiosks don't have user accounts.
 *
 * Body: {
 *   start_lat, start_lon,       // kiosk GPS coordinates
 *   interests: string[],
 *   group_type: string,
 *   transport_mode: string,
 *   days: number,
 *   hours_per_day?: number,
 *   budget?: number,
 *   max_stops?: number,
 *   cluster_ids?: string[],
 * }
 */
export const generateKioskItinerary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    start_lat,
    start_lon,
    interests = [],
    group_type,
    transport_mode = "private_car",
    days = 1,
    hours_per_day = 8,
    budget = 0,
    max_stops = 4,
    cluster_ids = [],
    // Manual destination selection — if provided, skip AI ranking entirely
    pinned_destination_ids = [],
  } = req.body;

  // Validate start coords
  const startLat = parseFloat(start_lat ?? "10.3157"); // default: Cebu City
  const startLon = parseFloat(start_lon ?? "123.8854");
  if (isNaN(startLat) || isNaN(startLon)) {
    throw new AppError("start_lat and start_lon must be valid numbers", 400);
  }

  const numDays = Math.min(Math.max(parseInt(days, 10) || 1, 1), 7);
  const hoursPerDay = Math.min(Math.max(parseFloat(hours_per_day) || 8, 1), 16);
  const budgetNum = Math.max(parseFloat(budget) || 0, 0);
  const maxStops = Math.min(Math.max(parseInt(max_stops, 10) || 4, 1), 8);

  if (!Array.isArray(interests))
    throw new AppError("interests must be an array", 400);
  if (!Array.isArray(cluster_ids))
    throw new AppError("cluster_ids must be an array", 400);
  if (!Array.isArray(pinned_destination_ids))
    throw new AppError("pinned_destination_ids must be an array", 400);

  let ranked: import("../services/recommendation.service").ScoredDestination[];

  if (pinned_destination_ids.length > 0) {
    // ── Manual mode: user explicitly selected destinations ────────────────────
    // Fetch them in the order provided, preserving user's selection order.
    const ids = (pinned_destination_ids as string[]).filter(Boolean);
    const placeholders = ids.map(() => "?").join(",");
    const [pinnedRows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.*, c.name AS category_name, c.slug AS category_slug,
         cl.name AS cluster_name, cl.slug AS cluster_slug, cl.id AS cluster_id
       FROM destinations d
       JOIN categories c ON d.category_id = c.id
       LEFT JOIN clusters cl ON d.cluster_id = cl.id
       WHERE d.id IN (${placeholders}) AND d.is_active = TRUE`,
      ids,
    );
    // Re-order to match user selection order
    const rowMap = new Map((pinnedRows as any[]).map((r) => [r.id, r]));
    ranked = ids
      .filter((id) => rowMap.has(id))
      .map((id) => ({
        destination: rowMap.get(id)!,
        score: 999,
        reason: "Selected by user",
      }));
  } else {
    // ── AI mode: rank by interests, budget, distance ──────────────────────────
    ranked = await rankDestinations(
      startLat,
      startLon,
      interests as string[],
      budgetNum,
      maxStops * numDays * 3,
      cluster_ids.length > 0 ? (cluster_ids as string[]) : undefined,
      group_type as string | undefined,
    );

    // If the selected regions yielded nothing (e.g. empty clusters), fall back
    // to a region-unfiltered search so the kiosk never hard-errors on this.
    if (ranked.length === 0 && cluster_ids.length > 0) {
      logger.warn(
        `[KIOSK] cluster_ids ${JSON.stringify(cluster_ids)} returned 0 destinations — falling back to all regions`,
      );
      ranked = await rankDestinations(
        startLat,
        startLon,
        interests as string[],
        budgetNum,
        maxStops * numDays * 3,
        undefined,
        group_type as string | undefined,
      );
    }
  }

  if (ranked.length === 0) {
    throw new AppError(
      "No destinations found matching your preferences. Please try different interests or regions.",
      404,
    );
  }

  // Build itinerary
  let itineraryData: object;
  if (numDays > 1) {
    itineraryData = await buildMultiDayItinerary(
      ranked,
      startLat,
      startLon,
      numDays,
      hoursPerDay,
      maxStops,
      "time",
      transport_mode as string,
    );
  } else {
    itineraryData = await buildItinerary(
      ranked,
      startLat,
      startLon,
      hoursPerDay,
      maxStops,
      "time" as const,
      600,
      transport_mode as string,
    );
  }

  // Generate token, store session
  let token = generateToken();
  let attempts = 0;
  // Retry on (unlikely) collision
  while (attempts < 5) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await pool.execute(
        `INSERT INTO kiosk_sessions (id, token, itinerary_data, days, transport_mode, is_claimed, expires_at)
         VALUES (?, ?, ?, ?, ?, FALSE, ?)`,
        [
          uuidv4(),
          token,
          JSON.stringify(itineraryData),
          numDays,
          transport_mode,
          expiresAt,
        ],
      );
      break;
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        token = generateToken();
        attempts++;
      } else {
        throw err;
      }
    }
  }

  // Build a friendly title
  const totalStops =
    numDays > 1
      ? ((itineraryData as any).days ?? []).reduce(
          (s: number, d: any) => s + (d.itinerary?.stops?.length ?? 0),
          0,
        )
      : ((itineraryData as any).stops?.length ?? 0);
  const title = `${numDays}-Day Cebu ${numDays > 1 ? "Adventure" : "Day Trip"} — ${totalStops} Stop${totalStops !== 1 ? "s" : ""}`;

  res.json({
    success: true,
    data: {
      token,
      title,
      days: numDays,
      transport_mode,
      total_stops: totalStops,
      deep_link: `airatna://kiosk/${token}`,
      itinerary: itineraryData,
    },
  });
};

// ─── GET /kiosk/preview/:token ───────────────────────────────────────────────

/**
 * Preview a kiosk session itinerary by token (no auth required).
 * Used by the Flutter app before claiming (so the user can see what they're getting).
 */
export const previewKioskSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.params;
  if (!token) throw new AppError("Token is required", 400);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT token, itinerary_data, days, transport_mode, is_claimed, expires_at, created_at
     FROM kiosk_sessions
     WHERE token = ? AND expires_at > NOW()`,
    [token.toUpperCase()],
  );

  if ((rows as any[]).length === 0) {
    throw new AppError(
      "Session not found or expired. Please generate a new QR at the kiosk.",
      404,
    );
  }

  const session = (rows as any[])[0];
  let itinerary: object;
  try {
    itinerary =
      typeof session.itinerary_data === "string"
        ? JSON.parse(session.itinerary_data)
        : session.itinerary_data;
  } catch {
    throw new AppError("Itinerary data is corrupted", 500);
  }

  res.json({
    success: true,
    data: {
      token: session.token,
      days: session.days,
      transport_mode: session.transport_mode,
      is_claimed: session.is_claimed === 1 || session.is_claimed === true,
      expires_at: session.expires_at,
      created_at: session.created_at,
      itinerary,
    },
  });
};

// ─── POST /kiosk/claim/:token ─────────────────────────────────────────────────

/**
 * Claim a kiosk session — authenticated.
 * Saves the itinerary to the user's account and marks the session as claimed.
 *
 * Body: { title?: string, description?: string }
 */
export const claimKioskSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { token } = req.params;
  if (!token) throw new AppError("Token is required", 400);

  const userId = req.user?.id;
  if (!userId) throw new AppError("Authentication required", 401);

  // Fetch session
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, token, itinerary_data, days, transport_mode, is_claimed, expires_at
     FROM kiosk_sessions
     WHERE token = ? AND expires_at > NOW()`,
    [token.toUpperCase()],
  );

  if ((rows as any[]).length === 0) {
    throw new AppError(
      "Session not found or expired. Please scan a fresh QR code.",
      404,
    );
  }

  const session = (rows as any[])[0];

  if (session.is_claimed === 1 || session.is_claimed === true) {
    throw new AppError("This QR code has already been claimed.", 409);
  }

  let itinerary: any;
  try {
    itinerary =
      typeof session.itinerary_data === "string"
        ? JSON.parse(session.itinerary_data)
        : session.itinerary_data;
  } catch {
    throw new AppError("Itinerary data is corrupted", 500);
  }

  const { title: customTitle, description } = req.body;
  const numDays = session.days || 1;

  // Build title
  const totalStops =
    numDays > 1
      ? (itinerary.days ?? []).reduce(
          (s: number, d: any) => s + (d.itinerary?.stops?.length ?? 0),
          0,
        )
      : (itinerary.stops?.length ?? 0);
  const defaultTitle = `${numDays}-Day Cebu ${numDays > 1 ? "Adventure" : "Day Trip"} — ${totalStops} Stops`;
  const itineraryTitle = customTitle?.trim() || defaultTitle;

  // Save itinerary (mirrors ai.controller saveItinerary logic)
  const itineraryId = uuidv4();

  // Insert itinerary record
  await pool.execute(
    `INSERT INTO itineraries
       (id, user_id, title, description, total_distance, estimated_time, estimated_cost, days, transport_mode, is_saved, is_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, FALSE)`,
    [
      itineraryId,
      userId,
      itineraryTitle,
      `Kiosk-generated ${numDays}-day itinerary`,
      numDays > 1
        ? (itinerary.days ?? []).reduce(
            (s: number, d: any) => s + (d.itinerary?.totalDistance ?? 0),
            0,
          )
        : (itinerary.totalDistance ?? 0),
      numDays > 1
        ? (itinerary.days ?? []).reduce(
            (s: number, d: any) => s + (d.itinerary?.estimatedTotalTime ?? 0),
            0,
          )
        : (itinerary.estimatedTotalTime ?? 0),
      numDays > 1
        ? (itinerary.days ?? []).reduce(
            (s: number, d: any) => s + (d.itinerary?.estimatedCost ?? 0),
            0,
          )
        : (itinerary.estimatedCost ?? 0),
      numDays,
      session.transport_mode,
    ],
  );

  // Insert itinerary destinations
  type StopRow = {
    destination?: any;
    visit_duration?: number;
    cumulative_time?: number;
    leg_distance?: number;
    leg_travel_time?: number;
  };
  const insertStop = async (
    stop: StopRow,
    dayNumber: number,
    visitOrder: number,
  ) => {
    if (!stop.destination?.id) return;
    await pool.execute(
      `INSERT INTO itinerary_destinations
         (id, itinerary_id, destination_id, visit_order, planned_duration, cumulative_time, day_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        itineraryId,
        stop.destination.id,
        visitOrder,
        stop.visit_duration ?? 60,
        stop.cumulative_time ?? 0,
        dayNumber,
      ],
    );
  };

  if (numDays > 1) {
    let globalOrder = 0;
    for (const dayPlan of itinerary.days ?? []) {
      const dayNumber = dayPlan.dayNumber ?? 1;
      for (const stop of dayPlan.itinerary?.stops ?? []) {
        await insertStop(stop, dayNumber, globalOrder++);
      }
    }
  } else {
    let order = 0;
    for (const stop of itinerary.stops ?? []) {
      await insertStop(stop, 1, order++);
    }
  }

  // Mark session as claimed
  await pool.execute(
    "UPDATE kiosk_sessions SET is_claimed = TRUE, claimed_by = ?, claimed_at = NOW() WHERE token = ?",
    [userId, token.toUpperCase()],
  );

  logger.info(
    `[KIOSK] Session ${token} claimed by user ${userId} → itinerary ${itineraryId}`,
  );

  res.status(201).json({
    success: true,
    data: {
      itinerary_id: itineraryId,
      title: itineraryTitle,
      days: numDays,
      total_stops: totalStops,
    },
  });
};

// ─── Scan-ping (app download QR detection) ───────────────────────────────────

/**
 * In-memory store for download QR scan sessions.
 * Key: session UUID  |  Value: { scanned, createdAt }
 * Sessions auto-expire after 10 minutes via the cleanup interval.
 */
const scanSessions = new Map<string, { scanned: boolean; createdAt: number }>();

// Prune stale sessions every 5 minutes
setInterval(
  () => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, s] of scanSessions.entries()) {
      if (s.createdAt < cutoff) scanSessions.delete(id);
    }
  },
  5 * 60 * 1000,
);

/**
 * POST /kiosk/scan-ping/:session
 * Called by the download page (on a user's phone) the moment it loads.
 * Marks the session as scanned so the kiosk can react.
 */
export const markScanSession = (req: Request, res: Response): void => {
  const { session } = req.params;
  if (!session || session.length > 64) {
    res.status(400).json({ success: false, error: "Invalid session" });
    return;
  }
  scanSessions.set(session, { scanned: true, createdAt: Date.now() });
  res.json({ success: true });
};

/**
 * GET /kiosk/scan-ping/:session
 * Polled by the kiosk every ~2 seconds to detect when the QR was scanned.
 */
export const checkScanSession = (req: Request, res: Response): void => {
  const { session } = req.params;
  const entry = scanSessions.get(session ?? "");
  res.json({ success: true, scanned: entry?.scanned ?? false });
};
