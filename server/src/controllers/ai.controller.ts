/**
 * AI Itinerary Controller
 * Handles generation, saving, and retrieval of AI-generated itineraries.
 * Supports both single-day and multi-day Cebu Region planning.
 */

import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, AppError } from '../types';
import { pool } from '../config/database';
import { rankDestinations } from '../services/recommendation.service';
import { buildItinerary, buildMultiDayItinerary } from '../services/itinerary.service';

// =====================================================
// POST /ai/itinerary/generate
// =====================================================
export const generateItinerary = async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    start,
    available_hours,
    budget = 0,
    interests = [],
    max_stops = 4,
    optimize_for = 'time',
    // Multi-day params
    days = 1,
    hours_per_day,
    cluster_ids = [],
    group_type,
    trip_type,
    transport_mode,
  } = req.body;

  // Validate start
  if (!start || start.lat === undefined || start.lat === null || start.lon === undefined || start.lon === null) {
    throw new AppError('start.lat and start.lon are required', 400);
  }
  const startLat = parseFloat(start.lat);
  const startLon = parseFloat(start.lon);
  if (isNaN(startLat) || isNaN(startLon)) {
    throw new AppError('start.lat and start.lon must be valid numbers', 400);
  }

  // Validate days
  const numDays = Math.min(Math.max(parseInt(days, 10) || 1, 1), 7);

  // Validate hours
  const hoursPerDay = parseFloat(hours_per_day ?? available_hours);
  if (isNaN(hoursPerDay) || hoursPerDay < 0.5 || hoursPerDay > 24) {
    throw new AppError('available_hours or hours_per_day must be between 0.5 and 24', 400);
  }

  const maxStops = Math.min(Math.max(parseInt(max_stops, 10) || 4, 1), 10);
  const budgetNum = Math.max(parseFloat(budget) || 0, 0);

  if (!Array.isArray(interests)) throw new AppError('interests must be an array', 400);
  if (!['distance', 'time'].includes(optimize_for)) throw new AppError("optimize_for must be 'distance' or 'time'", 400);
  if (!Array.isArray(cluster_ids)) throw new AppError('cluster_ids must be an array', 400);

  // Score and rank destinations (with cluster + group filter)
  const ranked = await rankDestinations(
    startLat, startLon,
    interests as string[],
    budgetNum,
    maxStops * numDays * 3,    // larger candidate pool for multi-day
    cluster_ids.length > 0 ? cluster_ids as string[] : undefined,
    group_type as string | undefined
  );

  if (ranked.length === 0) {
    res.json({
      success: true,
      data: numDays > 1
        ? { days: [], totalDays: 0, totalStops: 0, totalDistance: 0, estimatedTravelTime: 0, estimatedVisitTime: 0, estimatedTotalTime: 0, estimatedCost: 0 }
        : { stops: [], legs: [], totalDistance: 0, estimatedTravelTime: 0, estimatedVisitTime: 0, estimatedTotalTime: 0, estimatedCost: 0 },
      message: 'No destinations found matching your criteria',
    });
    return;
  }

  if (numDays > 1) {
    const multiDay = await buildMultiDayItinerary(ranked, startLat, startLon, numDays, hoursPerDay, maxStops, optimize_for as 'distance' | 'time', transport_mode as string | undefined);
    res.json({ success: true, data: { ...multiDay, trip_type, transport_mode, group_type } });
  } else {
    const itinerary = await buildItinerary(ranked, startLat, startLon, hoursPerDay, maxStops, optimize_for as 'distance' | 'time', 600, transport_mode as string | undefined);
    res.json({ success: true, data: itinerary });
  }
};

// =====================================================
// POST /ai/itinerary/save
// =====================================================
export const saveItinerary = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) throw new AppError('Authentication required', 401);

  const {
    title,
    description,
    start_latitude,
    start_longitude,
    start_address,
    optimize_for = 'time',
    total_distance,
    estimated_time,
    estimated_cost,
    budget,
    stops = [],
    days_data = [],          // [{dayNumber, stops:[{destination:{id},visit_duration}]}]
    start_date,
    days = 1,
    cluster_ids,
    trip_type,
    transport_mode,
    group_type,
  } = req.body;

  if (!title?.trim()) throw new AppError('Itinerary title is required', 400);

  const flatStops: { destination_id: string; visit_duration: number | null; notes: string | null; day_number: number }[] = [];

  if (days_data && Array.isArray(days_data) && days_data.length > 0) {
    // Multi-day format
    for (const day of days_data as any[]) {
      const dayNum = day.dayNumber ?? day.day_number ?? 1;
      for (const s of (day.stops ?? day.itinerary?.stops ?? [])) {
        const destId = s.destination?.id || s.destination_id;
        if (destId) {
          flatStops.push({ destination_id: destId, visit_duration: s.visit_duration ?? null, notes: s.notes || null, day_number: dayNum });
        }
      }
    }
  } else if (Array.isArray(stops) && stops.length > 0) {
    for (const s of stops) {
      const destId = s.destination?.id || s.destination_id;
      if (destId) {
        flatStops.push({ destination_id: destId, visit_duration: s.visit_duration ?? null, notes: s.notes || null, day_number: 1 });
      }
    }
  }

  if (flatStops.length === 0) throw new AppError('stops must be a non-empty array', 400);

  const itineraryId = uuidv4();

  await pool.execute(
    `INSERT INTO itineraries
       (id, user_id, title, description, start_date,
        start_latitude, start_longitude, start_address,
        optimize_for, total_distance, estimated_time, estimated_cost,
        days, cluster_ids, trip_type, transport_mode, group_type, budget,
        is_saved, is_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, FALSE)`,
    [
      itineraryId,
      req.user.id,
      title.trim(),
      description || null,
      start_date || null,
      start_latitude ?? null,
      start_longitude ?? null,
      start_address || null,
      optimize_for,
      total_distance ?? null,
      estimated_time ?? null,
      estimated_cost ?? null,
      Math.max(parseInt(days, 10) || 1, 1),
      cluster_ids ? JSON.stringify(cluster_ids) : null,
      trip_type || null,
      transport_mode || null,
      group_type || null,
      budget != null ? parseFloat(budget) || null : null,
    ]
  );

  for (let i = 0; i < flatStops.length; i++) {
    const s = flatStops[i];
    await pool.execute(
      `INSERT INTO itinerary_destinations
         (id, itinerary_id, day_number, destination_id, visit_order, planned_duration, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), itineraryId, s.day_number, s.destination_id, i + 1, s.visit_duration, s.notes]
    );
  }

  const [rows]: any = await pool.execute('SELECT * FROM itineraries WHERE id = ?', [itineraryId]);

  res.status(201).json({
    success: true,
    message: 'Itinerary saved successfully',
    data: { ...rows[0], cluster_ids: cluster_ids ?? [] },
  });
};

// =====================================================
// GET /ai/itinerary/saved
// =====================================================
export const getSavedItineraries = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) throw new AppError('Authentication required', 401);

  const [rows]: any = await pool.execute(
    `SELECT i.*, COUNT(id_dest.id) AS stop_count
     FROM itineraries i
     LEFT JOIN itinerary_destinations id_dest ON id_dest.itinerary_id = i.id
     WHERE i.user_id = ?
     GROUP BY i.id
     ORDER BY i.created_at DESC`,
    [req.user.id]
  );

  const parsed = rows.map((r: any) => ({
    ...r,
    cluster_ids: typeof r.cluster_ids === 'string' ? JSON.parse(r.cluster_ids) : (r.cluster_ids ?? []),
  }));

  res.json({ success: true, data: parsed });
};

// =====================================================
// GET /ai/itinerary/:id
// =====================================================
export const getSavedItineraryById = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) throw new AppError('Authentication required', 401);

  const { id } = req.params;

  const [itineraryRows]: any = await pool.execute(
    'SELECT * FROM itineraries WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );

  if (!itineraryRows?.length) throw new AppError('Itinerary not found', 404);

  const [destRows]: any = await pool.execute(
    `SELECT id_dest.*, d.name, d.description, d.latitude, d.longitude,
       d.address, d.entrance_fee_local, d.average_visit_duration,
       d.rating, d.images, d.municipality, d.budget_level,
       c.name AS category_name,
       cl.name AS cluster_name, cl.slug AS cluster_slug
     FROM itinerary_destinations id_dest
     JOIN destinations d ON id_dest.destination_id = d.id
     JOIN categories c ON d.category_id = c.id
     LEFT JOIN clusters cl ON d.cluster_id = cl.id
     WHERE id_dest.itinerary_id = ?
     ORDER BY id_dest.day_number ASC, id_dest.visit_order ASC`,
    [id]
  );

  const header = itineraryRows[0];
  const cluster_ids = typeof header.cluster_ids === 'string'
    ? JSON.parse(header.cluster_ids)
    : (header.cluster_ids ?? []);

  // Group stops by day
  const dayMap = new Map<number, any[]>();
  for (const row of destRows) {
    const day = row.day_number ?? 1;
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(row);
  }

  const days_data = Array.from(dayMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dayNumber, stops]) => ({ dayNumber, stops }));

  res.json({
    success: true,
    data: {
      ...header,
      cluster_ids,
      stops: destRows,
      days_data,
    },
  });
};

// =====================================================
// DELETE /ai/itinerary/:id
// =====================================================
export const deleteItinerary = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) throw new AppError('Authentication required', 401);

  const { id } = req.params;

  const [rows]: any = await pool.execute(
    'SELECT id FROM itineraries WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );
  if (!rows?.length) throw new AppError('Itinerary not found', 404);

  await pool.execute('DELETE FROM itineraries WHERE id = ?', [id]);

  res.json({ success: true, message: 'Itinerary deleted' });
};
