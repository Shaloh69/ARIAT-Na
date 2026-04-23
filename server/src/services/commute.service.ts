/**
 * Commute Routing Service
 *
 * Builds multi-leg routes for "Commute" mode.
 *
 * Two sub-modes:
 *   saver     — chains walk → corridor_stops (bus/jeep) → corridor_anywhere
 *               (tricycle/habal) → direct_fare (maxim) → taxi fallback
 *   grab_taxi — single direct_fare leg using the best available ride-hailing
 *               mode (admin-configurable via fare_configs)
 *
 * Ferry is injected automatically (both modes) when A* finds no road path.
 *
 * All mode priorities and fares are driven by fare_configs — no transport
 * type is hardcoded beyond the routing_behavior grouping.
 */

import { pool } from "../config/database";
import { calculateRoute } from "./pathfinding.service";
import { TransportLeg } from "./multimodal.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommuteSubMode = "saver" | "grab_taxi";

interface FareRow {
  transport_type: string;
  display_name: string;
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  peak_hour_multiplier: number;
  routing_behavior: string;
  display_order: number;
}

interface StopNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  point_type: string;
}

export interface CommuteRoute {
  legs: TransportLeg[];
  totalDistance: number;   // km
  totalDuration: number;   // minutes
  totalFare: number;       // PHP
  summary: string;         // "Walk → Tricycle → Bus → Walk"
  subMode: CommuteSubMode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function calcFare(row: FareRow, distKm: number): number {
  const raw = row.base_fare + row.per_km_rate * distKm;
  const withMin = Math.max(row.minimum_fare, raw);
  // Apply peak multiplier only for direct_fare modes
  const multiplier =
    row.routing_behavior === "direct_fare" ? (row.peak_hour_multiplier ?? 1) : 1;
  return Math.round(withMin * multiplier * 100) / 100;
}

/** Linear interpolation — returns the point distKm along the line from→to. */
function interpolatePoint(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  distKm: number,
): { lat: number; lon: number } {
  const total = haversine(fromLat, fromLon, toLat, toLon);
  if (total === 0 || distKm >= total) return { lat: toLat, lon: toLon };
  const t = distKm / total;
  return { lat: fromLat + (toLat - fromLat) * t, lon: fromLon + (toLon - fromLon) * t };
}

/** Soft max range per corridor_anywhere mode — keeps legs reasonably sized. */
function maxRangeKm(transportType: string, row: FareRow): number {
  const known: Record<string, number> = {
    tricycle: 5,
    habal_habal: 15,
  };
  if (known[transportType]) return known[transportType];
  // Heuristic for unknown admin-added modes: ₱200 worth of travel, capped at 50 km
  return row.per_km_rate > 0 ? Math.min(200 / row.per_km_rate, 50) : 20;
}

/** Load all active fare configs ordered by display_order (cheapest-first). */
async function loadFares(): Promise<FareRow[]> {
  const [rows]: any = await pool.execute(
    `SELECT transport_type, display_name, base_fare, per_km_rate,
            minimum_fare, peak_hour_multiplier, routing_behavior, display_order
     FROM fare_configs
     WHERE is_active = TRUE
     ORDER BY display_order ASC`,
  );
  return rows as FareRow[];
}

/**
 * Load all transit-accessible stop nodes (bus_stop, bus_terminal)
 * within maxKm of a position.  Returns sorted nearest-first.
 */
async function findBusStopsNear(
  lat: number,
  lon: number,
  maxKm: number,
): Promise<StopNode[]> {
  const [rows]: any = await pool.execute(
    `SELECT id, name, latitude AS lat, longitude AS lon, point_type
     FROM intersections
     WHERE point_type IN ('bus_stop','bus_terminal')`,
  );
  return (rows as any[])
    .map((r: any) => ({ ...r, _dist: haversine(lat, lon, r.lat, r.lon) }))
    .filter((r: any) => r._dist <= maxKm)
    .sort((a: any, b: any) => a._dist - b._dist) as StopNode[];
}

/**
 * Find the nearest bus_stop that is also "toward" the destination —
 * i.e. the stop is closer to the destination than the current position is.
 */
async function findBusStopToward(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  maxKm: number,
): Promise<StopNode | null> {
  const stops = await findBusStopsNear(fromLat, fromLon, maxKm);
  const distTotal = haversine(fromLat, fromLon, toLat, toLon);
  // Keep only stops that bring us meaningfully closer (≥ 10 % progress)
  const useful = stops.filter(
    (s) => haversine(s.lat, s.lon, toLat, toLon) < distTotal * 0.9,
  );
  return useful[0] ?? null;
}

/**
 * Find the nearest road-graph node for a corridor_anywhere route.
 * Collects every start/end intersection from the route's road_ids.
 * Falls back to stop_ids if road_ids yield no nodes.
 *
 * destLat/destLon (optional): when provided, only considers nodes that make
 * forward progress toward the destination — i.e. the node must be closer to
 * the destination than the caller's position.  This prevents picking a board
 * point that requires the user to backtrack away from their destination.
 * If no forward-progress node exists the filter is relaxed (all nodes used).
 */
async function findNearestRoadNodeOnRoute(
  lat: number,
  lon: number,
  roadIds: string[],
  stopIds: string[],
  destLat?: number,
  destLon?: number,
): Promise<StopNode | null> {
  let nodeIds: string[] = [];
  if (roadIds.length) {
    const placeholders = roadIds.map(() => "?").join(",");
    const [roadRows]: any = await pool.execute(
      `SELECT start_intersection_id, end_intersection_id
       FROM roads WHERE id IN (${placeholders}) AND is_active = TRUE`,
      roadIds,
    );
    const seen = new Set<string>();
    for (const r of roadRows as any[]) {
      if (r.start_intersection_id) seen.add(r.start_intersection_id);
      if (r.end_intersection_id)   seen.add(r.end_intersection_id);
    }
    nodeIds = Array.from(seen);
  }

  if (!nodeIds.length) nodeIds = [...stopIds];
  if (!nodeIds.length) return null;

  const nodePlaceholders = nodeIds.map(() => "?").join(",");
  const [rows]: any = await pool.execute(
    `SELECT id, name, latitude AS lat, longitude AS lon, point_type
     FROM intersections WHERE id IN (${nodePlaceholders})`,
    nodeIds,
  );

  let candidates = rows as any[];

  // Forward-progress filter: only keep nodes closer to destination than caller.
  // 5 % tolerance handles minor detours near the user's position.
  if (destLat !== undefined && destLon !== undefined && candidates.length > 0) {
    const userToDest = haversine(lat, lon, destLat, destLon);
    const forward = candidates.filter(
      (n: any) => haversine(n.lat, n.lon, destLat, destLon) <= userToDest * 1.05,
    );
    if (forward.length > 0) candidates = forward; // prefer forward nodes
    // else fall through — relax filter, use all nodes
  }

  let best: StopNode | null = null;
  let bestDist = Infinity;
  for (const r of candidates) {
    const d = haversine(lat, lon, r.lat, r.lon);
    if (d < bestDist) { bestDist = d; best = r as StopNode; }
  }
  return best;
}

/** Find the nearest pier within maxKm. */
async function findNearestPier(
  lat: number,
  lon: number,
  maxKm = 15,
): Promise<StopNode | null> {
  const [rows]: any = await pool.execute(
    `SELECT id, name, latitude AS lat, longitude AS lon, point_type
     FROM intersections WHERE point_type = 'pier'`,
  );
  let best: StopNode | null = null;
  let bestDist = maxKm;
  for (const r of rows as any[]) {
    const d = haversine(lat, lon, r.lat, r.lon);
    if (d < bestDist) { bestDist = d; best = r as StopNode; }
  }
  return best;
}

/**
 * Check whether A* can physically reach the destination over roads.
 * Returns false when pathfinding returns no route (island / water gap).
 */
async function canReachByRoad(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
): Promise<boolean> {
  try {
    const r = await calculateRoute(fromLat, fromLon, toLat, toLon, "distance");
    return r.totalDistance > 0;
  } catch {
    return false;
  }
}

/**
 * Build a single TransportLeg via A* pathfinding.
 * Falls back to straight-line geometry + Haversine ETA if routing fails.
 */
async function buildLeg(
  fromLat: number, fromLon: number, fromName: string,
  toLat: number, toLon: number, toName: string,
  mode: string,
  fare: number,
  instruction: string,
  optimizeFor: "distance" | "time" = "time",
): Promise<TransportLeg> {
  let result: any = null;
  try {
    result = await calculateRoute(fromLat, fromLon, toLat, toLon, optimizeFor);
  } catch { /* fall through */ }

  const distKm  = result?.totalDistance  ?? haversine(fromLat, fromLon, toLat, toLon);
  const speedKmh: Record<string, number> = {
    walk: 5, tricycle: 20, habal_habal: 30, jeepney: 22,
    bus: 25, bus_ac: 25, bus_commute: 25, taxi: 35,
    private_car: 40, ferry: 25,
  };
  const speed     = speedKmh[mode] ?? 25;
  const duration  = result?.estimatedTime ?? Math.max(1, Math.round((distKm / speed) * 60));
  const geometry: [number, number][] = result?.routeGeometry ?? [
    [fromLat, fromLon], [toLat, toLon],
  ];

  return {
    mode: mode as TransportLeg["mode"],
    from: { name: fromName, lat: fromLat, lon: fromLon },
    to:   { name: toName,   lat: toLat,   lon: toLon   },
    distance: Math.round(distKm * 100) / 100,
    duration,
    fare,
    instruction,
    geometry,
  };
}

// ─── Ferry injection ──────────────────────────────────────────────────────────

async function injectFerryLegs(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  fares: FareRow[],
): Promise<TransportLeg[] | null> {
  const ferryFare = fares.find(f => f.transport_type === "ferry");
  if (!ferryFare) return null;

  const srcPier  = await findNearestPier(fromLat, fromLon);
  const destPier = await findNearestPier(toLat, toLon);
  if (!srcPier || !destPier) return null;

  const legs: TransportLeg[] = [];

  // Walk / tricycle to source pier
  const toPierDist = haversine(fromLat, fromLon, srcPier.lat, srcPier.lon);
  if (toPierDist > 0.05) {
    const landMode = toPierDist <= 0.5 ? "walk" : "tricycle";
    const landFare = fares.find(f => f.transport_type === landMode);
    legs.push(await buildLeg(
      fromLat, fromLon, "Current Location",
      srcPier.lat, srcPier.lon, srcPier.name,
      landMode,
      landFare ? calcFare(landFare, toPierDist) : 0,
      `${landMode === "walk" ? "Walk" : "Take a tricycle"} to ${srcPier.name}`,
    ));
  }

  // Ferry crossing
  const ferryDist = haversine(srcPier.lat, srcPier.lon, destPier.lat, destPier.lon);
  legs.push(await buildLeg(
    srcPier.lat, srcPier.lon, srcPier.name,
    destPier.lat, destPier.lon, destPier.name,
    "ferry",
    calcFare(ferryFare, ferryDist),
    `Board ferry at ${srcPier.name}. Arrive at ${destPier.name}`,
  ));

  // From dest pier onward (remaining land legs built by caller)
  return legs;
}

// ─── Transit geometry reconstruction ──────────────────────────────────────────

/**
 * Rebuilds the polyline for a transit leg using the route's road_ids.
 * Builds a mini-graph from those roads and BFS from boardStopId → alightStopId.
 * Returns null when the path cannot be traced (caller should try the next route).
 */
async function buildTransitLegGeometry(
  roadIds: string[],
  boardStopId: string,
  alightStopId: string,
): Promise<[number, number][] | null> {
  if (!roadIds.length) return null;

  const placeholders = roadIds.map(() => "?").join(",");
  const [roadRows]: any = await pool.execute(
    `SELECT id, start_intersection_id, end_intersection_id, path, is_bidirectional
     FROM roads WHERE id IN (${placeholders}) AND is_active = TRUE`,
    roadIds,
  );
  if (!(roadRows as any[]).length) return null;

  type RoadRow = {
    id: string;
    start_intersection_id: string;
    end_intersection_id: string;
    path: [number, number][];
    is_bidirectional: boolean;
  };
  const roads = (roadRows as any[]).map((r): RoadRow => ({
    ...r,
    path: Array.isArray(r.path) ? r.path : JSON.parse(r.path || "[]"),
  }));

  type Edge = { to: string; road: RoadRow; reversed: boolean };
  const adj = new Map<string, Edge[]>();
  for (const road of roads) {
    if (!adj.has(road.start_intersection_id)) adj.set(road.start_intersection_id, []);
    if (!adj.has(road.end_intersection_id))   adj.set(road.end_intersection_id, []);
    adj.get(road.start_intersection_id)!.push({ to: road.end_intersection_id, road, reversed: false });
    if (road.is_bidirectional) {
      adj.get(road.end_intersection_id)!.push({ to: road.start_intersection_id, road, reversed: true });
    }
  }

  // BFS — shortest hop-count path through the mini-graph
  type QItem = { node: string; path: Array<{ road: RoadRow; reversed: boolean }> };
  const queue: QItem[] = [{ node: boardStopId, path: [] }];
  const visited = new Set<string>([boardStopId]);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (node === alightStopId) {
      const geometry: [number, number][] = [];
      for (const { road, reversed } of path) {
        const pts = reversed ? [...road.path].reverse() : road.path;
        geometry.push(...(geometry.length > 0 ? pts.slice(1) : pts));
      }
      return geometry.length >= 2 ? geometry : null;
    }
    for (const edge of adj.get(node) ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ node: edge.to, path: [...path, { road: edge.road, reversed: edge.reversed }] });
      }
    }
  }
  return null;
}

// ─── Transit corridor check ───────────────────────────────────────────────────

/**
 * Find an active transit_route that serves both ends of the trip.
 *
 * corridor_stops  — board AND alight at designated bus stops/terminals only.
 *                   Alight stop must be within 1 km of destination.
 *
 * corridor_anywhere — board AND alight at the nearest road-graph node
 *                     (any intersection endpoint in road_ids) to user /
 *                     destination respectively. The vehicle follows the
 *                     assigned corridor regardless; the user alights at
 *                     the node closest to their destination, then
 *                     walk / ride the remaining gap.
 *                     Feeder legs: walk ≤0.5 km, corridor_anywhere ride,
 *                     or taxi/maxim/grab fallback.
 *
 * BFS mini-graph from road_ids gives road-following geometry.
 * If BFS board→alight fails the route is skipped (wrong direction / gap).
 */
async function tryCorridorRoute(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  allModes: FareRow[],
  corridorAnyModes: FareRow[],
  directFareModes: FareRow[],
): Promise<TransportLeg[] | null> {
  if (allModes.length === 0) return null;

  const MAX_BOARD_KM = 15;
  // Pre-fetch for corridor_stops only — these need a designated stop within 1 km
  const toStopsForFixed = await findBusStopsNear(toLat, toLon, 1.0);

  const fallbackDirect = directFareModes[directFareModes.length - 1];

  for (const mode of allModes) {
    const [routes]: any = await pool.execute(
      `SELECT id, route_name, stop_ids, road_ids, transport_type, pickup_mode
       FROM transit_routes
       WHERE transport_type = ? AND is_active = TRUE`,
      [mode.transport_type],
    );

    for (const route of routes as any[]) {
      const stopIds: string[] = Array.isArray(route.stop_ids)
        ? route.stop_ids
        : typeof route.stop_ids === "string" ? JSON.parse(route.stop_ids || "[]") : [];
      const roadIds: string[] = Array.isArray(route.road_ids)
        ? route.road_ids
        : typeof route.road_ids === "string" ? JSON.parse(route.road_ids || "[]") : [];
      const pickupMode = route.pickup_mode as string;

      const effectiveAnywhere =
        pickupMode === "anywhere" || mode.routing_behavior === "corridor_anywhere";

      // ── Determine alight stop ────────────────────────────────────────────
      // corridor_anywhere: nearest road node on THIS route to the destination.
      //   The bus always follows its corridor; user alights at the closest
      //   point on the route to their destination, then covers the last gap.
      // corridor_stops: must be a designated stop within 1 km of destination.
      let alightStop: StopNode;
      if (effectiveAnywhere) {
        const nearestAlight = await findNearestRoadNodeOnRoute(toLat, toLon, roadIds, stopIds);
        if (!nearestAlight) continue;
        alightStop = nearestAlight;
      } else {
        if (!toStopsForFixed.length) continue;
        const alightCandidate = toStopsForFixed.find(s => stopIds.includes(s.id));
        if (!alightCandidate) continue;
        alightStop = alightCandidate;
      }

      // ── Determine board stop ─────────────────────────────────────────────
      let boardStop: StopNode;
      let boardDist = 0;
      if (effectiveAnywhere) {
        // Nearest road-graph node to user that makes FORWARD PROGRESS toward
        // destination — prevents routing the user away from their destination
        // to reach a board point, then back again (backtracking).
        const nearestNode = await findNearestRoadNodeOnRoute(
          fromLat, fromLon, roadIds, stopIds, toLat, toLon,
        );
        if (!nearestNode) continue;
        boardStop = nearestNode;
        boardDist = haversine(fromLat, fromLon, boardStop.lat, boardStop.lon);
      } else {
        const fromStops = await findBusStopsNear(fromLat, fromLon, MAX_BOARD_KM);
        const candidate = fromStops.find(s => stopIds.includes(s.id));
        if (!candidate) continue;
        boardStop = candidate;
        boardDist = haversine(fromLat, fromLon, boardStop.lat, boardStop.lon);
      }
      if (boardStop.id === alightStop.id) continue;

      // Local feeder modes: short-range transport (tricycle ≤5 km, habal ≤15 km)
      // that can pick up door-to-door from any position.
      // Corridor buses (Odutco, Jeepney — maxRange ~50 km) are excluded because
      // they run fixed routes and cannot be booked as point-to-point feeders.
      const LOCAL_FEEDER_MAX_KM = 20;
      const localFeedModes = corridorAnyModes.filter(
        m => maxRangeKm(m.transport_type, m) <= LOCAL_FEEDER_MAX_KM,
      );

      const legs: TransportLeg[] = [];

      // ── Leg A: reach the board stop ─────────────────────────────────────
      if (boardDist > 0.05) {
        if (boardDist <= 0.5) {
          legs.push(await buildLeg(
            fromLat, fromLon, "Current Location",
            boardStop.lat, boardStop.lon, boardStop.name,
            "walk", 0,
            `Walk ${Math.round(boardDist * 1000)}m to board near ${boardStop.name}`,
          ));
        } else {
          const rideToStop = localFeedModes.find(
            m => boardDist <= maxRangeKm(m.transport_type, m),
          );
          if (rideToStop) {
            legs.push(await buildLeg(
              fromLat, fromLon, "Current Location",
              boardStop.lat, boardStop.lon, boardStop.name,
              rideToStop.transport_type,
              calcFare(rideToStop, boardDist),
              `Hail a ${rideToStop.display_name} to board near ${boardStop.name}. Fare: ₱${calcFare(rideToStop, boardDist).toFixed(0)}`,
            ));
          } else if (fallbackDirect) {
            legs.push(await buildLeg(
              fromLat, fromLon, "Current Location",
              boardStop.lat, boardStop.lon, boardStop.name,
              fallbackDirect.transport_type,
              calcFare(fallbackDirect, boardDist),
              `Book a ${fallbackDirect.display_name} to board near ${boardStop.name}. Fare: ₱${calcFare(fallbackDirect, boardDist).toFixed(0)}`,
            ));
          } else {
            continue; // Can't reach board stop — try next route
          }
        }
      }

      // ── Leg B: transit leg with reconstructed geometry ──────────────────
      const transitDist = haversine(boardStop.lat, boardStop.lon, alightStop.lat, alightStop.lon);
      let transitGeometry: [number, number][] | null = null;

      if (roadIds.length > 0) {
        transitGeometry = await buildTransitLegGeometry(roadIds, boardStop.id, alightStop.id);
        if (!transitGeometry) continue; // mini-graph failed — try next route
      }

      const transitSpeeds: Record<string, number> = {
        bus: 25, bus_ac: 25, bus_commute: 25, jeepney: 22,
      };
      legs.push({
        mode: mode.transport_type as TransportLeg["mode"],
        from: { name: boardStop.name, lat: boardStop.lat, lon: boardStop.lon },
        to:   { name: alightStop.name, lat: alightStop.lat, lon: alightStop.lon },
        distance: Math.round(transitDist * 100) / 100,
        duration: Math.max(1, Math.round((transitDist / (transitSpeeds[mode.transport_type] ?? 22)) * 60)),
        fare: calcFare(mode, transitDist),
        instruction: `Board ${mode.display_name} (${route.route_name}) at ${boardStop.name}. Alight at ${alightStop.name}`,
        geometry: transitGeometry ?? [[boardStop.lat, boardStop.lon], [alightStop.lat, alightStop.lon]],
      });

      // ── Leg C: alight stop → destination ────────────────────────────────
      const alightToDest = haversine(alightStop.lat, alightStop.lon, toLat, toLon);
      if (alightToDest > 0.05) {
        if (alightToDest <= 0.5) {
          legs.push(await buildLeg(
            alightStop.lat, alightStop.lon, alightStop.name,
            toLat, toLon, "Destination", "walk", 0,
            `Walk ${Math.round(alightToDest * 1000)}m to your destination`,
          ));
        } else {
          // Use local feeder only (tricycle/habal) — not corridor buses
          const finalRide = localFeedModes.find(
            m => alightToDest <= maxRangeKm(m.transport_type, m),
          );
          if (finalRide) {
            legs.push(await buildLeg(
              alightStop.lat, alightStop.lon, alightStop.name,
              toLat, toLon, "Destination",
              finalRide.transport_type, calcFare(finalRide, alightToDest),
              `Hail a ${finalRide.display_name} to your destination. Fare: ₱${calcFare(finalRide, alightToDest).toFixed(0)}`,
            ));
          } else if (fallbackDirect) {
            legs.push(await buildLeg(
              alightStop.lat, alightStop.lon, alightStop.name,
              toLat, toLon, "Destination",
              fallbackDirect.transport_type, calcFare(fallbackDirect, alightToDest),
              `Book a ${fallbackDirect.display_name} to your destination. Fare: ₱${calcFare(fallbackDirect, alightToDest).toFixed(0)}`,
            ));
          }
          // If no mode available, remaining distance handled by the outer saver loop
        }
      }

      return legs;
    }
  }
  return null;
}

// ─── Saver algorithm ─────────────────────────────────────────────────────────

async function buildSaverRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
): Promise<TransportLeg[]> {
  const fares = await loadFares();

  // Group modes by behavior, sorted cheapest-first (display_order)
  const corridorStopModes   = fares.filter(f => f.routing_behavior === "corridor_stops");
  const corridorAnyModes    = fares.filter(f => f.routing_behavior === "corridor_anywhere");
  const directFareModes     = fares.filter(f => f.routing_behavior === "direct_fare");
  // Taxi/grab = highest display_order direct_fare (last resort)
  const taxiMode = directFareModes[directFareModes.length - 1] ?? {
    transport_type: "taxi", display_name: "Taxi/Grab",
    base_fare: 40, per_km_rate: 13.5, minimum_fare: 40,
    peak_hour_multiplier: 1.2, routing_behavior: "direct_fare", display_order: 99,
  } as FareRow;

  const legs: TransportLeg[] = [];
  let curLat = startLat;
  let curLon = startLon;
  let curName = "Current Location";

  const MAX_LEGS = 10;

  for (let i = 0; i < MAX_LEGS; i++) {
    const remaining = haversine(curLat, curLon, endLat, endLon);

    // ── 1. Walk if close enough (or already arrived) ───────────────────────
    if (remaining <= 0.05) break; // already at destination — no ghost walk leg
    if (remaining <= 0.5) {
      legs.push(await buildLeg(
        curLat, curLon, curName,
        endLat, endLon, "Destination",
        "walk", 0,
        `Walk ${Math.round(remaining * 1000)}m to your destination`,
      ));
      break;
    }

    // ── 2. Ferry if road unreachable ────────────────────────────────────────
    if (i === 0) {
      const reachable = await canReachByRoad(curLat, curLon, endLat, endLon);
      if (!reachable) {
        const ferryLegs = await injectFerryLegs(curLat, curLon, endLat, endLon, fares);
        if (ferryLegs && ferryLegs.length > 0) {
          legs.push(...ferryLegs);
          // Continue from the dest pier
          const lastPierLeg = ferryLegs[ferryLegs.length - 1];
          curLat  = lastPierLeg.to.lat;
          curLon  = lastPierLeg.to.lon;
          curName = lastPierLeg.to.name;
          continue;
        }
      }
    }

    // ── 3. Try transit routes — both corridor_stops and corridor_anywhere ──
    const corridorResult = await tryCorridorRoute(
      curLat, curLon, endLat, endLon,
      [...corridorStopModes, ...corridorAnyModes], corridorAnyModes, directFareModes,
    );
    if (corridorResult) {
      legs.push(...corridorResult);
      const last = corridorResult[corridorResult.length - 1];
      curLat  = last.to.lat;
      curLon  = last.to.lon;
      curName = last.to.name;
      continue;
    }

    // ── 4. corridor_anywhere — board/alight at any road point ──────────────
    //    No fixed bus stops needed; vehicles pick up and drop off anywhere.
    //    If remaining distance fits within a mode's range, go directly.
    //    Otherwise take the longest-range mode partway and loop again.
    if (corridorAnyModes.length > 0) {
      const exactMode = corridorAnyModes.find(
        m => remaining <= maxRangeKm(m.transport_type, m),
      );

      if (exactMode) {
        legs.push(await buildLeg(
          curLat, curLon, curName,
          endLat, endLon, "Destination",
          exactMode.transport_type,
          calcFare(exactMode, remaining),
          `Hail a ${exactMode.display_name} to your destination. Fare: ₱${calcFare(exactMode, remaining).toFixed(0)}`,
        ));
        break;
      }

      // Partial leg — ride the longest-range mode as far as it goes
      const longMode = corridorAnyModes[corridorAnyModes.length - 1];
      const legDist  = maxRangeKm(longMode.transport_type, longMode);
      if (legDist <= 0) break; // guard: zero-range config
      const newRemaining = remaining - legDist;
      // If this partial leg barely makes progress (< 5% reduction), skip to direct_fare
      if (newRemaining / remaining > 0.95) break;
      const mid      = interpolatePoint(curLat, curLon, endLat, endLon, legDist);
      legs.push(await buildLeg(
        curLat, curLon, curName,
        mid.lat, mid.lon, "Along the way",
        longMode.transport_type,
        calcFare(longMode, legDist),
        `Hail a ${longMode.display_name}. Fare: ₱${calcFare(longMode, legDist).toFixed(0)}`,
      ));
      curLat  = mid.lat;
      curLon  = mid.lon;
      curName = "Along the way";
      continue;
    }

    // ── 6. Non-taxi direct_fare (maxim, etc.) ───────────────────────────────
    const nonTaxiDirect = directFareModes.filter(
      f => f.transport_type !== taxiMode.transport_type,
    );
    if (nonTaxiDirect.length > 0) {
      const m = nonTaxiDirect[0];
      legs.push(await buildLeg(
        curLat, curLon, curName,
        endLat, endLon, "Destination",
        m.transport_type,
        calcFare(m, remaining),
        `Book a ${m.display_name} to your destination. Fare: ₱${calcFare(m, remaining).toFixed(0)}`,
      ));
      break;
    }

    // ── 7. Taxi / Grab fallback ─────────────────────────────────────────────
    legs.push(await buildLeg(
      curLat, curLon, curName,
      endLat, endLon, "Destination",
      taxiMode.transport_type,
      calcFare(taxiMode, remaining),
      `Book a ${taxiMode.display_name} to your destination. Fare: ₱${calcFare(taxiMode, remaining).toFixed(0)}`,
    ));
    break;
  }

  return legs;
}

// ─── Grab/Taxi sub-mode ───────────────────────────────────────────────────────

async function buildGrabTaxiRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
): Promise<TransportLeg[]> {
  const fares = await loadFares();
  const directFareModes = fares.filter(f => f.routing_behavior === "direct_fare");

  // Ferry injection if island destination
  const reachable = await canReachByRoad(startLat, startLon, endLat, endLon);
  if (!reachable) {
    const ferryLegs = await injectFerryLegs(startLat, startLon, endLat, endLon, fares);
    if (ferryLegs) return ferryLegs;
  }

  // Use the first (cheapest) direct_fare mode available, fallback to taxi config
  const mode = directFareModes[0] ?? {
    transport_type: "taxi", display_name: "Taxi/Grab",
    base_fare: 40, per_km_rate: 13.5, minimum_fare: 40,
    peak_hour_multiplier: 1.2, routing_behavior: "direct_fare", display_order: 99,
  } as FareRow;

  const dist = haversine(startLat, startLon, endLat, endLon);
  return [
    await buildLeg(
      startLat, startLon, "Current Location",
      endLat, endLon, "Destination",
      mode.transport_type,
      calcFare(mode, dist),
      `Book a ${mode.display_name} directly to your destination. Fare: ₱${calcFare(mode, dist).toFixed(0)}`,
    ),
  ];
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function buildCommuteRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
  subMode: CommuteSubMode,
): Promise<CommuteRoute> {
  const legs =
    subMode === "saver"
      ? await buildSaverRoute(startLat, startLon, endLat, endLon)
      : await buildGrabTaxiRoute(startLat, startLon, endLat, endLon);

  const totalDistance = legs.reduce((s, l) => s + l.distance, 0);
  const totalDuration = legs.reduce((s, l) => s + l.duration, 0);
  const totalFare     = legs.reduce((s, l) => s + l.fare, 0);
  const summary       = legs.map(l => l.mode).join(" → ");

  return {
    legs,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalDuration,
    totalFare: Math.round(totalFare * 100) / 100,
    summary,
    subMode,
  };
}
