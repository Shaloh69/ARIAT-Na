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
    menu_images: safeJsonParse(dest.menu_images, []),
    operating_hours: safeJsonParse(dest.operating_hours, null),
    amenities: safeJsonParse(dest.amenities, []),
    tags: safeJsonParse(dest.tags, []),
    cuisine_types: safeJsonParse(dest.cuisine_types, []),
    service_types: safeJsonParse(dest.service_types, []),
    accommodation_pricing: safeJsonParse(dest.accommodation_pricing, null),
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
    cluster,
    municipality,
    tags,
    budget_level,
    family_friendly,
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

  if (cluster) {
    conditions.push('d.cluster_id = ?');
    params.push(cluster);
  }

  if (municipality) {
    conditions.push('d.municipality = ?');
    params.push(municipality);
  }

  if (tags) {
    const tagList = String(tags).split(',').map((t) => t.trim()).filter(Boolean);
    tagList.forEach((tag) => {
      conditions.push('JSON_CONTAINS(d.tags, JSON_QUOTE(?))');
      params.push(tag);
    });
  }

  if (budget_level) {
    conditions.push('d.budget_level = ?');
    params.push(budget_level);
  }

  if (family_friendly === 'true') {
    conditions.push('d.family_friendly = ?');
    params.push(true);
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

  const [destinations]: any = await pool.execute(sql, [...params, String(Number(limit)), String(offset)]);

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

  // Fetch nearby places within 5 km using Haversine formula
  const NEARBY_RADIUS_KM = 5;
  const [nearbyRows]: any = await pool.execute(
    `SELECT d.id, d.name, d.latitude, d.longitude, d.address, d.images,
            d.rating, d.average_visit_duration, d.entrance_fee_local,
            d.budget_level, d.cluster_id,
            c.name AS category_name, c.slug AS category_slug,
            (6371 * ACOS(
              COS(RADIANS(?)) * COS(RADIANS(d.latitude)) *
              COS(RADIANS(d.longitude) - RADIANS(?)) +
              SIN(RADIANS(?)) * SIN(RADIANS(d.latitude))
            )) AS distance_km
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.id
     WHERE d.id != ? AND d.is_active = TRUE
     HAVING distance_km < ?
     ORDER BY distance_km ASC
     LIMIT 6`,
    [destination.latitude, destination.longitude, destination.latitude, id, NEARBY_RADIUS_KM]
  );

  const nearby_places = (nearbyRows as any[]).map((n: any) => ({
    ...n,
    images: safeJsonParse(n.images, []),
  }));

  res.json({
    success: true,
    data: { ...formatDestination(destination), nearby_places },
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
    is_island = false,
    family_friendly = false,
    cluster_id,
    municipality,
    budget_level = 'mid',
    contact_phone,
    contact_email,
    website_url,
    facebook_url,
    instagram_url,
    seating_capacity,
    star_rating,
    check_in_time,
    check_out_time,
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

  let menu_images = req.body.menu_images;
  if (typeof menu_images === 'string') {
    try { menu_images = JSON.parse(menu_images); } catch { menu_images = null; }
  }

  let cuisine_types = req.body.cuisine_types;
  if (typeof cuisine_types === 'string') {
    try { cuisine_types = JSON.parse(cuisine_types); } catch { cuisine_types = null; }
  }

  let service_types = req.body.service_types;
  if (typeof service_types === 'string') {
    try { service_types = JSON.parse(service_types); } catch { service_types = null; }
  }

  let tags = req.body.tags;
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch { tags = null; }
  }

  let accommodation_pricing = req.body.accommodation_pricing;
  if (typeof accommodation_pricing === 'string') {
    try { accommodation_pricing = JSON.parse(accommodation_pricing); } catch { accommodation_pricing = null; }
  }

  const destinationId = uuidv4();

  const sql = `
    INSERT INTO destinations (
      id, name, description, category_id, latitude, longitude,
      address, contact_phone, contact_email, website_url, facebook_url, instagram_url,
      images, menu_images, operating_hours, entrance_fee_local,
      entrance_fee_foreign, average_visit_duration, best_time_to_visit,
      amenities, cuisine_types, service_types, seating_capacity,
      accommodation_pricing, star_rating, check_in_time, check_out_time,
      tags, cluster_id, municipality, budget_level,
      family_friendly, is_island, is_active, is_featured
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      contact_phone || null,
      contact_email || null,
      website_url || null,
      facebook_url || null,
      instagram_url || null,
      images ? JSON.stringify(images) : null,
      menu_images ? JSON.stringify(menu_images) : null,
      operating_hours ? JSON.stringify(operating_hours) : null,
      Number(entrance_fee_local) || 0,
      Number(entrance_fee_foreign) || 0,
      Number(average_visit_duration) || 120,
      best_time_to_visit || null,
      amenities ? JSON.stringify(amenities) : null,
      cuisine_types ? JSON.stringify(cuisine_types) : null,
      service_types ? JSON.stringify(service_types) : null,
      seating_capacity ? Number(seating_capacity) : null,
      accommodation_pricing ? JSON.stringify(accommodation_pricing) : null,
      star_rating ? Number(star_rating) : null,
      check_in_time || null,
      check_out_time || null,
      tags ? JSON.stringify(tags) : null,
      cluster_id || null,
      municipality || null,
      budget_level || 'mid',
      family_friendly ? 1 : 0,
      is_island ? 1 : 0,
      true,
      is_featured ? 1 : 0,
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
    'name', 'description', 'category_id', 'latitude', 'longitude', 'address',
    'contact_phone', 'contact_email', 'website_url', 'facebook_url', 'instagram_url',
    'entrance_fee_local', 'entrance_fee_foreign', 'average_visit_duration', 'best_time_to_visit',
    'is_active', 'is_featured', 'is_island', 'family_friendly',
    'cluster_id', 'municipality', 'budget_level',
    'seating_capacity', 'star_rating', 'check_in_time', 'check_out_time',
  ];

  const jsonFields = [
    'images', 'menu_images', 'operating_hours', 'amenities',
    'cuisine_types', 'service_types', 'tags', 'accommodation_pricing',
  ];

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
