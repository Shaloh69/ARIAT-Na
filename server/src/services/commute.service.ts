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

/** Soft max range per corridor_anywhere mode — keeps legs reasonably sized. */
function maxRangeKm(transportType: string, row: FareRow): number {
  const known: Record<string, number> = {
    tricycle: 5,
    habal_habal: 15,
  };
  if (known[transportType]) return known[transportType];
  // Heuristic for unknown admin-added modes: ₱200 worth of travel
  return row.per_km_rate > 0 ? 200 / row.per_km_rate : 20;
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

// ─── Transit corridor check ───────────────────────────────────────────────────

/** Check if any active transit_route covers both ends (board + alight stops). */
async function tryCorridorRoute(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  stopModes: FareRow[],
  fares: FareRow[],
): Promise<TransportLeg[] | null> {
  if (stopModes.length === 0) return null;

  // Find bus stops near both ends
  const fromStops = await findBusStopsNear(fromLat, fromLon, 0.5);
  const toStops   = await findBusStopsNear(toLat, toLon, 1.0);
  if (!fromStops.length || !toStops.length) return null;

  // Look for a transit route whose stop_ids cover both a from-stop and a to-stop
  for (const mode of stopModes) {
    const [routes]: any = await pool.execute(
      `SELECT id, route_name, stop_ids, transport_type
       FROM transit_routes
       WHERE transport_type = ? AND is_active = TRUE`,
      [mode.transport_type],
    );
    for (const route of routes as any[]) {
      const stopIds: string[] = Array.isArray(route.stop_ids)
        ? route.stop_ids
        : JSON.parse(route.stop_ids ?? "[]");

      const boardStop = fromStops.find(s => stopIds.includes(s.id));
      const alightStop = toStops.find(s => stopIds.includes(s.id));
      if (!boardStop || !alightStop || boardStop.id === alightStop.id) continue;

      const legs: TransportLeg[] = [];

      // Walk to board stop if needed
      const walkToDist = haversine(fromLat, fromLon, boardStop.lat, boardStop.lon);
      if (walkToDist > 0.05) {
        legs.push(await buildLeg(
          fromLat, fromLon, "Current Location",
          boardStop.lat, boardStop.lon, boardStop.name,
          "walk", 0,
          `Walk ${Math.round(walkToDist * 1000)}m to ${boardStop.name}`,
        ));
      }

      // Transit leg
      const transitDist = haversine(boardStop.lat, boardStop.lon, alightStop.lat, alightStop.lon);
      legs.push(await buildLeg(
        boardStop.lat, boardStop.lon, boardStop.name,
        alightStop.lat, alightStop.lon, alightStop.name,
        mode.transport_type,
        calcFare(mode, transitDist),
        `Board ${mode.display_name} (${route.route_name}) at ${boardStop.name}. Alight at ${alightStop.name}`,
      ));

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

    // ── 1. Walk if close enough ─────────────────────────────────────────────
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

    // ── 3. Try corridor_stops (bus/jeepney) via transit route data ──────────
    const corridorResult = await tryCorridorRoute(
      curLat, curLon, endLat, endLon, corridorStopModes, fares,
    );
    if (corridorResult) {
      legs.push(...corridorResult);
      const last = corridorResult[corridorResult.length - 1];
      curLat  = last.to.lat;
      curLon  = last.to.lon;
      curName = last.to.name;
      continue;
    }

    // ── 4. Try corridor_anywhere toward nearest useful bus stop ─────────────
    const busStop = await findBusStopToward(curLat, curLon, endLat, endLon, 10);
    if (busStop) {
      const legDist = haversine(curLat, curLon, busStop.lat, busStop.lon);
      // Pick best corridor_anywhere mode for this distance
      const anyMode = corridorAnyModes.find(
        m => legDist <= maxRangeKm(m.transport_type, m),
      ) ?? corridorAnyModes[corridorAnyModes.length - 1];

      if (anyMode) {
        legs.push(await buildLeg(
          curLat, curLon, curName,
          busStop.lat, busStop.lon, busStop.name,
          anyMode.transport_type,
          calcFare(anyMode, legDist),
          `Hail a ${anyMode.display_name} to ${busStop.name}. Fare: ₱${calcFare(anyMode, legDist).toFixed(0)}`,
        ));
        curLat  = busStop.lat;
        curLon  = busStop.lon;
        curName = busStop.name;
        continue;
      }
    }

    // ── 5. corridor_anywhere direct to destination ──────────────────────────
    if (corridorAnyModes.length > 0) {
      const anyMode = corridorAnyModes.find(
        m => remaining <= maxRangeKm(m.transport_type, m),
      ) ?? corridorAnyModes[corridorAnyModes.length - 1];

      if (anyMode) {
        legs.push(await buildLeg(
          curLat, curLon, curName,
          endLat, endLon, "Destination",
          anyMode.transport_type,
          calcFare(anyMode, remaining),
          `Hail a ${anyMode.display_name} to your destination. Fare: ₱${calcFare(anyMode, remaining).toFixed(0)}`,
        ));
        break;
      }
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
