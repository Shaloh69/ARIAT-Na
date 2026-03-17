/**
 * Recommendation Service
 * Scores and ranks destinations based on user constraints using weighted arithmetic.
 * No ML model — fully deterministic.
 */

import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface DestinationRow extends RowDataPacket {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  cluster_id: string | null;
  cluster_name: string | null;
  cluster_slug: string | null;
  municipality: string | null;
  latitude: number;
  longitude: number;
  address: string;
  entrance_fee_local: number;
  entrance_fee_foreign: number;
  average_visit_duration: number; // minutes
  budget_level: 'budget' | 'mid' | 'premium';
  tags: string[] | null;
  family_friendly: boolean;
  rating: number;
  review_count: number;
  popularity_score: number;
  is_featured: boolean;
}

export interface ScoredDestination {
  destination: DestinationRow;
  score: number;
  reason: string;
}

/**
 * Haversine distance (km) between two GPS points — local to avoid cross-module dep.
 */
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Rank destinations for a given user request.
 * Returns up to maxStops * 3 candidates (slack for the ordering step).
 *
 * Scoring weights:
 *   interest_match  × 0.35
 *   rating_norm     × 0.25
 *   popularity_norm × 0.15
 *   distance_score  × 0.15
 *   budget_fit      × 0.10
 */
export async function rankDestinations(
  startLat: number,
  startLon: number,
  interests: string[],
  budget: number,
  maxStops: number,
  clusterIds?: string[],
  groupType?: string
): Promise<ScoredDestination[]> {
  let query = `
    SELECT
      d.id, d.name, d.category_id, d.latitude, d.longitude, d.address,
      d.entrance_fee_local, d.entrance_fee_foreign,
      d.average_visit_duration, d.budget_level, d.tags, d.family_friendly,
      d.rating, d.review_count, d.popularity_score, d.is_featured,
      d.cluster_id, d.municipality,
      c.name  AS category_name,
      c.slug  AS category_slug,
      cl.name AS cluster_name,
      cl.slug AS cluster_slug
    FROM destinations d
    JOIN categories c ON d.category_id = c.id
    LEFT JOIN clusters cl ON d.cluster_id = cl.id
    WHERE d.is_active = TRUE
  `;
  const params: string[] = [];

  if (clusterIds && clusterIds.length > 0) {
    query += ` AND d.cluster_id IN (${clusterIds.map(() => '?').join(',')})`;
    params.push(...clusterIds);
  }

  const [rows] = await pool.execute<DestinationRow[]>(query, params);

  // Parse JSON tags if returned as string
  for (const row of rows) {
    if (typeof row.tags === 'string') {
      try { row.tags = JSON.parse(row.tags); } catch { row.tags = null; }
    }
  }

  if (rows.length === 0) return [];

  // Normalise popularity across the whole set
  const maxPop = Math.max(...rows.map((r) => r.popularity_score || 0), 1);

  const normalizedInterests = interests.map((i) => i.toLowerCase().trim());

  const scored: ScoredDestination[] = rows
    .filter((dest) => {
      // Hard filter: skip if entrance fee exceeds budget (when budget > 0)
      if (budget > 0 && dest.entrance_fee_local > budget) return false;
      return true;
    })
    .map((dest) => {
      // --- interest_match ---
      const catName = dest.category_name.toLowerCase();
      const catSlug = dest.category_slug.toLowerCase();
      const destName = dest.name.toLowerCase();
      const destTags = Array.isArray(dest.tags) ? dest.tags.map((t) => t.toLowerCase()) : [];
      let interestMatch = 0;
      const matchedInterest: string[] = [];
      for (const interest of normalizedInterests) {
        if (catName.includes(interest) || catSlug.includes(interest) || destTags.some((t) => t.includes(interest))) {
          interestMatch = 1.0;
          matchedInterest.push(interest);
          break;
        }
        if (destName.includes(interest)) {
          interestMatch = Math.max(interestMatch, 0.5);
          matchedInterest.push(interest);
        }
      }

      // Family filter bonus
      const familyBonus = groupType === 'family' && dest.family_friendly ? 0.1 : 0;

      // --- rating_norm ---
      const ratingNorm = (dest.rating || 0) / 5.0;

      // --- popularity_norm ---
      const popularityNorm = (dest.popularity_score || 0) / maxPop;

      // --- distance_score ---
      const distanceKm = distKm(startLat, startLon, dest.latitude, dest.longitude);
      const distanceScore = 1 / (1 + distanceKm);

      // --- budget_fit ---
      const budgetFit = budget === 0 || dest.entrance_fee_local <= budget ? 1.0 : 0;

      // Featured bonus (+0.05, uncapped)
      const featuredBonus = dest.is_featured ? 0.05 : 0;

      const score =
        interestMatch * 0.35 +
        ratingNorm * 0.25 +
        popularityNorm * 0.15 +
        distanceScore * 0.15 +
        budgetFit * 0.10 +
        featuredBonus +
        familyBonus;

      // Build human-readable reason
      const reasons: string[] = [];
      if (matchedInterest.length > 0) reasons.push(`Matches ${matchedInterest.join(', ')} interest`);
      if (dest.rating >= 4.0) reasons.push(`high rating (${dest.rating.toFixed(1)}\u2605)`);
      if (dest.is_featured) reasons.push('featured destination');
      if (distanceKm < 2) reasons.push('nearby');
      const reason = reasons.length > 0 ? reasons.join(', ') : 'Recommended for you';

      return { destination: dest, score, reason };
    });

  // Sort by score descending, return candidate pool
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxStops * 3);
}
