/**
 * Itinerary Service
 * Orders scored destinations using greedy nearest-neighbour and computes route
 * legs by calling the existing calculateRoute() pathfinding function.
 */

import { calculateRoute } from './pathfinding.service';
import { ScoredDestination, DestinationRow } from './recommendation.service';
import { calculateMultiModalRoute, TransportLeg } from './multimodal.service';

export interface ItineraryStop {
  destination: DestinationRow;
  score: number;
  reason: string;
  visit_duration: number;    // minutes
  leg_distance: number;      // km (travel leg to reach this stop)
  leg_travel_time: number;   // minutes (travel leg to reach this stop)
  cumulative_time: number;   // minutes from start (includes all travel + visits up to this stop)
}

export interface RouteLeg {
  success: boolean;
  totalDistance: number;
  estimatedTime: number;
  routeGeometry?: [number, number][];
  steps: Array<{ instruction: string; roadName: string; distance: number; time: number; from: string; to: string }>;
  virtualConnections?: Array<{ type: string; from: object; to: object; distance: number; isVirtual: true }>;
  multiModalLegs?: TransportLeg[];
  totalFare?: number;
}

export interface GeneratedItinerary {
  stops: ItineraryStop[];
  legs: RouteLeg[];           // one leg per stop (from previous stop / start to this stop)
  totalDistance: number;      // km (sum of leg distances)
  estimatedTravelTime: number; // minutes (sum of leg travel times)
  estimatedVisitTime: number;  // minutes (sum of visit durations)
  estimatedTotalTime: number;  // minutes (travel + visits)
  estimatedCost: number;       // PHP (sum of entrance fees)
}

export interface DayPlan {
  dayNumber: number;
  itinerary: GeneratedItinerary;
  clusterName?: string;
}

export interface MultiDayItinerary {
  days: DayPlan[];
  totalDays: number;
  totalStops: number;
  totalDistance: number;
  estimatedTravelTime: number;
  estimatedVisitTime: number;
  estimatedTotalTime: number;
  estimatedCost: number;
}

/**
 * Build an itinerary from a ranked destination list using greedy nearest-neighbour ordering.
 *
 * Algorithm:
 * 1. Start at user-provided GPS position.
 * 2. From the current position, select the unvisited candidate with the highest score
 *    that fits within the remaining time budget.
 * 3. Compute the route leg using calculateRoute().
 * 4. Advance current position; deduct leg travel time + visit duration from remaining budget.
 * 5. Repeat until maxStops reached or no candidate fits.
 */
const MULTIMODAL_MODES = new Set(['bus_commute', 'bus', 'bus_ac', 'jeepney', 'taxi', 'ferry', 'habal_habal', 'tricycle', 'walk']);

// ── Haversine fallback ────────────────────────────────────────────────────────
const SPEED_KMH: Record<string, number> = {
  private_car: 40, taxi: 35, bus: 25, bus_commute: 25,
  ferry: 20, walk: 5, habal_habal: 30, tricycle: 20,
};

function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Straight-line leg estimate used when the road graph cannot route a candidate. */
function fallbackLeg(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  transportMode?: string,
): RouteLeg {
  const dist = haversineDist(fromLat, fromLon, toLat, toLon);
  const speed = SPEED_KMH[transportMode ?? ''] ?? 35;
  const timeMin = Math.max(1, Math.ceil((dist / speed) * 60));
  return {
    success: true,
    totalDistance: Math.round(dist * 100) / 100,
    estimatedTime: timeMin,
    routeGeometry: [[fromLon, fromLat], [toLon, toLat]],
    steps: [{ instruction: 'Head to destination', roadName: '', distance: dist, time: timeMin, from: 'Start', to: 'Destination' }],
  };
}

export async function buildItinerary(
  ranked: ScoredDestination[],
  startLat: number,
  startLon: number,
  availableHours: number,
  maxStops: number,
  optimizeFor: 'distance' | 'time',
  maxDailyTravelMinutes = 600,
  transportMode?: string
): Promise<GeneratedItinerary> {
  let currentLat = startLat;
  let currentLon = startLon;
  let remainingMinutes = availableHours * 60;
  let cumulativeTravelMinutes = 0;

  const stops: ItineraryStop[] = [];
  const legs: RouteLeg[] = [];
  const visited = new Set<string>();

  let cumulativeTime = 0;

  while (stops.length < maxStops && ranked.length > 0) {
    let bestIdx = -1;
    let bestLeg: RouteLeg | null = null;

    // Try candidates in score order (ranked is already sorted)
    for (let i = 0; i < ranked.length; i++) {
      const candidate = ranked[i];
      if (visited.has(candidate.destination.id)) continue;

      // Compute leg — multimodal or standard A* pathfinder
      let leg: RouteLeg;
      const useMultiModal = transportMode && MULTIMODAL_MODES.has(transportMode);
      try {
        if (useMultiModal) {
          const mm = await calculateMultiModalRoute(
            currentLat, currentLon,
            candidate.destination.latitude, candidate.destination.longitude,
            transportMode! as import('./multimodal.service').TransportMode, optimizeFor
          );
          leg = {
            success: true,
            totalDistance: mm.totalDistance,
            estimatedTime: mm.totalDuration,
            routeGeometry: mm.legs.flatMap((l) => l.geometry ?? []),
            steps: mm.legs.map((l) => ({
              instruction: l.instruction,
              roadName: l.mode,
              distance: l.distance,
              time: l.duration,
              from: l.from.name,
              to: l.to.name,
            })),
            multiModalLegs: mm.legs,
            totalFare: mm.totalFare,
          };
        } else {
          leg = await calculateRoute(
            currentLat,
            currentLon,
            candidate.destination.latitude,
            candidate.destination.longitude,
            optimizeFor
          ) as RouteLeg;
        }
      } catch {
        // Pathfinding threw — use straight-line estimate so the stop isn't lost
        leg = fallbackLeg(currentLat, currentLon, candidate.destination.latitude, candidate.destination.longitude, transportMode);
      }

      // If the router returned a failure result, use the fallback estimate
      if (!leg.success) {
        leg = fallbackLeg(currentLat, currentLon, candidate.destination.latitude, candidate.destination.longitude, transportMode);
      }

      const legMinutes = leg.estimatedTime; // already in minutes from pathfinding service
      const visitMinutes = candidate.destination.average_visit_duration || 60;
      const totalNeeded = legMinutes + visitMinutes;
      const newTravelTotal = cumulativeTravelMinutes + legMinutes;

      if (totalNeeded <= remainingMinutes && newTravelTotal <= maxDailyTravelMinutes) {
        bestIdx = i;
        bestLeg = leg;
        break; // highest-scored candidate that fits — take it
      }
    }

    if (bestIdx === -1 || !bestLeg) break; // no candidate fits remaining budget

    const chosen = ranked[bestIdx];
    visited.add(chosen.destination.id);

    const legMinutes = bestLeg.estimatedTime;
    const visitMinutes = chosen.destination.average_visit_duration || 60;
    cumulativeTime += legMinutes + visitMinutes;
    remainingMinutes -= legMinutes + visitMinutes;
    cumulativeTravelMinutes += legMinutes;

    stops.push({
      destination: chosen.destination,
      score: chosen.score,
      reason: chosen.reason,
      visit_duration: visitMinutes,
      leg_distance: bestLeg.totalDistance,
      leg_travel_time: legMinutes,
      cumulative_time: cumulativeTime,
    });
    legs.push(bestLeg);

    // Advance current position
    currentLat = chosen.destination.latitude;
    currentLon = chosen.destination.longitude;
  }

  const totalDistance = legs.reduce((sum, l) => sum + l.totalDistance, 0);
  const estimatedTravelTime = legs.reduce((sum, l) => sum + l.estimatedTime, 0);
  const estimatedVisitTime = stops.reduce((sum, s) => sum + s.visit_duration, 0);
  const estimatedCost = stops.reduce((sum, s) => sum + (s.destination.entrance_fee_local || 0), 0)
    + legs.reduce((sum, l) => sum + (l.totalFare ?? 0), 0);

  return {
    stops,
    legs,
    totalDistance: Math.round(totalDistance * 100) / 100,
    estimatedTravelTime: Math.round(estimatedTravelTime),
    estimatedVisitTime: Math.round(estimatedVisitTime),
    estimatedTotalTime: Math.round(estimatedTravelTime + estimatedVisitTime),
    estimatedCost: Math.round(estimatedCost * 100) / 100,
  };
}

/**
 * Build a multi-day itinerary by calling buildItinerary once per day.
 * The pool of ranked candidates is consumed across days.
 * Each day starts from the last stop of the previous day (or the user's start on day 1).
 */
export async function buildMultiDayItinerary(
  ranked: ScoredDestination[],
  startLat: number,
  startLon: number,
  days: number,
  hoursPerDay: number,
  maxStopsPerDay: number,
  optimizeFor: 'distance' | 'time',
  transportMode?: string
): Promise<MultiDayItinerary> {
  const remaining = [...ranked];
  const dayPlans: DayPlan[] = [];
  let currentLat = startLat;
  let currentLon = startLon;

  for (let day = 1; day <= days; day++) {
    if (remaining.length === 0) break;

    // 1-cluster-per-day: pick the cluster of the highest-ranked remaining candidate
    // and restrict that day's pool to that cluster (plus cluster-less destinations)
    const dominantClusterId = remaining[0]?.destination.cluster_id ?? null;
    const dayPool = dominantClusterId
      ? remaining.filter((c) => !c.destination.cluster_id || c.destination.cluster_id === dominantClusterId)
      : remaining;

    const dayItinerary = await buildItinerary(
      dayPool,
      currentLat,
      currentLon,
      hoursPerDay,
      maxStopsPerDay,
      optimizeFor,
      600,  // max 600 min/day travel
      transportMode
    );

    if (dayItinerary.stops.length === 0) break;

    // Remove used destinations from the pool
    const usedIds = new Set(dayItinerary.stops.map((s) => s.destination.id));
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (usedIds.has(remaining[i].destination.id)) remaining.splice(i, 1);
    }

    // Determine cluster name for this day (most common cluster among stops)
    const clusterCounts = new Map<string, number>();
    for (const s of dayItinerary.stops) {
      const cname = s.destination.cluster_name;
      if (cname) clusterCounts.set(cname, (clusterCounts.get(cname) ?? 0) + 1);
    }
    let clusterName: string | undefined;
    let maxCount = 0;
    for (const [name, count] of clusterCounts) {
      if (count > maxCount) { clusterName = name; maxCount = count; }
    }

    dayPlans.push({ dayNumber: day, itinerary: dayItinerary, clusterName });

    // Next day starts from last stop of this day
    const lastStop = dayItinerary.stops[dayItinerary.stops.length - 1];
    currentLat = lastStop.destination.latitude;
    currentLon = lastStop.destination.longitude;
  }

  const totalDistance = dayPlans.reduce((s, d) => s + d.itinerary.totalDistance, 0);
  const estimatedTravelTime = dayPlans.reduce((s, d) => s + d.itinerary.estimatedTravelTime, 0);
  const estimatedVisitTime = dayPlans.reduce((s, d) => s + d.itinerary.estimatedVisitTime, 0);
  const estimatedCost = dayPlans.reduce((s, d) => s + d.itinerary.estimatedCost, 0);
  const totalStops = dayPlans.reduce((s, d) => s + d.itinerary.stops.length, 0);

  return {
    days: dayPlans,
    totalDays: dayPlans.length,
    totalStops,
    totalDistance: Math.round(totalDistance * 100) / 100,
    estimatedTravelTime: Math.round(estimatedTravelTime),
    estimatedVisitTime: Math.round(estimatedVisitTime),
    estimatedTotalTime: Math.round(estimatedTravelTime + estimatedVisitTime),
    estimatedCost: Math.round(estimatedCost * 100) / 100,
  };
}
