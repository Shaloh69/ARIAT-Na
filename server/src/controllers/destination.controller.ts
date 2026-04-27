import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, AppError, Destination } from "../types";
import { pool } from "../config/database";

/**
 * Safely parse a MySQL JSON column value.
 * MySQL JSON columns may return already-parsed objects via mysql2 driver,
 * or strings that still need parsing. This handles both cases.
 */
function safeJsonParse(value: any, fallback: any = null): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value; // Already parsed by mysql2
  if (typeof value === "string") {
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
  const toNum = (v: any, fallback = 0): number =>
    v !== null && v !== undefined && v !== "" ? Number(v) : fallback;

  const categories: Array<{ id: string; name: string; slug: string }> =
    safeJsonParse(dest.categories, []);
  const firstCat = categories[0] ?? null;

  return {
    ...dest,
    latitude: toNum(dest.latitude),
    longitude: toNum(dest.longitude),
    rating: toNum(dest.rating),
    popularity_score: toNum(dest.popularity_score),
    entrance_fee_local: toNum(dest.entrance_fee_local),
    entrance_fee_foreign: toNum(dest.entrance_fee_foreign),
    images: safeJsonParse(dest.images, []),
    menu_images: safeJsonParse(dest.menu_images, []),
    operating_hours: safeJsonParse(dest.operating_hours, null),
    amenities: safeJsonParse(dest.amenities, []),
    tags: safeJsonParse(dest.tags, []),
    cuisine_types: safeJsonParse(dest.cuisine_types, []),
    service_types: safeJsonParse(dest.service_types, []),
    accommodation_pricing: safeJsonParse(dest.accommodation_pricing, null),
    // Multi-category fields
    categories,
    category_name: firstCat?.name ?? null,
    category_slug: firstCat?.slug ?? null,
  };
}

/**
 * Subquery that returns a JSON array of {id,name,slug} for all categories.
 * Uses the junction table when migration 012 has been run; falls back to the
 * legacy category_id column otherwise (handled at runtime via tableChecked flag).
 */
const CATEGORIES_SUBQUERY = `(
  SELECT JSON_ARRAYAGG(JSON_OBJECT('id', c2.id, 'name', c2.name, 'slug', c2.slug))
  FROM destination_categories dc2
  JOIN categories c2 ON dc2.category_id = c2.id
  WHERE dc2.destination_id = d.id
) AS categories`;

const CATEGORIES_SUBQUERY_LEGACY = `(
  SELECT JSON_ARRAYAGG(JSON_OBJECT('id', c2.id, 'name', c2.name, 'slug', c2.slug))
  FROM categories c2
  WHERE c2.id = d.category_id
) AS categories`;

// Cache whether the junction table exists so we don't check on every request
let _junctionTableExists: boolean | null = null;
async function categoriesSubquery(): Promise<string> {
  if (_junctionTableExists === null) {
    try {
      await pool.execute(
        "SELECT 1 FROM destination_categories LIMIT 1",
      );
      _junctionTableExists = true;
    } catch {
      _junctionTableExists = false;
    }
  }
  return _junctionTableExists ? CATEGORIES_SUBQUERY : CATEGORIES_SUBQUERY_LEGACY;
}

/**
 * Get all destinations (with filters and pagination)
 * GET /api/v1/destinations
 */
export const getDestinations = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const {
    page = 1,
    limit = 20,
    category,
    featured,
    minRating,
    q,
    active = "true",
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
  if (active === "true") {
    conditions.push("d.is_active = ?");
    params.push(true);
  }

  if (category) {
    conditions.push(
      "EXISTS (SELECT 1 FROM destination_categories dc WHERE dc.destination_id = d.id AND dc.category_id = ?)",
    );
    params.push(category);
  }

  if (featured === "true") {
    conditions.push("d.is_featured = ?");
    params.push(true);
  }

  if (minRating) {
    conditions.push("d.rating >= ?");
    params.push(Number(minRating));
  }

  if (q) {
    // Use LIKE search — works without a FULLTEXT index and is sufficient at this scale
    conditions.push(
      "(d.name LIKE ? OR d.description LIKE ? OR d.address LIKE ? OR d.municipality LIKE ?)",
    );
    const term = `%${q}%`;
    params.push(term, term, term, term);
  }

  if (cluster) {
    conditions.push("d.cluster_id = ?");
    params.push(cluster);
  }

  if (municipality) {
    conditions.push("d.municipality = ?");
    params.push(municipality);
  }

  if (tags) {
    const tagList = String(tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    tagList.forEach((tag) => {
      conditions.push("JSON_CONTAINS(d.tags, JSON_QUOTE(?))");
      params.push(tag);
    });
  }

  if (budget_level) {
    conditions.push("d.budget_level = ?");
    params.push(budget_level);
  }

  if (family_friendly === "true") {
    conditions.push("d.family_friendly = ?");
    params.push(true);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM destinations d
    ${whereClause}
  `;
  const [countResult]: any = await pool.execute(countSql, params);
  const total = countResult[0].total;

  // Get destinations with categories
  const csq = await categoriesSubquery();
  const sql = `
    SELECT d.*, ${csq}
    FROM destinations d
    ${whereClause}
    ORDER BY d.popularity_score DESC, d.rating DESC
    LIMIT ? OFFSET ?
  `;

  const [destinations]: any = await pool.execute(sql, [
    ...params,
    String(Number(limit)),
    String(offset),
  ]);

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
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const csq = await categoriesSubquery();

  const sql = `
    SELECT d.*, ${csq}
    FROM destinations d
    WHERE d.id = ?
  `;

  const [destinations]: any = await pool.execute(sql, [id]);

  if (destinations.length === 0) {
    throw new AppError("Destination not found", 404);
  }

  const destination = destinations[0];

  // Fetch nearby places within 5 km using Haversine formula
  const NEARBY_RADIUS_KM = 5;
  const [nearbyRows]: any = await pool.execute(
    `SELECT d.id, d.name, d.latitude, d.longitude, d.address, d.images,
            d.rating, d.average_visit_duration, d.entrance_fee_local,
            d.budget_level, d.cluster_id,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', c2.id, 'name', c2.name, 'slug', c2.slug))
             FROM destination_categories dc2 JOIN categories c2 ON dc2.category_id = c2.id
             WHERE dc2.destination_id = d.id) AS categories,
            (6371 * ACOS(
              COS(RADIANS(?)) * COS(RADIANS(d.latitude)) *
              COS(RADIANS(d.longitude) - RADIANS(?)) +
              SIN(RADIANS(?)) * SIN(RADIANS(d.latitude))
            )) AS distance_km
     FROM destinations d
     WHERE d.id != ? AND d.is_active = TRUE
     HAVING distance_km < ?
     ORDER BY distance_km ASC
     LIMIT 6`,
    [
      destination.latitude,
      destination.longitude,
      destination.latitude,
      id,
      NEARBY_RADIUS_KM,
    ],
  );

  const nearby_places = (nearbyRows as any[]).map((n: any) => {
    const cats: Array<{ id: string; name: string; slug: string }> =
      safeJsonParse(n.categories, []);
    return {
      ...n,
      images: safeJsonParse(n.images, []),
      categories: cats,
      category_name: cats[0]?.name ?? null,
      category_slug: cats[0]?.slug ?? null,
    };
  });

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
  res: Response,
): Promise<void> => {
  const {
    name,
    description,
    category_id,       // legacy single-value — still accepted for backward compat
    category_ids: rawCategoryIds, // new multi-value array
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
    budget_level = "mid",
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

  // Normalise to an array: prefer category_ids, fall back to legacy category_id
  const categoryIds: string[] = Array.isArray(rawCategoryIds)
    ? rawCategoryIds.filter(Boolean)
    : rawCategoryIds
      ? [String(rawCategoryIds)]
      : category_id
        ? [String(category_id)]
        : [];

  // Validate required fields
  if (!name || !String(name).trim()) {
    throw new AppError("Destination name is required", 400);
  }
  if (categoryIds.length === 0) {
    throw new AppError("At least one category is required", 400);
  }
  if (latitude === undefined || longitude === undefined) {
    throw new AppError("Latitude and longitude are required", 400);
  }

  // Handle images/amenities — could arrive as string or array
  let images = req.body.images;
  if (typeof images === "string") {
    try {
      images = JSON.parse(images);
    } catch {
      images = null;
    }
  }

  let amenities = req.body.amenities;
  if (typeof amenities === "string") {
    try {
      amenities = JSON.parse(amenities);
    } catch {
      amenities = null;
    }
  }

  let menu_images = req.body.menu_images;
  if (typeof menu_images === "string") {
    try {
      menu_images = JSON.parse(menu_images);
    } catch {
      menu_images = null;
    }
  }

  let cuisine_types = req.body.cuisine_types;
  if (typeof cuisine_types === "string") {
    try {
      cuisine_types = JSON.parse(cuisine_types);
    } catch {
      cuisine_types = null;
    }
  }

  let service_types = req.body.service_types;
  if (typeof service_types === "string") {
    try {
      service_types = JSON.parse(service_types);
    } catch {
      service_types = null;
    }
  }

  let tags = req.body.tags;
  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch {
      tags = null;
    }
  }

  let accommodation_pricing = req.body.accommodation_pricing;
  if (typeof accommodation_pricing === "string") {
    try {
      accommodation_pricing = JSON.parse(accommodation_pricing);
    } catch {
      accommodation_pricing = null;
    }
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
      categoryIds[0] || null,   // primary category (backward compat)
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
      budget_level || "mid",
      family_friendly ? 1 : 0,
      is_island ? 1 : 0,
      true,
      is_featured ? 1 : 0,
    ]);

    // Insert all categories into the junction table
    for (let i = 0; i < categoryIds.length; i++) {
      await pool.execute(
        "INSERT IGNORE INTO destination_categories (id, destination_id, category_id, display_order) VALUES (UUID(), ?, ?, ?)",
        [destinationId, categoryIds[i], i],
      );
    }
  } catch (dbError: any) {
    if (dbError.code === "ER_NO_REFERENCED_ROW_2") {
      throw new AppError(
        "Invalid category — one or more selected categories do not exist",
        400,
      );
    }
    throw dbError;
  }

  // Fetch created destination with categories
  const csq = await categoriesSubquery();
  const [destinations]: any = await pool.execute(
    `SELECT d.*, ${csq} FROM destinations d WHERE d.id = ?`,
    [destinationId],
  );

  res.status(201).json({
    success: true,
    message: "Destination created successfully",
    data: formatDestination(destinations[0]),
  });
};

/**
 * Update destination (Admin only)
 * PUT /api/v1/destinations/:id
 */
export const updateDestination = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;

  // Check if destination exists
  const [existing]: any = await pool.execute(
    "SELECT id FROM destinations WHERE id = ?",
    [id],
  );

  if (existing.length === 0) {
    throw new AppError("Destination not found", 404);
  }

  // Build dynamic update query
  const allowedFields = [
    "name",
    "description",
    "latitude",
    "longitude",
    "address",
    "contact_phone",
    "contact_email",
    "website_url",
    "facebook_url",
    "instagram_url",
    "entrance_fee_local",
    "entrance_fee_foreign",
    "average_visit_duration",
    "best_time_to_visit",
    "is_active",
    "is_featured",
    "is_island",
    "family_friendly",
    "cluster_id",
    "municipality",
    "budget_level",
    "seating_capacity",
    "star_rating",
    "check_in_time",
    "check_out_time",
  ];

  const jsonFields = [
    "images",
    "menu_images",
    "operating_hours",
    "amenities",
    "cuisine_types",
    "service_types",
    "tags",
    "accommodation_pricing",
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
      if (typeof val === "string") {
        try {
          val = JSON.parse(val);
        } catch {
          /* keep as-is */
        }
      }
      updateFields.push(`${key} = ?`);
      updateValues.push(val ? JSON.stringify(val) : null);
    }
  });

  if (updateFields.length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  const sql = `
    UPDATE destinations
    SET ${updateFields.join(", ")}, updated_at = NOW()
    WHERE id = ?
  `;

  await pool.execute(sql, [...updateValues, id]);

  // Handle category_ids update if provided
  const rawUpdatedIds = updates.category_ids ?? updates.category_id;
  if (rawUpdatedIds !== undefined) {
    const updatedIds: string[] = Array.isArray(rawUpdatedIds)
      ? rawUpdatedIds.filter(Boolean)
      : rawUpdatedIds
        ? [String(rawUpdatedIds)]
        : [];

    if (updatedIds.length > 0) {
      // Replace junction entries
      await pool.execute(
        "DELETE FROM destination_categories WHERE destination_id = ?",
        [id],
      );
      for (let i = 0; i < updatedIds.length; i++) {
        await pool.execute(
          "INSERT IGNORE INTO destination_categories (id, destination_id, category_id, display_order) VALUES (UUID(), ?, ?, ?)",
          [id, updatedIds[i], i],
        );
      }
      // Keep category_id in sync with primary category
      await pool.execute(
        "UPDATE destinations SET category_id = ? WHERE id = ?",
        [updatedIds[0], id],
      );
    }
  }

  // Fetch updated destination with categories
  const csq = await categoriesSubquery();
  const [destinations]: any = await pool.execute(
    `SELECT d.*, ${csq} FROM destinations d WHERE d.id = ?`,
    [id],
  );

  res.json({
    success: true,
    message: "Destination updated successfully",
    data: formatDestination(destinations[0]),
  });
};

/**
 * Delete destination (Admin only)
 * DELETE /api/v1/destinations/:id
 */
export const deleteDestination = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  const [result]: any = await pool.execute(
    "DELETE FROM destinations WHERE id = ?",
    [id],
  );

  if (result.affectedRows === 0) {
    throw new AppError("Destination not found", 404);
  }

  res.json({
    success: true,
    message: "Destination deleted successfully",
  });
};

/**
 * Get featured destinations
 * GET /api/v1/destinations/featured
 */
export const getFeaturedDestinations = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const csq = await categoriesSubquery();
  const sql = `
    SELECT d.*, ${csq}
    FROM destinations d
    WHERE d.is_featured = ? AND d.is_active = ?
    ORDER BY d.popularity_score DESC
    LIMIT 10
  `;

  let [destinations]: any = await pool.execute(sql, [true, true]);

  if ((destinations as any[]).length === 0) {
    const fallbackSql = `
      SELECT d.*, ${csq}
      FROM destinations d
      WHERE d.is_active = TRUE
      ORDER BY d.rating DESC, d.popularity_score DESC
      LIMIT 10
    `;
    [destinations] = await pool.execute(fallbackSql);
  }

  res.json({
    success: true,
    data: (destinations as any[]).map(formatDestination),
  });
};

/**
 * Get destinations as GeoJSON (for map display)
 * GET /api/v1/destinations/geojson
 */
export const getDestinationsGeoJSON = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const csq = await categoriesSubquery();
  const sql = `
    SELECT d.id, d.name, d.latitude, d.longitude, d.address, d.images, d.is_featured,
           ${csq}
    FROM destinations d
    WHERE d.is_active = ?
    ORDER BY d.popularity_score DESC, d.rating DESC
  `;

  const [destinations]: any = await pool.execute(sql, [true]);

  const features = destinations.map((dest: any, index: number) => {
    const images = safeJsonParse(dest.images, []);
    return {
      type: "Feature",
      properties: {
        id: dest.id,
        name: dest.name,
        address: dest.address,
        image: Array.isArray(images) && images.length > 0 ? images[0] : null,
        is_featured: dest.is_featured,
        category_name: safeJsonParse(dest.categories, [])[0]?.name ?? null,
        category_slug: safeJsonParse(dest.categories, [])[0]?.slug ?? null,
      },
      geometry: {
        type: "Point",
        coordinates: [Number(dest.longitude), Number(dest.latitude)],
      },
      id: index + 1,
    };
  });

  const geojson = {
    type: "FeatureCollection",
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
  res: Response,
): Promise<void> => {
  const { limit = 10 } = req.query;

  const csq = await categoriesSubquery();
  const sql = `
    SELECT d.*, ${csq}
    FROM destinations d
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

/**
 * Rate a destination (1–5 stars)
 * POST /api/v1/destinations/:id/rate
 */
export const rateDestination = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) throw new AppError("Unauthenticated", 401);

  const { id } = req.params;
  const { rating, comment } = req.body;
  const stars = Number(rating);

  if (!stars || stars < 1 || stars > 5) {
    throw new AppError("Rating must be between 1 and 5", 400);
  }

  const [dest]: any = await pool.execute(
    "SELECT id FROM destinations WHERE id = ?",
    [id],
  );
  if (dest.length === 0) throw new AppError("Destination not found", 404);

  const reviewId = uuidv4();
  await pool.execute(
    `INSERT INTO destination_reviews (id, destination_id, user_id, rating, comment)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updated_at = NOW()`,
    [reviewId, id, req.user.id, stars, comment || null],
  );

  // Recompute average and count
  const [agg]: any = await pool.execute(
    "SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM destination_reviews WHERE destination_id = ?",
    [id],
  );
  const avgRating = Math.round((agg[0].avg_r ?? 0) * 10) / 10;
  const reviewCount = agg[0].cnt ?? 0;

  await pool.execute(
    "UPDATE destinations SET average_rating = ?, review_count = ?, updated_at = NOW() WHERE id = ?",
    [avgRating, reviewCount, id],
  );

  res.json({ success: true, message: "Rating submitted", data: { average_rating: avgRating, review_count: reviewCount } });
};
