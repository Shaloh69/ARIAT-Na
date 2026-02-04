import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, AppError } from '../types';
import { pool } from '../config/database';

/**
 * Get all intersections
 * GET /api/v1/intersections
 */
export const getIntersections = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { active = 'true', type } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  if (active !== 'all') {
    // For intersections, we don't have is_active, so we just return all
  }

  if (type) {
    conditions.push('point_type = ?');
    params.push(type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT * FROM intersections
    ${whereClause}
    ORDER BY created_at DESC
  `;

  const [intersections]: any = await pool.execute(sql, params);

  res.json({
    success: true,
    data: intersections,
  });
};

/**
 * Get single intersection by ID
 * GET /api/v1/intersections/:id
 */
export const getIntersectionById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const [intersections]: any = await pool.execute(
    'SELECT * FROM intersections WHERE id = ?',
    [id]
  );

  if (intersections.length === 0) {
    throw new AppError('Intersection not found', 404);
  }

  res.json({
    success: true,
    data: intersections[0],
  });
};

/**
 * Create new intersection (Admin only)
 * POST /api/v1/intersections
 */
export const createIntersection = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const {
    name,
    latitude,
    longitude,
    point_type = 'intersection',
    address,
    destination_id,
  } = req.body;

  const intersectionId = uuidv4();
  const isDestination = point_type === 'tourist_spot';

  const sql = `
    INSERT INTO intersections (
      id, name, latitude, longitude, is_destination,
      destination_id, address, point_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    intersectionId,
    name,
    latitude,
    longitude,
    isDestination,
    destination_id || null,
    address || null,
    point_type,
  ]);

  const [intersections]: any = await pool.execute(
    'SELECT * FROM intersections WHERE id = ?',
    [intersectionId]
  );

  res.status(201).json({
    success: true,
    message: 'Intersection created successfully',
    data: intersections[0],
  });
};

/**
 * Update intersection (Admin only)
 * PUT /api/v1/intersections/:id
 */
export const updateIntersection = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  // Check if intersection exists
  const [existing]: any = await pool.execute(
    'SELECT id FROM intersections WHERE id = ?',
    [id]
  );

  if (existing.length === 0) {
    throw new AppError('Intersection not found', 404);
  }

  // Build dynamic update query
  const allowedFields = [
    'name',
    'latitude',
    'longitude',
    'is_destination',
    'destination_id',
    'address',
    'point_type',
  ];

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  Object.keys(updates).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(updates[key]);
    }
  });

  if (updateFields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const sql = `
    UPDATE intersections
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = ?
  `;

  await pool.execute(sql, [...updateValues, id]);

  const [intersections]: any = await pool.execute(
    'SELECT * FROM intersections WHERE id = ?',
    [id]
  );

  res.json({
    success: true,
    message: 'Intersection updated successfully',
    data: intersections[0],
  });
};

/**
 * Delete intersection (Admin only)
 * DELETE /api/v1/intersections/:id
 */
export const deleteIntersection = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const [result]: any = await pool.execute(
    'DELETE FROM intersections WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Intersection not found', 404);
  }

  res.json({
    success: true,
    message: 'Intersection deleted successfully',
  });
};

/**
 * Get intersections as GeoJSON
 * GET /api/v1/intersections/geojson
 */
export const getIntersectionsGeoJSON = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const sql = 'SELECT * FROM intersections ORDER BY created_at DESC';
  const [intersections]: any = await pool.execute(sql);

  const features = intersections.map((intersection: any, index: number) => ({
    type: 'Feature',
    properties: {
      name: intersection.name,
      id: intersection.id,
      isDestination: intersection.is_destination,
      point_type: intersection.point_type || 'intersection',
      address: intersection.address,
    },
    geometry: {
      type: 'Point',
      coordinates: [intersection.longitude, intersection.latitude],
    },
    id: index + 1,
  }));

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  res.json(geojson);
};
