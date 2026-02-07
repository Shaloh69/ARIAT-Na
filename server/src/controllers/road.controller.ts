import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import { AuthRequest, AppError } from '../types';
import { pool } from '../config/database';

/**
 * Safely parse a MySQL JSON column value.
 * MySQL JSON columns may return already-parsed objects via mysql2 driver,
 * or strings that still need parsing. This handles both cases.
 */
function safeJsonParse(value: any, fallback: any = null): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value; // Already parsed by mysql2
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Ensure a value is a proper array for path data.
 * Handles strings, already-parsed arrays, and edge cases.
 */
function ensurePathArray(value: any): [number, number][] {
  const parsed = safeJsonParse(value, []);
  if (Array.isArray(parsed)) return parsed;
  return [];
}

/**
 * Get all roads
 * GET /api/v1/roads
 */
export const getRoads = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { active = 'true', type } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  if (active === 'true') {
    conditions.push('is_active = ?');
    params.push(true);
  }

  if (type) {
    conditions.push('road_type = ?');
    params.push(type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      r.*,
      si.name as start_intersection_name,
      ei.name as end_intersection_name
    FROM roads r
    LEFT JOIN intersections si ON r.start_intersection_id = si.id
    LEFT JOIN intersections ei ON r.end_intersection_id = ei.id
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  const [roads]: any = await pool.execute(sql, params);

  const formattedRoads = roads.map((road: any) => ({
    ...road,
    path: ensurePathArray(road.path),
  }));

  res.json({
    success: true,
    data: formattedRoads,
  });
};

/**
 * Get single road by ID
 * GET /api/v1/roads/:id
 */
export const getRoadById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const sql = `
    SELECT
      r.*,
      si.name as start_intersection_name,
      si.latitude as start_latitude,
      si.longitude as start_longitude,
      ei.name as end_intersection_name,
      ei.latitude as end_latitude,
      ei.longitude as end_longitude
    FROM roads r
    LEFT JOIN intersections si ON r.start_intersection_id = si.id
    LEFT JOIN intersections ei ON r.end_intersection_id = ei.id
    WHERE r.id = ?
  `;

  const [roads]: any = await pool.execute(sql, [id]);

  if (roads.length === 0) {
    throw new AppError('Road not found', 404);
  }

  const road = roads[0];

  res.json({
    success: true,
    data: {
      ...road,
      path: ensurePathArray(road.path),
    },
  });
};

/**
 * Create new road (Admin only)
 * POST /api/v1/roads
 */
export const createRoad = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const {
    name,
    description,
    start_intersection_id,
    end_intersection_id,
    road_type = 'local_road',
    is_bidirectional = true,
  } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    throw new AppError('Road name is required', 400);
  }
  if (!start_intersection_id) {
    throw new AppError('Start intersection ID is required', 400);
  }
  if (!end_intersection_id) {
    throw new AppError('End intersection ID is required', 400);
  }

  // Handle path - could arrive as string or array
  let path = req.body.path;
  if (typeof path === 'string') {
    try {
      path = JSON.parse(path);
    } catch {
      throw new AppError('Invalid path format — must be a JSON array of [lat, lng] pairs', 400);
    }
  }

  if (!Array.isArray(path) || path.length < 2) {
    throw new AppError('Road path must have at least 2 points', 400);
  }

  // Validate road_type
  const validRoadTypes = ['highway', 'main_road', 'local_road'];
  if (!validRoadTypes.includes(road_type)) {
    throw new AppError(`Invalid road type. Must be one of: ${validRoadTypes.join(', ')}`, 400);
  }

  // Calculate distance using turf.js
  const line = turf.lineString(path.map((p: [number, number]) => [p[1], p[0]])); // [lng, lat]
  const distance = turf.length(line, { units: 'kilometers' });

  // Estimate time based on road type (rough estimates)
  const speedMap: Record<string, number> = {
    highway: 80, // km/h
    main_road: 50,
    local_road: 30,
  };
  const speed = speedMap[road_type] || 30;
  const estimated_time = Math.round((distance / speed) * 60); // minutes

  const roadId = uuidv4();

  const sql = `
    INSERT INTO roads (
      id, name, description, start_intersection_id, end_intersection_id,
      road_type, distance, estimated_time, path, is_active, is_bidirectional
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    roadId,
    name.trim(),
    description || null,
    start_intersection_id,
    end_intersection_id,
    road_type,
    distance.toFixed(2),
    estimated_time,
    JSON.stringify(path),
    true,
    is_bidirectional,
  ]);

  const [roads]: any = await pool.execute('SELECT * FROM roads WHERE id = ?', [roadId]);

  res.status(201).json({
    success: true,
    message: 'Road created successfully',
    data: {
      ...roads[0],
      path: ensurePathArray(roads[0].path),
    },
  });
};

/**
 * Update road (Admin only)
 * PUT /api/v1/roads/:id
 */
export const updateRoad = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  // Check if road exists
  const [existing]: any = await pool.execute('SELECT id FROM roads WHERE id = ?', [id]);

  if (existing.length === 0) {
    throw new AppError('Road not found', 404);
  }

  // Build dynamic update query
  const allowedFields = [
    'name',
    'description',
    'road_type',
    'is_active',
    'is_bidirectional',
  ];

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  Object.keys(updates).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(updates[key]);
    } else if (key === 'path') {
      // Handle path — could arrive as string or array
      let pathData = updates.path;
      if (typeof pathData === 'string') {
        try { pathData = JSON.parse(pathData); } catch { return; }
      }
      if (!Array.isArray(pathData) || pathData.length < 2) return;

      updateFields.push('path = ?');
      updateValues.push(JSON.stringify(pathData));

      // Recalculate distance and time if path changes
      const line = turf.lineString(pathData.map((p: [number, number]) => [p[1], p[0]]));
      const distance = turf.length(line, { units: 'kilometers' });

      const roadType = updates.road_type || 'local_road';
      const speedMap: Record<string, number> = {
        highway: 80,
        main_road: 50,
        local_road: 30,
      };
      const speed = speedMap[roadType] || 30;
      const estimatedTime = Math.round((distance / speed) * 60);

      updateFields.push('distance = ?', 'estimated_time = ?');
      updateValues.push(distance.toFixed(2), estimatedTime);
    }
  });

  if (updateFields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const sql = `
    UPDATE roads
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = ?
  `;

  await pool.execute(sql, [...updateValues, id]);

  const [roads]: any = await pool.execute('SELECT * FROM roads WHERE id = ?', [id]);

  res.json({
    success: true,
    message: 'Road updated successfully',
    data: {
      ...roads[0],
      path: ensurePathArray(roads[0].path),
    },
  });
};

/**
 * Delete road (Admin only)
 * DELETE /api/v1/roads/:id
 */
export const deleteRoad = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const [result]: any = await pool.execute('DELETE FROM roads WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    throw new AppError('Road not found', 404);
  }

  res.json({
    success: true,
    message: 'Road deleted successfully',
  });
};

/**
 * Get roads as GeoJSON
 * GET /api/v1/roads/geojson
 */
export const getRoadsGeoJSON = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const sql = 'SELECT * FROM roads WHERE is_active = ? ORDER BY created_at DESC';
  const [roads]: any = await pool.execute(sql, [true]);

  const features = roads.map((road: any, index: number) => ({
    type: 'Feature',
    properties: {
      id: road.id,
      name: road.name,
      road_type: road.road_type,
      distance: road.distance,
      estimated_time: road.estimated_time,
    },
    geometry: {
      type: 'LineString',
      coordinates: ensurePathArray(road.path).map((p: [number, number]) => [p[1], p[0]]), // [lng, lat]
    },
    id: index + 1,
  }));

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  res.json(geojson);
};
