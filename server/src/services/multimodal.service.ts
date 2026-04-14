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

import { pool } from "../config/database";
import { calculateRoute } from "./pathfinding.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportMode =
  | "private_car"
  | "bus_commute"
  | "taxi"
  | "ferry"
  | "walk"
  | "hired_van"
  | "motorbike"
  | "habal_habal";

export interface TransportLeg {
  mode:
    | "walk"
    | "bus"
    | "jeepney"
    | "tricycle"
    | "taxi"
    | "private_car"
    | "ferry"
    | "hired_van"
    | "motorbike"
    | "habal_habal";
  from: { name: string; lat: number; lon: number; type?: string };
  to: { name: string; lat: number; lon: number; type?: string };
  distance: number; // km
  duration: number; // minutes
  fare: number; // PHP
  instruction: string;
  geometry?: [number, number][]; // [lat, lon] pairs
}

export interface MultiModalRoute {
  legs: TransportLeg[];
  totalDistance: number;
  totalDuration: number;
  totalFare: number;
  summary: string; // e.g. "Tricycle → Bus → Walk"
  warnings?: string[];
}

interface FareConfig {
  transport_type: string;
  display_name: string;
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  peak_hour_multiplier: number;
  routing_behavior:
    | "walk"
    | "private"
    | "direct_fare"
    | "corridor_stops"
    | "corridor_anywhere"
    | "ferry";
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
    "SELECT transport_type, display_name, base_fare, per_km_rate, minimum_fare, peak_hour_multiplier, routing_behavior FROM fare_configs WHERE is_active = TRUE",
  );
  const map = new Map<string, FareConfig>();
  for (const row of rows) {
    map.set(row.transport_type, row as FareConfig);
  }
  return map;
}

/** Calculate fare for a transport type and distance. Returns 0 if type not in config. */
function calculateFare(
  fares: Map<string, FareConfig>,
  transportType: string,
  distanceKm: number,
): number {
  const config = fares.get(transportType);
  if (!config) return 0;
  const raw = config.base_fare + config.per_km_rate * distanceKm;
  const withMin = Math.max(config.minimum_fare, raw);
  return Math.round(withMin * 100) / 100;
}

/** Haversine distance between two GPS coordinates (km). */
function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
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

/** Find nearest bus_stop or bus_terminal within maxKm. Returns null if none found. */
async function findNearestBusStop(
  lat: number,
  lon: number,
  maxKm = 2.0,
): Promise<TransitStop | null> {
  const [rows]: any = await pool.execute(
    "SELECT id, name, latitude, longitude, point_type FROM intersections WHERE point_type IN ('bus_stop','bus_terminal')",
  );
  let nearest: TransitStop | null = null;
  let minDist = maxKm;
  for (const row of rows) {
    const dist = haversine(lat, lon, row.latitude, row.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = {
        id: row.id,
        name: row.name,
        lat: row.latitude,
        lon: row.longitude,
        type: row.point_type,
      };
    }
  }
  return nearest;
}

/** Find nearest pier within maxKm. Returns null if none found. */
async function findNearestPier(
  lat: number,
  lon: number,
  maxKm = 10.0,
): Promise<TransitStop | null> {
  const [rows]: any = await pool.execute(
    "SELECT id, name, latitude, longitude, point_type FROM intersections WHERE point_type = 'pier'",
  );
  let nearest: TransitStop | null = null;
  let minDist = maxKm;
  for (const row of rows) {
    const dist = haversine(lat, lon, row.latitude, row.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = {
        id: row.id,
        name: row.name,
        lat: row.latitude,
        lon: row.longitude,
        type: "pier",
      };
    }
  }
  return nearest;
}

/**
 * Wraps a calculateRoute() result into a TransportLeg.
 * fromName/toName override the start/end labels in the leg.
 */
async function buildLeg(
  fromLat: number,
  fromLon: number,
  fromName: string,
  fromType: string | undefined,
  toLat: number,
  toLon: number,
  toName: string,
  toType: string | undefined,
  mode: TransportLeg["mode"],
  fare: number,
  instruction: string,
  optimizeFor: "distance" | "time" = "distance",
): Promise<TransportLeg> {
  const result = await calculateRoute(
    fromLat,
    fromLon,
    toLat,
    toLon,
    optimizeFor,
  );

  // For walk, override the duration using 5 km/h walking speed
  let duration = result.estimatedTime;
  if (mode === "walk") {
    duration = Math.max(1, Math.round((result.totalDistance / 5) * 60));
  }

  return {
    mode,
    from: { name: fromName, lat: fromLat, lon: fromLon, type: fromType },
    to: { name: toName, lat: toLat, lon: toLon, type: toType },
    distance: Math.round(result.totalDistance * 100) / 100,
    duration,
    fare,
    instruction,
    geometry: result.routeGeometry,
  };
}

/** Decide short-distance last-mile mode: walk (< 0.3km) or tricycle. */
function lastMileMode(distKm: number): "walk" | "tricycle" {
  return distKm < 0.3 ? "walk" : "tricycle";
}

/** Build summary string from leg modes. */
function buildSummary(legs: TransportLeg[]): string {
  const labels: Record<string, string> = {
    walk: "Walk",
    bus: "Bus",
    jeepney: "Jeepney",
    tricycle: "Tricycle",
    taxi: "Taxi",
    private_car: "Car",
    ferry: "Ferry",
    hired_van: "Van",
    motorbike: "Motorbike",
    habal_habal: "Habal-Habal",
  };
  // Deduplicate consecutive same modes
  const parts: string[] = [];
  for (const leg of legs) {
    const label = labels[leg.mode] ?? leg.mode;
    if (parts[parts.length - 1] !== label) parts.push(label);
  }
  return parts.join(" → ");
}

// ---------------------------------------------------------------------------
// Mode-specific routing functions
// ---------------------------------------------------------------------------

async function routeWalk(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): Promise<MultiModalRoute> {
  const dist = haversine(startLat, startLon, endLat, endLon);
  const leg = await buildLeg(
    startLat,
    startLon,
    "Starting Point",
    undefined,
    endLat,
    endLon,
    "Destination",
    undefined,
    "walk",
    0,
    "Walk to your destination",
  );
  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: 0,
    summary: "Walk",
    warnings:
      dist > 3
        ? ["Walking distance is over 3 km — consider another transport mode"]
        : [],
  };
}

async function routePrivateCar(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  mode: "private_car" | "hired_van" | "motorbike" = "private_car",
): Promise<MultiModalRoute> {
  const leg = await buildLeg(
    startLat,
    startLon,
    "Starting Point",
    undefined,
    endLat,
    endLon,
    "Destination",
    undefined,
    mode,
    0,
    mode === "hired_van"
      ? "Ride a hired van to your destination"
      : mode === "motorbike"
        ? "Ride a motorcycle to your destination"
        : "Drive to your destination",
    "distance",
  );
  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: 0,
    summary:
      mode === "hired_van"
        ? "Hired Van"
        : mode === "motorbike"
          ? "Motorbike"
          : "Private Car",
  };
}

/**
 * routeDirectFare — generic door-to-door with fare (taxi, Grab, any new type).
 * Works for any transport_type that has a fare config with routing_behavior = 'direct_fare'.
 */
async function routeDirectFare(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  transportType: string,
  fares: Map<string, FareConfig>,
): Promise<MultiModalRoute> {
  const fc = fares.get(transportType);
  const displayName = fc?.display_name ?? transportType;
  const roughDist = haversine(startLat, startLon, endLat, endLon);
  const roughFare = calculateFare(fares, transportType, roughDist);

  const leg = await buildLeg(
    startLat,
    startLon,
    "Starting Point",
    undefined,
    endLat,
    endLon,
    "Destination",
    undefined,
    transportType as TransportLeg["mode"],
    roughFare,
    `Take a ${displayName} to your destination`,
    "time",
  );
  leg.fare = calculateFare(fares, transportType, leg.distance);

  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalDuration: leg.duration,
    totalFare: leg.fare,
    summary: displayName,
  };
}

/**
 * routeCorridor — generic fixed-route transit for any corridor-based transport type.
 * Covers both 'corridor_stops' (board only at stops) and 'corridor_anywhere' (flag from road).
 * Works for jeepney, bus, bus_ac, tricycle, habal_habal, and any new type added via fare config.
 */
async function routeCorridor(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  transportType: string,
  pickupMode: "stops_only" | "anywhere",
  fares: Map<string, FareConfig>,
): Promise<MultiModalRoute> {
  const warnings: string[] = [];
  const legs: TransportLeg[] = [];
  const fc = fares.get(transportType);
  const displayName = fc?.display_name ?? transportType;

  // 1. Find matching transit route for this transport type
  const transitRoutes = await loadTransitRoutes(transportType);
  const matched = await findMatchingTransitRoute(
    transitRoutes,
    startLat,
    startLon,
    endLat,
    endLon,
  );

  let boardStop: TransitStop | null = null;
  let alightStop: TransitStop | null = null;

  if (matched) {
    // Use the matched route's stops or road intersections
    const effectivePickup = matched.pickup_mode; // route-level setting overrides default
    if (effectivePickup === "anywhere") {
      const ints = await loadRouteIntersections(matched.road_ids);
      boardStop = ints.reduce<TransitStop | null>(
        (best, i) =>
          !best ||
          haversine(startLat, startLon, i.lat, i.lon) <
            haversine(startLat, startLon, best.lat, best.lon)
            ? i
            : best,
        null,
      );
      alightStop = ints.reduce<TransitStop | null>(
        (best, i) =>
          !best ||
          haversine(endLat, endLon, i.lat, i.lon) <
            haversine(endLat, endLon, best.lat, best.lon)
            ? i
            : best,
        null,
      );
    } else {
      boardStop = await nearestStopOnRoute(startLat, startLon, matched);
      alightStop = await nearestStopOnRoute(endLat, endLon, matched);
    }
    if (!boardStop)
      boardStop = await findNearestBusStop(startLat, startLon, 2.0);
    if (!alightStop) alightStop = await findNearestBusStop(endLat, endLon, 2.0);
    if (matched) warnings.push(`Using route: ${matched.route_name}`);
  } else if (pickupMode === "stops_only") {
    // No matched route — fall back to nearest bus stop globally
    boardStop = await findNearestBusStop(startLat, startLon, 2.0);
    alightStop = await findNearestBusStop(endLat, endLon, 2.0);
  }

  // No stops found at all — fall back to direct fare
  if (!boardStop || !alightStop) {
    warnings.push(
      `No ${displayName} stop found near origin or destination — routing as direct fare`,
    );
    return {
      ...(await routeDirectFare(
        startLat,
        startLon,
        endLat,
        endLon,
        transportType,
        fares,
      )),
      warnings,
    };
  }

  // Same stop — short trip, route directly
  if (boardStop.id === alightStop.id) {
    const leg = await buildLeg(
      startLat,
      startLon,
      "Starting Point",
      undefined,
      endLat,
      endLon,
      "Destination",
      undefined,
      transportType as TransportLeg["mode"],
      calculateFare(
        fares,
        transportType,
        haversine(startLat, startLon, endLat, endLon),
      ),
      `Ride a ${displayName} to your destination`,
    );
    leg.fare = calculateFare(fares, transportType, leg.distance);
    return {
      legs: [leg],
      totalDistance: leg.distance,
      totalDuration: leg.duration,
      totalFare: leg.fare,
      summary: displayName,
      warnings: ["Destination is nearby — direct ride"],
    };
  }

  // Leg A — start → board stop
  const distA = haversine(startLat, startLon, boardStop.lat, boardStop.lon);
  if (distA > 5.0) {
    warnings.push(
      `Board stop is ${distA.toFixed(1)} km away — routing as direct fare`,
    );
    return {
      ...(await routeDirectFare(
        startLat,
        startLon,
        endLat,
        endLon,
        transportType,
        fares,
      )),
      warnings,
    };
  }
  const modeA = lastMileMode(distA);
  const legA = await buildLeg(
    startLat,
    startLon,
    "Starting Point",
    undefined,
    boardStop.lat,
    boardStop.lon,
    boardStop.name,
    boardStop.type,
    modeA,
    modeA === "walk" ? 0 : calculateFare(fares, "tricycle", distA),
    modeA === "walk"
      ? `Walk to ${boardStop.name}`
      : `Ride a tricycle to ${boardStop.name}`,
  );
  legA.fare =
    modeA === "walk" ? 0 : calculateFare(fares, "tricycle", legA.distance);
  legs.push(legA);

  // Leg B — transit leg (A* routes through road graph, respects one-way)
  const transitLeg = await buildLeg(
    boardStop.lat,
    boardStop.lon,
    boardStop.name,
    boardStop.type,
    alightStop.lat,
    alightStop.lon,
    alightStop.name,
    alightStop.type,
    transportType as TransportLeg["mode"],
    calculateFare(
      fares,
      transportType,
      haversine(boardStop.lat, boardStop.lon, alightStop.lat, alightStop.lon),
    ),
    matched
      ? `${displayName} (${matched.route_name}) from ${boardStop.name} to ${alightStop.name}`
      : `${displayName} from ${boardStop.name} to ${alightStop.name}`,
    "time",
  );
  transitLeg.fare = calculateFare(fares, transportType, transitLeg.distance);
  legs.push(transitLeg);

  // Leg C — alight stop → destination
  const distC = haversine(alightStop.lat, alightStop.lon, endLat, endLon);
  if (distC > 3.0)
    warnings.push(
      `Destination is ${distC.toFixed(1)} km from alight stop — tricycle required`,
    );
  const modeC = lastMileMode(distC);
  const legC = await buildLeg(
    alightStop.lat,
    alightStop.lon,
    alightStop.name,
    alightStop.type,
    endLat,
    endLon,
    "Destination",
    undefined,
    modeC,
    modeC === "walk" ? 0 : calculateFare(fares, "tricycle", distC),
    modeC === "walk"
      ? "Walk to your destination"
      : "Ride a tricycle to your destination",
  );
  legC.fare =
    modeC === "walk" ? 0 : calculateFare(fares, "tricycle", legC.distance);
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
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  fares: Map<string, FareConfig>,
): Promise<MultiModalRoute> {
  const warnings: string[] = [];
  const legs: TransportLeg[] = [];

  // 1. Find nearest pier to start and end
  const departurePier = await findNearestPier(startLat, startLon, 10.0);
  const arrivalPier = await findNearestPier(endLat, endLon, 10.0);

  if (!departurePier || !arrivalPier) {
    warnings.push(
      "No pier found near start or destination — routing by car instead",
    );
    return {
      ...(await routePrivateCar(startLat, startLon, endLat, endLon)),
      warnings,
    };
  }
  if (departurePier.id === arrivalPier.id) {
    warnings.push(
      "Same pier found for start and destination — destination may not be an island",
    );
    return {
      ...(await routePrivateCar(startLat, startLon, endLat, endLon)),
      warnings,
    };
  }

  // 2. Leg A — start → departure pier (tricycle or car based on distance)
  const distToPier = haversine(
    startLat,
    startLon,
    departurePier.lat,
    departurePier.lon,
  );
  const modeA =
    distToPier < 0.3 ? "walk" : distToPier < 5.0 ? "tricycle" : "private_car";
  const fareA =
    modeA === "walk"
      ? 0
      : modeA === "tricycle"
        ? calculateFare(fares, "tricycle", distToPier)
        : 0; // private_car: own vehicle
  const legA = await buildLeg(
    startLat,
    startLon,
    "Starting Point",
    undefined,
    departurePier.lat,
    departurePier.lon,
    departurePier.name,
    "pier",
    modeA as TransportLeg["mode"],
    fareA,
    modeA === "walk"
      ? `Walk to ${departurePier.name}`
      : modeA === "tricycle"
        ? `Ride a tricycle to ${departurePier.name}`
        : `Drive to ${departurePier.name}`,
  );
  legA.fare =
    modeA === "tricycle"
      ? calculateFare(fares, "tricycle", legA.distance)
      : modeA === "walk"
        ? 0
        : 0;
  legs.push(legA);

  // 3. Leg B — ferry pier to pier (A* routes through ferry roads in graph)
  const ferryLeg = await buildLeg(
    departurePier.lat,
    departurePier.lon,
    departurePier.name,
    "pier",
    arrivalPier.lat,
    arrivalPier.lon,
    arrivalPier.name,
    "pier",
    "ferry",
    calculateFare(
      fares,
      "ferry",
      haversine(
        departurePier.lat,
        departurePier.lon,
        arrivalPier.lat,
        arrivalPier.lon,
      ),
    ),
    `Take the ferry from ${departurePier.name} to ${arrivalPier.name}`,
    "time",
  );
  ferryLeg.fare = calculateFare(fares, "ferry", ferryLeg.distance);
  legs.push(ferryLeg);

  // 4. Leg C — arrival pier → destination
  const distFromPier = haversine(
    arrivalPier.lat,
    arrivalPier.lon,
    endLat,
    endLon,
  );
  const modeC = distFromPier < 0.3 ? "walk" : "tricycle";
  const legC = await buildLeg(
    arrivalPier.lat,
    arrivalPier.lon,
    arrivalPier.name,
    "pier",
    endLat,
    endLon,
    "Destination",
    undefined,
    modeC,
    modeC === "walk" ? 0 : calculateFare(fares, "tricycle", distFromPier),
    modeC === "walk"
      ? "Walk to your destination"
      : "Ride a tricycle to your destination",
  );
  legC.fare =
    modeC === "walk" ? 0 : calculateFare(fares, "tricycle", legC.distance);
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
// Transit Route matching helpers
// ---------------------------------------------------------------------------

interface StoredTransitRoute {
  id: string;
  fare_config_id: string;
  route_name: string;
  transport_type: string;
  road_ids: string[]; // parsed from JSON
  stop_ids: string[]; // parsed from JSON — ordered stop intersection IDs
  pickup_mode: "anywhere" | "stops_only";
  color: string;
  is_active: boolean;
}

/** Load active transit routes for a given transport type. */
async function loadTransitRoutes(
  transportType: string,
): Promise<StoredTransitRoute[]> {
  const [rows]: any = await pool.execute(
    "SELECT * FROM transit_routes WHERE transport_type = ? AND is_active = TRUE ORDER BY route_name ASC",
    [transportType],
  );
  return rows.map((r: any) => ({
    ...r,
    road_ids:
      typeof r.road_ids === "string"
        ? JSON.parse(r.road_ids)
        : (r.road_ids ?? []),
    stop_ids:
      typeof r.stop_ids === "string"
        ? JSON.parse(r.stop_ids)
        : (r.stop_ids ?? []),
  }));
}

/**
 * Load the intersection endpoints for all roads in a transit route.
 * Used to determine if origin/dest fall "on" the route.
 */
async function loadRouteIntersections(
  roadIds: string[],
): Promise<TransitStop[]> {
  if (roadIds.length === 0) return [];
  const placeholders = roadIds.map(() => "?").join(", ");
  // Each road has start_intersection_id / end_intersection_id
  const [rows]: any = await pool.execute(
    `SELECT DISTINCT i.id, i.name, i.latitude, i.longitude, i.point_type
     FROM intersections i
     JOIN roads r ON (r.start_intersection_id = i.id OR r.end_intersection_id = i.id)
     WHERE r.id IN (${placeholders})`,
    roadIds,
  );
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    type: r.point_type ?? "intersection",
  }));
}

/**
 * Find the transit route (if any) whose road network covers both origin and dest.
 * A route "covers" a point if any intersection on its roads is within maxKm of that point.
 */
async function findMatchingTransitRoute(
  routes: StoredTransitRoute[],
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  maxKm = 2.0,
): Promise<StoredTransitRoute | null> {
  for (const route of routes) {
    const intersections = await loadRouteIntersections(route.road_ids);
    if (intersections.length === 0) continue;

    const coversStart = intersections.some(
      (i) => haversine(startLat, startLon, i.lat, i.lon) <= maxKm,
    );
    const coversEnd = intersections.some(
      (i) => haversine(endLat, endLon, i.lat, i.lon) <= maxKm,
    );

    if (coversStart && coversEnd) return route;
  }
  return null;
}

/**
 * From the stops on a transit route, find the nearest stop to a given point.
 * For stops_only mode — only considers intersections whose IDs are in stop_ids.
 * Falls back to any transit-type intersection on the route roads if stop_ids is empty.
 */
async function nearestStopOnRoute(
  lat: number,
  lon: number,
  route: StoredTransitRoute,
): Promise<TransitStop | null> {
  const allIntersections = await loadRouteIntersections(route.road_ids);

  // Filter to stops on this route
  let candidates: TransitStop[];
  if (route.stop_ids.length > 0) {
    const stopSet = new Set(route.stop_ids);
    candidates = allIntersections.filter((i) => stopSet.has(i.id));
  } else {
    // Fallback: any bus_stop, bus_terminal, or pier on the route roads
    candidates = allIntersections.filter((i) =>
      ["bus_stop", "bus_terminal", "pier"].includes(i.type),
    );
  }

  if (candidates.length === 0) return null;

  let nearest: TransitStop | null = null;
  let minDist = Infinity;
  for (const c of candidates) {
    const d = haversine(lat, lon, c.lat, c.lon);
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }
  return nearest;
}

// ---------------------------------------------------------------------------
// Main entry point — fully data-driven via routing_behavior on fare_configs
// ---------------------------------------------------------------------------

/**
 * Calculate a multi-modal route between two GPS coordinates.
 *
 * Dispatches based on the fare config's routing_behavior field — NOT a hardcoded
 * switch on transport type. Adding a new fare config with the correct routing_behavior
 * automatically enables routing for it with zero code changes.
 *
 * routing_behavior values:
 *   walk              — on foot, no fare
 *   private           — own vehicle, no fare
 *   direct_fare       — door-to-door with fare (taxi, Grab)
 *   corridor_stops    — fixed route, board at stops/terminals only
 *   corridor_anywhere — fixed route, flag from anywhere on the road
 *   ferry             — pier-to-pier via sea
 */
export async function calculateMultiModalRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  transportMode: string, // accepts any string — new fare configs work automatically
  optimizeFor: "distance" | "time" = "time",
): Promise<MultiModalRoute> {
  const fares = await loadFareConfigs();
  const fc = fares.get(transportMode);

  // Determine routing behavior: from fare config first, then legacy fallbacks
  const behavior = fc?.routing_behavior ?? legacyBehavior(transportMode);

  switch (behavior) {
    case "walk":
      return routeWalk(startLat, startLon, endLat, endLon);

    case "private":
      return routePrivateCar(
        startLat,
        startLon,
        endLat,
        endLon,
        transportMode as any,
      );

    case "direct_fare":
      return routeDirectFare(
        startLat,
        startLon,
        endLat,
        endLon,
        transportMode,
        fares,
      );

    case "corridor_stops":
      return routeCorridor(
        startLat,
        startLon,
        endLat,
        endLon,
        transportMode,
        "stops_only",
        fares,
      );

    case "corridor_anywhere":
      return routeCorridor(
        startLat,
        startLon,
        endLat,
        endLon,
        transportMode,
        "anywhere",
        fares,
      );

    case "ferry":
      return routeFerry(startLat, startLon, endLat, endLon, fares);

    default: {
      const result = await routeDirectFare(
        startLat,
        startLon,
        endLat,
        endLon,
        transportMode,
        fares,
      );
      result.warnings = [
        `Unknown routing behavior for '${transportMode}' — defaulted to direct fare`,
      ];
      return result;
    }
  }
}

/**
 * Fallback behavior for transport types that predate the routing_behavior column.
 * Only needed until migration 008 has been applied to the database.
 */
function legacyBehavior(transportMode: string): FareConfig["routing_behavior"] {
  const map: Record<string, FareConfig["routing_behavior"]> = {
    walk: "walk",
    private_car: "private",
    hired_van: "private",
    motorbike: "private",
    taxi: "direct_fare",
    habal_habal: "corridor_anywhere",
    tricycle: "corridor_anywhere",
    jeepney: "corridor_stops",
    bus: "corridor_stops",
    bus_commute: "corridor_stops",
    bus_ac: "corridor_stops",
    ferry: "ferry",
  };
  return map[transportMode] ?? "direct_fare";
}
