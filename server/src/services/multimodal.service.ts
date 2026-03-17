/**
 * Multi-Modal Routing Service
 *
 * Routes between two GPS points using a specified transport mode.
 * For complex modes (bus_commute, ferry), the route is broken into
 * typed legs (walk, tricycle, bus, ferry, etc.) with fare estimates.
 *
 * Every sub-leg call goes through calculateRoute() from pathfinding.service —
 * never re-implements pathfinding.
 */

import { pool } from '../config/database';
import { calculateRoute } from './pathfinding.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportMode =
  | 'private_car'
  | 'bus_commute'
  | 'taxi'
  | 'ferry'
  | 'walk'
  | 'hired_van'
  | 'motorbike'
  | 'habal_habal';

export interface TransportLeg {
  mode: 'walk' | 'bus' | 'jeepney' | 'tricycle' | 'taxi' | 'private_car' | 'ferry' | 'hired_van' | 'motorbike' | 'habal_habal';
  from: { name: string; lat: number; lon: number; type?: string };
  to:   { name: string; lat: number; lon: number; type?: string };
  distance: number;    // km
  duration: number;    // minutes
  fare: number;        // PHP
  instruction: string;
  geometry?: [number, number][];  // [lat, lon] pairs
}

export interface MultiModalRoute {
  legs: TransportLeg[];
  totalDistance: number;
  totalDuration: number;
  totalFare: number;
  summary: string;     // e.g. "Tricycle → Bus → Walk"
  warnings?: string[];
}

interface FareConfig {
  transport_type: string;
  display_name: string;
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  peak_hour_multiplier: number;
}

interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load all active fare configs into a lookup map. */
async function loadFareConfigs(): Promise<Map<string, FareConfig>> {
  const [rows]: any = await pool.execute(
    'SELECT transport_type, display_name, base_fare, per_km_rate, minimum_fare, peak_hour_multiplier FROM fare_configs WHERE is_active = TRUE'
  );
  const map = new Map<string, FareConfig>();
  for (const row of rows) {
    map.set(row.transport_type, row as FareConfig);
  }
  return map;
}

/** Calculate fare for a transport type and distance. Returns 0 if type not in config. */
function calculateFare(fares: Map<string, FareConfig>, transportType: string, distanceKm: number): number {
  const config = fares.get(transportType);
  if (!config) return 0;
  const raw = config.base_fare + config.per_km_rate * distanceKm;
  const withMin = Math.max(config.minimum_fare, raw);
  return Math.round(withMin * 100) / 100;
}

/** Haversine distance between two GPS coordinates (km). */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Find nearest bus_stop or bus_terminal within maxKm. Returns null if none found. */
async function findNearestBusStop(lat: number, lon: number, maxKm = 2.0): Promise<TransitStop | null> {
  const [rows]: any = await pool.execute(
    "SELECT id, name, latitude, longitude, point_type FROM intersections WHERE point_type IN ('bus_stop','bus_terminal')"
  );
  let nearest: TransitStop | null = null;
  let minDist = maxKm;
  for (const row of rows) {
    const dist = haversine(lat, lon, row.latitude, row.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = { id: row.id, name: row.name, lat: row.latitude, lon: row.longitude, type: row.point_type };
    }
  }
  return nearest;
}

/** Find nearest pier within maxKm. Returns null if none found. */
async function findNearestPier(lat: number, lon: number, maxKm = 10.0): Promise<TransitStop | null> {
  const [rows]: any = await pool.execute(
    "SELECT id, name, latitude, longitude, point_type FROM intersections WHERE point_type = 'pier'"
  );
  let nearest: TransitStop | null = null;
  let minDist = maxKm;
  for (const row of rows) {
    const dist = haversine(lat, lon, row.latitude, row.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = { id: row.id, name: row.name, lat: row.latitude, lon: row.longitude, type: 'pier' };
    }
  }
  return nearest;
}

/**
 * Wraps a calculateRoute() result into a TransportLeg.
 * fromName/toName override the start/end labels in the leg.
 */
async function buildLeg(
  fromLat: number, fromLon: number, fromName: string, fromType: string | undefined,
  toLat: number, toLon: number, toName: string, toType: string | undefined,
  mode: TransportLeg['mode'],
  fare: number,
  instruction: string,
  optimizeFor: 'distance' | 'time' = 'distance'
): Promise<TransportLeg> {
  const result = await calculateRoute(fromLat, fromLon, toLat, toLon, optimizeFor);

  // For walk, override the duration using 5 km/h walking speed
  let duration = result.estimatedTime;
  if (mode === 'walk') {
    duration = Math.max(1, Math.round((result.totalDistance / 5) * 60));
  }

  return {
    mode,
    from: { name: fromName, lat: fromLat, lon: fromLon, type: fromType },
    to:   { name: toName,   lat: toLat,   lon: toLon,   type: toType },
    distance: Math.round(result.totalDistance * 100) / 100,
    duration,
    fare,
    instruction,
    geometry: result.routeGeometry,
  };
}

/** Decide short-distance last-mile mode: walk (< 0.3km) or tricycle. */
function lastMileMode(distKm: number): 'walk' | 'tricycle' {
  return distKm < 0.3 ? 'walk' : 'tricycle';
}

/** Build summary string from leg modes. */
function buildSummary(legs: TransportLeg[]): string {
  const labels: Record<string, string> = {
    walk: 'Walk', bus: 'Bus', jeepney: 'Jeepney', tricycle: 'Tricycle',
    taxi: 'Taxi', private_car: 'Car', ferry: 'Ferry',
    hired_van: 'Van', motorbike: 'Motorbike', habal_habal: 'Habal-Habal',
  };
  // Deduplicate consecutive same modes
  const parts: string[] = [];
  for (const leg of legs) {
    const label = labels[leg.mode] ?? leg.mode;
    if (parts[parts.length - 1] !== label) parts.push(label);
  }
  return parts.join(' → ');
}

// ---------------------------------------------------------------------------
// Mode-specific routing functions
// ---------------------------------------------------------------------------

async function routeWalk(
  startLat: number, startLon: number, endLat: number, endLon: number
): Promise<MultiModalRoute> {
  const dist = haversine(startLat, startLon, endLat, endLon);
  const leg = await buildLeg(
    startLat, startLon, 'Starting Point', undefined,
    endLat, endLon, 'Destination', undefined,
    'walk', 0,
    'Walk to your destination'
  );
  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: 0,
    summary: 'Walk',
    warnings: dist > 3 ? ['Walking distance is over 3 km — consider another transport mode'] : [],
  };
}

async function routePrivateCar(
  startLat: number, startLon: number, endLat: number, endLon: number,
  mode: 'private_car' | 'hired_van' | 'motorbike' = 'private_car'
): Promise<MultiModalRoute> {
  const leg = await buildLeg(
    startLat, startLon, 'Starting Point', undefined,
    endLat, endLon, 'Destination', undefined,
    mode, 0,
    mode === 'hired_van' ? 'Ride a hired van to your destination'
      : mode === 'motorbike' ? 'Ride a motorcycle to your destination'
      : 'Drive to your destination',
    'distance'
  );
  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: 0,
    summary: mode === 'hired_van' ? 'Hired Van' : mode === 'motorbike' ? 'Motorbike' : 'Private Car',
  };
}

async function routeTaxi(
  startLat: number, startLon: number, endLat: number, endLon: number,
  fares: Map<string, FareConfig>
): Promise<MultiModalRoute> {
  // Compute rough distance first for fare estimate
  const roughDist = haversine(startLat, startLon, endLat, endLon);
  const fare = calculateFare(fares, 'taxi', roughDist);
  const leg = await buildLeg(
    startLat, startLon, 'Starting Point', undefined,
    endLat, endLon, 'Destination', undefined,
    'taxi', fare,
    'Take a taxi / Grab to your destination',
    'time'
  );
  // Recalculate fare with actual road distance
  const actualFare = calculateFare(fares, 'taxi', leg.distance);
  leg.fare = actualFare;
  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: actualFare,
    summary: 'Taxi',
  };
}

async function routeHabalHabal(
  startLat: number, startLon: number, endLat: number, endLon: number,
  fares: Map<string, FareConfig>
): Promise<MultiModalRoute> {
  const roughDist = haversine(startLat, startLon, endLat, endLon);
  const fare = calculateFare(fares, 'habal_habal', roughDist);
  const leg = await buildLeg(
    startLat, startLon, 'Starting Point', undefined,
    endLat, endLon, 'Destination', undefined,
    'habal_habal', fare,
    'Ride a Habal-Habal (motorcycle taxi) to your destination',
    'distance'
  );
  const actualFare = calculateFare(fares, 'habal_habal', leg.distance);
  leg.fare = actualFare;
  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: actualFare,
    summary: 'Habal-Habal',
  };
}

async function routeBusCommute(
  startLat: number, startLon: number, endLat: number, endLon: number,
  fares: Map<string, FareConfig>
): Promise<MultiModalRoute> {
  const warnings: string[] = [];
  const legs: TransportLeg[] = [];

  // 1. Find nearest bus stops to start and end
  const startStop = await findNearestBusStop(startLat, startLon, 2.0);
  const endStop   = await findNearestBusStop(endLat, endLon, 2.0);

  if (!startStop) {
    warnings.push('No bus stop found within 2 km of start — routing by taxi instead');
    return { ...(await routeTaxi(startLat, startLon, endLat, endLon, fares)), warnings };
  }
  if (!endStop) {
    warnings.push('No bus stop found within 2 km of destination — routing by taxi instead');
    return { ...(await routeTaxi(startLat, startLon, endLat, endLon, fares)), warnings };
  }

  // Degenerate: same stop for start and end — use tricycle directly
  if (startStop.id === endStop.id) {
    const dist = haversine(startLat, startLon, endLat, endLon);
    const fare = calculateFare(fares, 'tricycle', dist);
    const leg = await buildLeg(
      startLat, startLon, 'Starting Point', undefined,
      endLat, endLon, 'Destination', undefined,
      'tricycle', fare, 'Ride a tricycle to your destination'
    );
    leg.fare = calculateFare(fares, 'tricycle', leg.distance);
    return {
      legs: [leg],
      totalDistance: leg.distance, totalDuration: leg.duration, totalFare: leg.fare,
      summary: 'Tricycle', warnings: ['Destination is close — no bus transfer needed'],
    };
  }

  // 2. Leg A — start → nearest bus stop (walk or tricycle)
  const distToStartStop = haversine(startLat, startLon, startStop.lat, startStop.lon);
  if (distToStartStop > 5.0) {
    warnings.push('Nearest bus stop is over 5 km from start — routing by taxi instead');
    return { ...(await routeTaxi(startLat, startLon, endLat, endLon, fares)), warnings };
  }
  const modeA = lastMileMode(distToStartStop);
  const fareA = modeA === 'walk' ? 0 : calculateFare(fares, 'tricycle', distToStartStop);
  const legA = await buildLeg(
    startLat, startLon, 'Starting Point', undefined,
    startStop.lat, startStop.lon, startStop.name, startStop.type,
    modeA, fareA,
    modeA === 'walk'
      ? `Walk to ${startStop.name}`
      : `Ride a tricycle to ${startStop.name}`
  );
  legA.fare = modeA === 'walk' ? 0 : calculateFare(fares, 'tricycle', legA.distance);
  legs.push(legA);

  // 3. Leg B — bus stop to bus stop
  const busLeg = await buildLeg(
    startStop.lat, startStop.lon, startStop.name, startStop.type,
    endStop.lat, endStop.lon, endStop.name, endStop.type,
    'bus',
    calculateFare(fares, 'bus', haversine(startStop.lat, startStop.lon, endStop.lat, endStop.lon)),
    `Take a bus from ${startStop.name} to ${endStop.name}`,
    'time'
  );
  busLeg.fare = calculateFare(fares, 'bus', busLeg.distance);
  legs.push(busLeg);

  // 4. Leg C — bus stop → destination (walk or tricycle)
  const distToEnd = haversine(endStop.lat, endStop.lon, endLat, endLon);
  if (distToEnd > 3.0) {
    warnings.push(`Destination is ${distToEnd.toFixed(1)} km from nearest bus stop — tricycle required`);
  }
  const modeC = lastMileMode(distToEnd);
  const legC = await buildLeg(
    endStop.lat, endStop.lon, endStop.name, endStop.type,
    endLat, endLon, 'Destination', undefined,
    modeC,
    modeC === 'walk' ? 0 : calculateFare(fares, 'tricycle', distToEnd),
    modeC === 'walk' ? 'Walk to your destination' : 'Ride a tricycle to your destination'
  );
  legC.fare = modeC === 'walk' ? 0 : calculateFare(fares, 'tricycle', legC.distance);
  legs.push(legC);

  const totalDistance = legs.reduce((s, l) => s + l.distance, 0);
  const totalDuration = legs.reduce((s, l) => s + l.duration, 0);
  const totalFare = legs.reduce((s, l) => s + l.fare, 0);

  return {
    legs,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalDuration: Math.round(totalDuration),
    totalFare: Math.round(totalFare * 100) / 100,
    summary: buildSummary(legs),
    warnings,
  };
}

async function routeFerry(
  startLat: number, startLon: number, endLat: number, endLon: number,
  fares: Map<string, FareConfig>
): Promise<MultiModalRoute> {
  const warnings: string[] = [];
  const legs: TransportLeg[] = [];

  // 1. Find nearest pier to start and end
  const departurePier = await findNearestPier(startLat, startLon, 10.0);
  const arrivalPier   = await findNearestPier(endLat, endLon, 10.0);

  if (!departurePier || !arrivalPier) {
    warnings.push('No pier found near start or destination — routing by car instead');
    return { ...(await routePrivateCar(startLat, startLon, endLat, endLon)), warnings };
  }
  if (departurePier.id === arrivalPier.id) {
    warnings.push('Same pier found for start and destination — destination may not be an island');
    return { ...(await routePrivateCar(startLat, startLon, endLat, endLon)), warnings };
  }

  // 2. Leg A — start → departure pier (tricycle or car based on distance)
  const distToPier = haversine(startLat, startLon, departurePier.lat, departurePier.lon);
  const modeA = distToPier < 0.3 ? 'walk' : distToPier < 5.0 ? 'tricycle' : 'private_car';
  const fareA = modeA === 'walk' ? 0
    : modeA === 'tricycle' ? calculateFare(fares, 'tricycle', distToPier)
    : 0; // private_car: own vehicle
  const legA = await buildLeg(
    startLat, startLon, 'Starting Point', undefined,
    departurePier.lat, departurePier.lon, departurePier.name, 'pier',
    modeA as TransportLeg['mode'], fareA,
    modeA === 'walk' ? `Walk to ${departurePier.name}`
      : modeA === 'tricycle' ? `Ride a tricycle to ${departurePier.name}`
      : `Drive to ${departurePier.name}`
  );
  legA.fare = modeA === 'tricycle' ? calculateFare(fares, 'tricycle', legA.distance)
    : modeA === 'walk' ? 0 : 0;
  legs.push(legA);

  // 3. Leg B — ferry pier to pier (A* routes through ferry roads in graph)
  const ferryLeg = await buildLeg(
    departurePier.lat, departurePier.lon, departurePier.name, 'pier',
    arrivalPier.lat, arrivalPier.lon, arrivalPier.name, 'pier',
    'ferry',
    calculateFare(fares, 'ferry', haversine(departurePier.lat, departurePier.lon, arrivalPier.lat, arrivalPier.lon)),
    `Take the ferry from ${departurePier.name} to ${arrivalPier.name}`,
    'time'
  );
  ferryLeg.fare = calculateFare(fares, 'ferry', ferryLeg.distance);
  legs.push(ferryLeg);

  // 4. Leg C — arrival pier → destination
  const distFromPier = haversine(arrivalPier.lat, arrivalPier.lon, endLat, endLon);
  const modeC = distFromPier < 0.3 ? 'walk' : 'tricycle';
  const legC = await buildLeg(
    arrivalPier.lat, arrivalPier.lon, arrivalPier.name, 'pier',
    endLat, endLon, 'Destination', undefined,
    modeC,
    modeC === 'walk' ? 0 : calculateFare(fares, 'tricycle', distFromPier),
    modeC === 'walk' ? 'Walk to your destination' : 'Ride a tricycle to your destination'
  );
  legC.fare = modeC === 'walk' ? 0 : calculateFare(fares, 'tricycle', legC.distance);
  legs.push(legC);

  const totalDistance = legs.reduce((s, l) => s + l.distance, 0);
  const totalDuration = legs.reduce((s, l) => s + l.duration, 0);
  const totalFare = legs.reduce((s, l) => s + l.fare, 0);

  return {
    legs,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalDuration: Math.round(totalDuration),
    totalFare: Math.round(totalFare * 100) / 100,
    summary: buildSummary(legs),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Calculate a multi-modal route between two GPS coordinates.
 * Each transport mode returns a MultiModalRoute with typed legs and fare estimates.
 */
export async function calculateMultiModalRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  transportMode: TransportMode,
  optimizeFor: 'distance' | 'time' = 'time'
): Promise<MultiModalRoute> {
  const fares = await loadFareConfigs();

  switch (transportMode) {
    case 'walk':
      return routeWalk(startLat, startLon, endLat, endLon);

    case 'private_car':
      return routePrivateCar(startLat, startLon, endLat, endLon, 'private_car');

    case 'hired_van':
      return routePrivateCar(startLat, startLon, endLat, endLon, 'hired_van');

    case 'motorbike':
    case 'habal_habal':
      return routeHabalHabal(startLat, startLon, endLat, endLon, fares);

    case 'taxi':
      return routeTaxi(startLat, startLon, endLat, endLon, fares);

    case 'bus_commute':
      return routeBusCommute(startLat, startLon, endLat, endLon, fares);

    case 'ferry':
      return routeFerry(startLat, startLon, endLat, endLon, fares);

    default:
      // Unknown mode — fall back to private car with a warning
      const result = await routePrivateCar(startLat, startLon, endLat, endLon, 'private_car');
      result.warnings = [`Unknown transport mode '${transportMode}' — defaulted to private car`];
      return result;
  }
}
