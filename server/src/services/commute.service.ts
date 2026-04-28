/**
 * Commute Routing Service
 *
 * Two sub-modes:
 *   saver     — Transit-first.  Finds the cheapest combination of 1, 2, or 3
 *               transit routes to cover the trip.  Board/alight = nearest road
 *               node on the route corridor for ALL route types (corridor_stops
 *               and corridor_anywhere treated identically — no bus-stop marker
 *               required).  Feeder gaps use walk (≤500 m) or cheapest
 *               direct_fare.  Falls back to direct_fare with note when no
 *               transit route is found.
 *   metered_taxi/grab — Single direct_fare leg using the respective fare config.
 *
 * Ferry is injected automatically when A* finds no road path.
 */

import { pool } from "../config/database";
import { calculateRoute } from "./pathfinding.service";
import { TransportLeg } from "./multimodal.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommuteSubMode = "saver" | "metered_taxi" | "grab";

interface FareRow {
  transport_type: string;
  display_name: string;
  base_fare: number;
  per_km_rate: number;
  per_minute_rate: number;
  minimum_fare: number;
  peak_hour_multiplier: number;
  booking_fee: number;
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

interface RouteRecord {
  id: string;
  route_name: string;
  transport_type: string;
  road_ids: string[];
  stop_ids: string[];
  fare: FareRow;
  nodes: StopNode[];   // all road-graph intersection nodes on this corridor
}

interface ChainLeg {
  route: RouteRecord;
  boardNode: StopNode;
  alightNode: StopNode;
}

interface TransitChain {
  chainLegs: ChainLeg[];
  transfers: { from: StopNode; to: StopNode }[];
  totalFare: number;
}

export interface CommuteRoute {
  legs: TransportLeg[];
  totalDistance: number;
  totalDuration: number;
  totalFare: number;
  fareMax?: number;
  summary: string;
  subMode: CommuteSubMode;
  /** Fare rate components — only present for metered_taxi. Used by the app to
   *  run a client-side meter (base + per-km + per-minute) during navigation. */
  fareConfig?: { baseFare: number; perKmRate: number; perMinuteRate: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BOARD_KM    = 15;   // max feeder distance user → first board node
const MAX_TRANSFER_KM = 5;    // max gap between consecutive transit hops

// ─── Pure helpers ─────────────────────────────────────────────────────────────

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
  const raw     = row.base_fare + row.per_km_rate * distKm;
  const withMin = Math.max(row.minimum_fare, raw);
  if (row.routing_behavior !== "direct_fare") return Math.round(withMin * 100) / 100;
  // Per-minute charge (estimated at 35 km/h average speed in city traffic)
  const perMinRate = row.per_minute_rate ?? 2;
  const estMinutes = Math.ceil(distKm / 35 * 60);
  const subtotal = withMin + perMinRate * estMinutes;
  return Math.round((subtotal + (row.booking_fee ?? 0)) * 100) / 100;
}

/** Peak-hour maximum fare: applies surge multiplier to variable part, keeps booking fee flat. */
function calcFareMax(row: FareRow, distKm: number): number {
  if (row.routing_behavior !== "direct_fare") return calcFare(row, distKm);
  const raw     = row.base_fare + row.per_km_rate * distKm;
  const withMin = Math.max(row.minimum_fare, raw);
  const perMinRate = row.per_minute_rate ?? 2;
  const estMinutes = Math.ceil(distKm / 35 * 60);
  const variable = withMin + perMinRate * estMinutes;
  const surged   = variable * (row.peak_hour_multiplier ?? 1.2);
  return Math.round((surged + (row.booking_fee ?? 0)) * 100) / 100;
}

function feederFare(dist: number, cheapestDirect: FareRow | null): number {
  if (dist <= 0.05) return 0;
  if (dist <= 0.5)  return 0;              // walkable
  if (!cheapestDirect) return Infinity;    // no mode available
  return calcFare(cheapestDirect, dist);
}

function parseJsonArray(value: any): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") return JSON.parse(value || "[]");
  return [];
}

/**
 * In-memory nearest-node finder.
 * When destLat/destLon are provided, applies a forward-progress filter:
 * only considers nodes that are within 5 % of the user-to-dest distance from
 * the destination, preventing backtracking board points.
 */
function findNearestNodeInMemory(
  lat: number, lon: number,
  nodes: StopNode[],
  destLat?: number, destLon?: number,
): StopNode | null {
  if (!nodes.length) return null;

  let candidates = nodes;
  if (destLat !== undefined && destLon !== undefined) {
    const userToDest = haversine(lat, lon, destLat, destLon);
    const forward    = nodes.filter(
      n => haversine(n.lat, n.lon, destLat, destLon) <= userToDest * 1.05,
    );
    if (forward.length > 0) candidates = forward;
  }

  let best = candidates[0];
  let bestDist = haversine(lat, lon, best.lat, best.lon);
  for (let i = 1; i < candidates.length; i++) {
    const d = haversine(lat, lon, candidates[i].lat, candidates[i].lon);
    if (d < bestDist) { bestDist = d; best = candidates[i]; }
  }
  return best;
}

/** O(M × N) search for the nearest pair of nodes between two route corridors. */
function findClosestTransfer(
  nodesA: StopNode[],
  nodesB: StopNode[],
): { a: StopNode; b: StopNode; dist: number } | null {
  if (!nodesA.length || !nodesB.length) return null;

  let bestA = nodesA[0], bestB = nodesB[0];
  let bestDist = haversine(nodesA[0].lat, nodesA[0].lon, nodesB[0].lat, nodesB[0].lon);

  for (const a of nodesA) {
    for (const b of nodesB) {
      const d = haversine(a.lat, a.lon, b.lat, b.lon);
      if (d < bestDist) { bestDist = d; bestA = a; bestB = b; }
    }
  }
  return { a: bestA, b: bestB, dist: bestDist };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadFares(): Promise<FareRow[]> {
  const [rows]: any = await pool.execute(
    `SELECT transport_type, display_name, base_fare, per_km_rate, per_minute_rate,
            minimum_fare, peak_hour_multiplier, booking_fee, routing_behavior, display_order
     FROM fare_configs
     WHERE is_active = TRUE
     ORDER BY display_order ASC`,
  );
  return rows as FareRow[];
}

/**
 * Load all active transit routes with pre-populated road-node sets.
 * 3 bulk DB queries total regardless of how many routes exist.
 */
async function loadAllTransitRoutes(fares: FareRow[]): Promise<RouteRecord[]> {
  const [routeRows]: any = await pool.execute(
    `SELECT id, route_name, transport_type, road_ids, stop_ids
     FROM transit_routes WHERE is_active = TRUE`,
  );
  if (!(routeRows as any[]).length) return [];

  // Collect all road IDs across every route
  const allRoadIds = new Set<string>();
  for (const row of routeRows as any[]) {
    for (const rid of parseJsonArray(row.road_ids)) allRoadIds.add(rid);
  }

  const roadToEndpoints = new Map<string, { start: string; end: string }>();
  const allNodeIds      = new Set<string>();

  if (allRoadIds.size > 0) {
    const roadIdList     = Array.from(allRoadIds);
    const placeholders   = roadIdList.map(() => "?").join(",");
    const [roadRows]: any = await pool.execute(
      `SELECT id, start_intersection_id, end_intersection_id
       FROM roads WHERE id IN (${placeholders}) AND is_active = TRUE`,
      roadIdList,
    );
    for (const r of roadRows as any[]) {
      roadToEndpoints.set(r.id, {
        start: r.start_intersection_id,
        end:   r.end_intersection_id,
      });
      if (r.start_intersection_id) allNodeIds.add(r.start_intersection_id);
      if (r.end_intersection_id)   allNodeIds.add(r.end_intersection_id);
    }
  }

  // Also collect stop_ids as fallback node sources
  for (const row of routeRows as any[]) {
    for (const sid of parseJsonArray(row.stop_ids)) allNodeIds.add(sid);
  }

  const nodeMap = new Map<string, StopNode>();
  if (allNodeIds.size > 0) {
    const nodeIdList       = Array.from(allNodeIds);
    const nodePlaceholders = nodeIdList.map(() => "?").join(",");
    const [nodeRows]: any  = await pool.execute(
      `SELECT id, name, latitude AS lat, longitude AS lon, point_type
       FROM intersections WHERE id IN (${nodePlaceholders})`,
      nodeIdList,
    );
    for (const n of nodeRows as any[]) nodeMap.set(n.id, n as StopNode);
  }

  const routes: RouteRecord[] = [];
  for (const row of routeRows as any[]) {
    const fare = fares.find(f => f.transport_type === row.transport_type);
    if (!fare) continue;

    const roadIds = parseJsonArray(row.road_ids);
    const stopIds = parseJsonArray(row.stop_ids);

    const nodeIdSet = new Set<string>();
    for (const rid of roadIds) {
      const ep = roadToEndpoints.get(rid);
      if (ep) {
        if (ep.start) nodeIdSet.add(ep.start);
        if (ep.end)   nodeIdSet.add(ep.end);
      }
    }
    if (nodeIdSet.size === 0) {
      for (const sid of stopIds) nodeIdSet.add(sid);
    }

    const nodes: StopNode[] = [];
    for (const nid of nodeIdSet) {
      const n = nodeMap.get(nid);
      if (n) nodes.push(n);
    }
    if (nodes.length === 0) continue;

    routes.push({
      id: row.id,
      route_name: row.route_name,
      transport_type: row.transport_type,
      road_ids: roadIds,
      stop_ids: stopIds,
      fare,
      nodes,
    });
  }
  return routes;
}

async function findNearestPier(
  lat: number, lon: number, maxKm = 25, minKm = 1.0,
): Promise<StopNode | null> {
  const [rows]: any = await pool.execute(
    `SELECT id, name, latitude AS lat, longitude AS lon, point_type
     FROM intersections WHERE point_type = 'pier'`,
  );
  let best: StopNode | null = null;
  let bestDist = maxKm;
  for (const r of rows as any[]) {
    const d = haversine(lat, lon, r.lat, r.lon);
    // Skip piers closer than minKm — those are island-side docks, not mainland embarkation
    if (d >= minKm && d < bestDist) { bestDist = d; best = r as StopNode; }
  }
  return best;
}

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
    result = await calculateRoute(fromLat, fromLon, toLat, toLon, optimizeFor, mode === "walk");
  } catch { /* fall through */ }
  // If A* found no road path and this is not a walk, retry with bidirectional graph as fallback
  if (mode !== "walk" && (!result || result.isWalkFallback)) {
    try {
      const r2 = await calculateRoute(fromLat, fromLon, toLat, toLon, optimizeFor, true);
      if (r2 && !r2.isWalkFallback) result = r2;
    } catch { /* fall through */ }
  }

  const distKm = result?.totalDistance ?? haversine(fromLat, fromLon, toLat, toLon);
  const speedKmh: Record<string, number> = {
    walk: 5, tricycle: 20, habal_habal: 30, jeepney: 22,
    bus: 25, bus_ac: 25, bus_commute: 25, taxi: 35,
    private_car: 40, ferry: 25,
  };
  const speed    = speedKmh[mode] ?? 25;
  const duration = result?.estimatedTime ?? Math.max(1, Math.round((distKm / speed) * 60));
  const geometry: [number, number][] = result?.routeGeometry ?? [
    [fromLat, fromLon], [toLat, toLon],
  ];

  return {
    mode: mode as TransportLeg["mode"],
    from: { name: fromName, lat: fromLat, lon: fromLon },
    to:   { name: toName,   lat: toLat,   lon: toLon },
    distance: Math.round(distKm * 100) / 100,
    duration,
    fare,
    instruction,
    geometry,
  };
}

// ─── Ferry injection ──────────────────────────────────────────────────────────
//
// Finds the nearest mainland embarkation pier to the DESTINATION (25 km radius).
// Routes: user → pier (by land/taxi) → destination (ferry).
// Does NOT require a pier near the user's start — the user travels to the pier first.

async function injectFerryLegs(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  fares: FareRow[],
): Promise<TransportLeg[] | null> {
  const ferryFare = fares.find(f => f.transport_type === "ferry");
  if (!ferryFare) return null;

  // Find the embarkation pier closest to the island destination (25 km radius)
  const boardingPier = await findNearestPier(toLat, toLon, 25);
  if (!boardingPier) return null;

  const legs: TransportLeg[] = [];

  // Land leg: user → boarding pier (taxi/grab for comfort; may be long distance)
  const toPierDist = haversine(fromLat, fromLon, boardingPier.lat, boardingPier.lon);
  if (toPierDist > 0.05) {
    let landMode: string;
    let landFare: number;
    if (toPierDist <= 0.5) {
      landMode = "walk";
      landFare = 0;
    } else {
      const taxiFare = fares.find(f => f.routing_behavior === "direct_fare") ??
                       fares.find(f => f.transport_type === "taxi");
      landMode = taxiFare?.transport_type ?? "taxi";
      landFare = taxiFare ? calcFare(taxiFare, toPierDist) : Math.round(40 + toPierDist * 13.5);
    }
    legs.push(await buildLeg(
      fromLat, fromLon, "Current Location",
      boardingPier.lat, boardingPier.lon, boardingPier.name,
      landMode, landFare,
      `Head to ${boardingPier.name} to board the ferry`,
    ));
  }

  // Ferry leg: boarding pier → island destination
  const ferryDist = haversine(boardingPier.lat, boardingPier.lon, toLat, toLon);
  legs.push(await buildLeg(
    boardingPier.lat, boardingPier.lon, boardingPier.name,
    toLat, toLon, "Island Destination",
    "ferry",
    calcFare(ferryFare, ferryDist),
    `Board the ferry at ${boardingPier.name}. Fare may vary by operator.`,
  ));

  return legs.length > 0 ? legs : null;
}

// ─── Transit leg geometry ─────────────────────────────────────────────────────

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
    // Transit vehicles travel their corridor regardless of one-way restrictions
    adj.get(road.end_intersection_id)!.push({ to: road.start_intersection_id, road, reversed: true });
  }

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

// ─── Transit chain search ─────────────────────────────────────────────────────

/**
 * Score all 1-hop, 2-hop, and 3-hop transit route combinations.
 * Returns the combination with the lowest total fare, or null if none valid.
 *
 * Progress guard: for each hop, the alight node must be closer to the
 * destination than the board node.  For multi-hop chains, each subsequent
 * hop must also improve over the previous hop's alight position.
 */
function findBestTransitChain(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  routes: RouteRecord[],
  cheapestDirect: FareRow | null,
): TransitChain | null {
  let best: TransitChain | null = null;

  function consider(candidate: TransitChain): void {
    if (!isFinite(candidate.totalFare)) return;
    if (!best || candidate.totalFare < best.totalFare) best = candidate;
  }

  // ── 1-hop ──────────────────────────────────────────────────────────────────
  for (const route of routes) {
    const boardNode = findNearestNodeInMemory(fromLat, fromLon, route.nodes, toLat, toLon);
    if (!boardNode) continue;
    const alightNode = findNearestNodeInMemory(toLat, toLon, route.nodes);
    if (!alightNode || boardNode.id === alightNode.id) continue;

    const boardDist    = haversine(fromLat, fromLon, boardNode.lat, boardNode.lon);
    if (boardDist > MAX_BOARD_KM) continue;

    const boardToDest  = haversine(boardNode.lat, boardNode.lon, toLat, toLon);
    const alightToDest = haversine(alightNode.lat, alightNode.lon, toLat, toLon);
    if (alightToDest >= boardToDest) continue;

    const transitDist = haversine(boardNode.lat, boardNode.lon, alightNode.lat, alightNode.lon);
    consider({
      chainLegs: [{ route, boardNode, alightNode }],
      transfers: [],
      totalFare: feederFare(boardDist, cheapestDirect)
               + calcFare(route.fare, transitDist)
               + feederFare(alightToDest, cheapestDirect),
    });
  }

  // ── 2-hop ──────────────────────────────────────────────────────────────────
  for (let i = 0; i < routes.length; i++) {
    const r1 = routes[i];
    for (let j = 0; j < routes.length; j++) {
      if (j === i) continue;
      const r2 = routes[j];

      const t1 = findClosestTransfer(r1.nodes, r2.nodes);
      if (!t1 || t1.dist > MAX_TRANSFER_KM) continue;

      const boardR1 = findNearestNodeInMemory(fromLat, fromLon, r1.nodes, toLat, toLon);
      if (!boardR1) continue;
      const alightR2 = findNearestNodeInMemory(toLat, toLon, r2.nodes);
      if (!alightR2) continue;

      const alightR1 = t1.a;
      const boardR2  = t1.b;

      if (boardR1.id === alightR1.id || boardR2.id === alightR2.id) continue;

      const boardR1Dist    = haversine(fromLat, fromLon, boardR1.lat, boardR1.lon);
      if (boardR1Dist > MAX_BOARD_KM) continue;

      const boardR1ToDest  = haversine(boardR1.lat, boardR1.lon, toLat, toLon);
      const alightR1ToDest = haversine(alightR1.lat, alightR1.lon, toLat, toLon);
      const alightR2ToDest = haversine(alightR2.lat, alightR2.lon, toLat, toLon);

      if (alightR1ToDest >= boardR1ToDest)  continue;
      if (alightR2ToDest >= alightR1ToDest) continue;

      const r1Dist = haversine(boardR1.lat, boardR1.lon, alightR1.lat, alightR1.lon);
      const r2Dist = haversine(boardR2.lat, boardR2.lon, alightR2.lat, alightR2.lon);

      consider({
        chainLegs: [
          { route: r1, boardNode: boardR1, alightNode: alightR1 },
          { route: r2, boardNode: boardR2, alightNode: alightR2 },
        ],
        transfers: [{ from: alightR1, to: boardR2 }],
        totalFare: feederFare(boardR1Dist, cheapestDirect)
                 + calcFare(r1.fare, r1Dist)
                 + feederFare(t1.dist, cheapestDirect)
                 + calcFare(r2.fare, r2Dist)
                 + feederFare(alightR2ToDest, cheapestDirect),
      });
    }
  }

  // ── 3-hop ──────────────────────────────────────────────────────────────────
  for (let i = 0; i < routes.length; i++) {
    const r1 = routes[i];
    for (let j = 0; j < routes.length; j++) {
      if (j === i) continue;
      const r2 = routes[j];
      const t1 = findClosestTransfer(r1.nodes, r2.nodes);
      if (!t1 || t1.dist > MAX_TRANSFER_KM) continue;

      for (let k = 0; k < routes.length; k++) {
        if (k === i || k === j) continue;
        const r3 = routes[k];
        const t2 = findClosestTransfer(r2.nodes, r3.nodes);
        if (!t2 || t2.dist > MAX_TRANSFER_KM) continue;

        const boardR1 = findNearestNodeInMemory(fromLat, fromLon, r1.nodes, toLat, toLon);
        if (!boardR1) continue;
        const alightR3 = findNearestNodeInMemory(toLat, toLon, r3.nodes);
        if (!alightR3) continue;

        const alightR1 = t1.a, boardR2 = t1.b;
        const alightR2 = t2.a, boardR3 = t2.b;

        if (boardR1.id === alightR1.id) continue;
        if (boardR2.id === alightR2.id) continue;
        if (boardR3.id === alightR3.id) continue;

        const boardR1Dist    = haversine(fromLat, fromLon, boardR1.lat, boardR1.lon);
        if (boardR1Dist > MAX_BOARD_KM) continue;

        const boardR1ToDest  = haversine(boardR1.lat, boardR1.lon, toLat, toLon);
        const alightR1ToDest = haversine(alightR1.lat, alightR1.lon, toLat, toLon);
        const boardR2ToDest  = haversine(boardR2.lat, boardR2.lon, toLat, toLon);
        const alightR2ToDest = haversine(alightR2.lat, alightR2.lon, toLat, toLon);
        const alightR3ToDest = haversine(alightR3.lat, alightR3.lon, toLat, toLon);

        if (alightR1ToDest >= boardR1ToDest)  continue;
        if (alightR2ToDest >= boardR2ToDest)  continue;
        if (alightR3ToDest >= alightR2ToDest) continue;

        const r1Dist = haversine(boardR1.lat, boardR1.lon, alightR1.lat, alightR1.lon);
        const r2Dist = haversine(boardR2.lat, boardR2.lon, alightR2.lat, alightR2.lon);
        const r3Dist = haversine(boardR3.lat, boardR3.lon, alightR3.lat, alightR3.lon);

        consider({
          chainLegs: [
            { route: r1, boardNode: boardR1, alightNode: alightR1 },
            { route: r2, boardNode: boardR2, alightNode: alightR2 },
            { route: r3, boardNode: boardR3, alightNode: alightR3 },
          ],
          transfers: [
            { from: alightR1, to: boardR2 },
            { from: alightR2, to: boardR3 },
          ],
          totalFare: feederFare(boardR1Dist, cheapestDirect)
                   + calcFare(r1.fare, r1Dist)
                   + feederFare(t1.dist, cheapestDirect)
                   + calcFare(r2.fare, r2Dist)
                   + feederFare(t2.dist, cheapestDirect)
                   + calcFare(r3.fare, r3Dist)
                   + feederFare(alightR3ToDest, cheapestDirect),
        });
      }
    }
  }

  return best;
}

// ─── Build actual legs for winning chain ──────────────────────────────────────

const TRANSIT_SPEEDS: Record<string, number> = {
  bus: 25, bus_ac: 25, bus_commute: 25, jeepney: 22, odutco: 22,
};

async function buildChainLegs(
  chain: TransitChain,
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  cheapestDirect: FareRow,
): Promise<TransportLeg[]> {
  const legs: TransportLeg[] = [];
  const firstBoard = chain.chainLegs[0].boardNode;
  const lastAlight = chain.chainLegs[chain.chainLegs.length - 1].alightNode;

  // Feeder A: user → first board node
  const boardADist = haversine(fromLat, fromLon, firstBoard.lat, firstBoard.lon);
  if (boardADist > 0.05) {
    if (boardADist <= 0.5) {
      legs.push(await buildLeg(
        fromLat, fromLon, "Current Location",
        firstBoard.lat, firstBoard.lon, firstBoard.name,
        "walk", 0,
        `Walk or Ride Any Public Transportation (Ask around the area) to ${firstBoard.name}`,
      ));
    } else {
      legs.push(await buildLeg(
        fromLat, fromLon, "Current Location",
        firstBoard.lat, firstBoard.lon, firstBoard.name,
        cheapestDirect.transport_type,
        calcFare(cheapestDirect, boardADist),
        `Walk or Ride Any Public Transportation (Ask around the area) to ${firstBoard.name}`,
      ));
    }
  }

  // Transit hops + transfer gaps
  for (let idx = 0; idx < chain.chainLegs.length; idx++) {
    const { route, boardNode, alightNode } = chain.chainLegs[idx];
    const transitDist = haversine(boardNode.lat, boardNode.lon, alightNode.lat, alightNode.lon);

    const bfsGeo = route.road_ids.length > 0
      ? await buildTransitLegGeometry(route.road_ids, boardNode.id, alightNode.id)
      : null;
    let geometry: [number, number][];
    if (bfsGeo) {
      geometry = bfsGeo;
    } else {
      // BFS on route-only roads failed — fall back to full A* (ignores one-way)
      try {
        const r = await calculateRoute(
          boardNode.lat, boardNode.lon, alightNode.lat, alightNode.lon, "time", true,
        );
        geometry = r.routeGeometry ?? [[boardNode.lat, boardNode.lon], [alightNode.lat, alightNode.lon]];
      } catch {
        geometry = [[boardNode.lat, boardNode.lon], [alightNode.lat, alightNode.lon]];
      }
    }

    const speed = TRANSIT_SPEEDS[route.transport_type] ?? 22;
    legs.push({
      mode: route.transport_type as TransportLeg["mode"],
      from: { name: boardNode.name,  lat: boardNode.lat,  lon: boardNode.lon },
      to:   { name: alightNode.name, lat: alightNode.lat, lon: alightNode.lon },
      distance: Math.round(transitDist * 100) / 100,
      duration: Math.max(1, Math.round((transitDist / speed) * 60)),
      fare: calcFare(route.fare, transitDist),
      instruction: `Board ${route.fare.display_name} (${route.route_name}) at ${boardNode.name}. Alight at ${alightNode.name}`,
      geometry,
    });

    // Transfer gap to next hop
    if (idx < chain.transfers.length) {
      const xfer     = chain.transfers[idx];
      const xferDist = haversine(xfer.from.lat, xfer.from.lon, xfer.to.lat, xfer.to.lon);
      if (xferDist > 0.05) {
        if (xferDist <= 0.5) {
          legs.push(await buildLeg(
            xfer.from.lat, xfer.from.lon, xfer.from.name,
            xfer.to.lat, xfer.to.lon, xfer.to.name,
            "walk", 0,
            `Walk or Ride Any Public Transportation (Ask around the area) to ${chain.chainLegs[idx + 1].boardNode.name}`,
          ));
        } else {
          legs.push(await buildLeg(
            xfer.from.lat, xfer.from.lon, xfer.from.name,
            xfer.to.lat, xfer.to.lon, xfer.to.name,
            cheapestDirect.transport_type,
            calcFare(cheapestDirect, xferDist),
            `Walk or Ride Any Public Transportation (Ask around the area) to ${chain.chainLegs[idx + 1].boardNode.name}`,
          ));
        }
      }
    }
  }

  // Feeder C: last alight → destination
  const alightToDest = haversine(lastAlight.lat, lastAlight.lon, toLat, toLon);
  if (alightToDest > 0.05) {
    if (alightToDest <= 0.5) {
      legs.push(await buildLeg(
        lastAlight.lat, lastAlight.lon, lastAlight.name,
        toLat, toLon, "Destination",
        "walk", 0,
        `Walk or Ride Any Public Transportation (Ask around the area) to your destination`,
      ));
    } else {
      legs.push(await buildLeg(
        lastAlight.lat, lastAlight.lon, lastAlight.name,
        toLat, toLon, "Destination",
        cheapestDirect.transport_type,
        calcFare(cheapestDirect, alightToDest),
        `Walk or Ride Any Public Transportation (Ask around the area) to your destination`,
      ));
    }
  }

  return legs;
}

// ─── Saver algorithm (transit-first, cheapest-fare) ──────────────────────────

async function buildSaverRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
): Promise<TransportLeg[]> {
  const fares          = await loadFares();
  const directFareModes = fares.filter(f => f.routing_behavior === "direct_fare");
  const taxiMode: FareRow = fares.find(f => f.transport_type === "taxi") ?? directFareModes[0] ?? {
    transport_type: "taxi", display_name: "Taxi/Grab",
    base_fare: 40, per_km_rate: 13.5, per_minute_rate: 2, minimum_fare: 40,
    peak_hour_multiplier: 1.2, booking_fee: 15, routing_behavior: "direct_fare", display_order: 99,
  };
  const cheapestDirect: FareRow = directFareModes[0] ?? taxiMode;

  // Walk check
  const totalDist = haversine(startLat, startLon, endLat, endLon);
  if (totalDist <= 0.05) return [];
  if (totalDist <= 0.5) {
    return [await buildLeg(
      startLat, startLon, "Current Location",
      endLat, endLon, "Destination",
      "walk", 0,
      `Walk ${Math.round(totalDist * 1000)}m to your destination`,
    )];
  }

  // Ferry check
  const reachable = await canReachByRoad(startLat, startLon, endLat, endLon);
  if (!reachable) {
    const ferryLegs = await injectFerryLegs(startLat, startLon, endLat, endLon, fares);
    if (ferryLegs && ferryLegs.length > 0) return ferryLegs;
  }

  // Transit chain search — picks cheapest 1/2/3-hop option
  const routes = await loadAllTransitRoutes(fares);
  const chain  = findBestTransitChain(
    startLat, startLon, endLat, endLon, routes, cheapestDirect,
  );

  if (chain) {
    return buildChainLegs(chain, startLat, startLon, endLat, endLon, cheapestDirect);
  }

  // No transit available — direct_fare with note
  return [await buildLeg(
    startLat, startLon, "Current Location",
    endLat, endLon, "Destination",
    taxiMode.transport_type,
    calcFare(taxiMode, totalDist),
    `No transit route available for this trip. If you want less hassle, book a ${taxiMode.display_name}. Fare: ₱${calcFare(taxiMode, totalDist).toFixed(0)}`,
  )];
}

// ─── Ride-hailing sub-modes ───────────────────────────────────────────────────

const RIDE_HAILING_TYPE: Record<string, string> = {
  metered_taxi: "taxi",
  grab:         "grab",
};

async function buildGrabTaxiRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
  subMode: "metered_taxi" | "grab",
): Promise<{ legs: TransportLeg[]; fareMax: number; fareConfig: { baseFare: number; perKmRate: number; perMinuteRate: number } }> {
  const fares = await loadFares();

  const transportType = RIDE_HAILING_TYPE[subMode] ?? "taxi";
  const mode: FareRow =
    fares.find(f => f.transport_type === transportType && f.routing_behavior === "direct_fare") ??
    fares.find(f => f.routing_behavior === "direct_fare") ?? {
      transport_type: "taxi", display_name: "Taxi/Grab",
      base_fare: 40, per_km_rate: 13.5, per_minute_rate: 2, minimum_fare: 40,
      peak_hour_multiplier: 1.2, booking_fee: 15, routing_behavior: "direct_fare", display_order: 99,
    };

  const fareConfig = { baseFare: mode.base_fare, perKmRate: mode.per_km_rate, perMinuteRate: mode.per_minute_rate };

  const reachable = await canReachByRoad(startLat, startLon, endLat, endLon);
  if (!reachable) {
    const ferryLegs = await injectFerryLegs(startLat, startLon, endLat, endLon, fares);
    if (ferryLegs) {
      return { legs: ferryLegs, fareMax: ferryLegs.reduce((s, l) => s + l.fare, 0), fareConfig };
    }
  }

  const roughDist = haversine(startLat, startLon, endLat, endLon);
  const leg = await buildLeg(
    startLat, startLon, "Current Location",
    endLat, endLon, "Destination",
    mode.transport_type,
    calcFare(mode, roughDist),
    `Book a ${mode.display_name} to your destination`,
  );
  // Recalculate fare using actual road distance from A* routing
  leg.fare    = calcFare(mode, leg.distance);
  const fareMax = calcFareMax(mode, leg.distance);

  return { legs: [leg], fareMax, fareConfig };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function buildCommuteRoute(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
  subMode: CommuteSubMode,
): Promise<CommuteRoute> {
  let legs: TransportLeg[];
  let fareMax: number | undefined;
  let fareConfig: CommuteRoute["fareConfig"];

  if (subMode === "saver") {
    legs = await buildSaverRoute(startLat, startLon, endLat, endLon);
  } else {
    const result = await buildGrabTaxiRoute(startLat, startLon, endLat, endLon, subMode);
    legs    = result.legs;
    fareMax = result.fareMax;
    if (subMode === "metered_taxi") fareConfig = result.fareConfig;
  }

  const totalDistance = legs.reduce((s, l) => s + l.distance, 0);
  const totalDuration = legs.reduce((s, l) => s + l.duration, 0);
  const totalFare     = legs.reduce((s, l) => s + l.fare, 0);
  const summary       = legs.map(l => l.mode).join(" → ");

  return {
    legs,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalDuration,
    totalFare:     Math.round(totalFare * 100) / 100,
    fareMax:       fareMax !== undefined ? Math.round(fareMax * 100) / 100 : undefined,
    summary,
    subMode,
    fareConfig,
  };
}
