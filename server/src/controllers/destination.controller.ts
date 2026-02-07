import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, AppError, Destination } from '../types';
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
 * Format a destination row from DB, safely handling JSON columns.
 */
function formatDestination(dest: any) {
  return {
    ...dest,
    images: safeJsonParse(dest.images, []),
    operating_hours: safeJsonParse(dest.operating_hours, null),
    amenities: safeJsonParse(dest.amenities, []),
  };
}

/**
 * Get all destinations (with filters and pagination)
 * GET /api/v1/destinations
 */
export const getDestinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const {
    page = 1,
    limit = 20,
    category,
    featured,
    minRating,
    q,
    active = 'true',
  } = req.query;

  const offset = (Number(page) - 1) * Number(limit);
  const conditions: string[] = [];
  const params: any[] = [];

  // Build WHERE clause
  if (active === 'true') {
    conditions.push('d.is_active = ?');
    params.push(true);
  }

  if (category) {
    conditions.push('d.category_id = ?');
    params.push(category);
  }

  if (featured === 'true') {
    conditions.push('d.is_featured = ?');
    params.push(true);
  }

  if (minRating) {
    conditions.push('d.rating >= ?');
    params.push(Number(minRating));
  }

  if (q) {
    conditions.push('MATCH(d.name, d.description, d.address) AGAINST(?)');
    params.push(q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM destinations d
    ${whereClause}
  `;
  const [countResult]: any = await pool.execute(countSql, params);
  const total = countResult[0].total;

  // Get destinations with category info
  const sql = `
    SELECT
      d.*,
      c.name as category_name,
      c.slug as category_slug
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.id
    ${whereClause}
    ORDER BY d.popularity_score DESC, d.rating DESC
    LIMIT ? OFFSET ?
  `;

  const [destinations]: any = await pool.execute(sql, [...params, Number(limit), offset]);

  const formattedDestinations = destinations.map(formatDestination);

  res.json({
    success: true,
    data: formattedDestinations,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
};

/**
 * Get single destination by ID
 * GET /api/v1/destinations/:id
 */
export const getDestinationById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const sql = `
    SELECT
      d.*,
      c.name as category_name,
      c.slug as category_slug
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.id
    WHERE d.id = ?
  `;

  const [destinations]: any = await pool.execute(sql, [id]);

  if (destinations.length === 0) {
    throw new AppError('Destination not found', 404);
  }

  const destination = destinations[0];

  res.json({
    success: true,
    data: formatDestination(destination),
  });
};

/**
 * Create new destination (Admin only)
 * POST /api/v1/destinations
 */
export const createDestination = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const {
    name,
    description,
    category_id,
    latitude,
    longitude,
    address,
    operating_hours,
    entrance_fee_local = 0,
    entrance_fee_foreign = 0,
    average_visit_duration = 120,
    best_time_to_visit,
    is_featured = false,
  } = req.body;

  // Validate required fields
  if (!name || !String(name).trim()) {
    throw new AppError('Destination name is required', 400);
  }
  if (!category_id) {
    throw new AppError('Category ID is required', 400);
  }
  if (latitude === undefined || longitude === undefined) {
    throw new AppError('Latitude and longitude are required', 400);
  }

  // Handle images/amenities — could arrive as string or array
  let images = req.body.images;
  if (typeof images === 'string') {
    try { images = JSON.parse(images); } catch { images = null; }
  }

  let amenities = req.body.amenities;
  if (typeof amenities === 'string') {
    try { amenities = JSON.parse(amenities); } catch { amenities = null; }
  }

  const destinationId = uuidv4();

  const sql = `
    INSERT INTO destinations (
      id, name, description, category_id, latitude, longitude,
      address, images, operating_hours, entrance_fee_local,
      entrance_fee_foreign, average_visit_duration, best_time_to_visit,
      amenities, is_active, is_featured
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await pool.execute(sql, [
      destinationId,
      String(name).trim(),
      description || null,
      category_id,
      Number(latitude),
      Number(longitude),
      address || null,
      images ? JSON.stringify(images) : null,
      operating_hours ? JSON.stringify(operating_hours) : null,
      Number(entrance_fee_local) || 0,
      Number(entrance_fee_foreign) || 0,
      Number(average_visit_duration) || 120,
      best_time_to_visit || null,
      amenities ? JSON.stringify(amenities) : null,
      true,
      is_featured,
    ]);
  } catch (dbError: any) {
    if (dbError.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new AppError('Invalid category — the selected category does not exist', 400);
    }
    throw dbError;
  }

  // Fetch created destination
  const [destinations]: any = await pool.execute(
    'SELECT * FROM destinations WHERE id = ?',
    [destinationId]
  );

  res.status(201).json({
    success: true,
    message: 'Destination created successfully',
    data: formatDestination(destinations[0]),
  });
};

/**
 * Update destination (Admin only)
 * PUT /api/v1/destinations/:id
 */
export const updateDestination = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  // Check if destination exists
  const [existing]: any = await pool.execute(
    'SELECT id FROM destinations WHERE id = ?',
    [id]
  );

  if (existing.length === 0) {
    throw new AppError('Destination not found', 404);
  }

  // Build dynamic update query
  const allowedFields = [
    'name',
    'description',
    'category_id',
    'latitude',
    'longitude',
    'address',
    'entrance_fee_local',
    'entrance_fee_foreign',
    'average_visit_duration',
    'best_time_to_visit',
    'is_active',
    'is_featured',
  ];

  const jsonFields = ['images', 'operating_hours', 'amenities'];

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  Object.keys(updates).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(updates[key]);
    } else if (jsonFields.includes(key)) {
      // Handle values that may already be strings or arrays
      let val = updates[key];
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch { /* keep as-is */ }
      }
      updateFields.push(`${key} = ?`);
      updateValues.push(val ? JSON.stringify(val) : null);
    }
  });

  if (updateFields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const sql = `
    UPDATE destinations
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = ?
  `;

  await pool.execute(sql, [...updateValues, id]);

  // Fetch updated destination
  const [destinations]: any = await pool.execute(
    'SELECT * FROM destinations WHERE id = ?',
    [id]
  );

  const destination = destinations[0];

  res.json({
    success: true,
    message: 'Destination updated successfully',
    data: formatDestination(destination),
  });
};

/**
 * Delete destination (Admin only)
 * DELETE /api/v1/destinations/:id
 */
export const deleteDestination = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const [result]: any = await pool.execute(
    'DELETE FROM destinations WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Destination not found', 404);
  }

  res.json({
    success: true,
    message: 'Destination deleted successfully',
  });
};

/**
 * Get featured destinations
 * GET /api/v1/destinations/featured
 */
export const getFeaturedDestinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const sql = `
    SELECT
      d.*,
      c.name as category_name,
      c.slug as category_slug
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.id
    WHERE d.is_featured = ? AND d.is_active = ?
    ORDER BY d.popularity_score DESC
    LIMIT 10
  `;

  const [destinations]: any = await pool.execute(sql, [true, true]);

  res.json({
    success: true,
    data: destinations.map(formatDestination),
  });
};

/**
 * Get destinations as GeoJSON (for map display)
 * GET /api/v1/destinations/geojson
 */
export const getDestinationsGeoJSON = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const sql = `
    SELECT
      d.id, d.name, d.latitude, d.longitude, d.address,
      d.images, d.is_featured,
      c.name as category_name, c.slug as category_slug
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.id
    WHERE d.is_active = ?
    ORDER BY d.popularity_score DESC, d.rating DESC
  `;

  const [destinations]: any = await pool.execute(sql, [true]);

  const features = destinations.map((dest: any, index: number) => {
    const images = safeJsonParse(dest.images, []);
    return {
      type: 'Feature',
      properties: {
        id: dest.id,
        name: dest.name,
        address: dest.address,
        image: Array.isArray(images) && images.length > 0 ? images[0] : null,
        is_featured: dest.is_featured,
        category_name: dest.category_name,
        category_slug: dest.category_slug,
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(dest.longitude), Number(dest.latitude)],
      },
      id: index + 1,
    };
  });

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  res.json(geojson);
};

/**
 * Get popular destinations
 * GET /api/v1/destinations/popular
 */
export const getPopularDestinations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { limit = 10 } = req.query;

  const sql = `
    SELECT
      d.*,
      c.name as category_name,
      c.slug as category_slug
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.id
    WHERE d.is_active = ?
    ORDER BY d.popularity_score DESC, d.rating DESC
    LIMIT ?
  `;

  const [destinations]: any = await pool.execute(sql, [true, Number(limit)]);

  res.json({
    success: true,
    data: destinations.map(formatDestination),
  });
};
