/**
 * A* Pathfinding Service for GPS-based Road Networks
 * Uses Haversine distance for heuristic and actual road distances for cost
 * Supports POIs far from roads, path recalculation, and real-time updates
 */

import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import * as turf from '@turf/turf';

interface Intersection extends RowDataPacket {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  point_type: string;
}

interface Road extends RowDataPacket {
  id: string;
  name: string;
  start_intersection_id: string;
  end_intersection_id: string;
  distance: number;
  estimated_time: number;
  road_type: string;
  is_bidirectional: boolean;
  path: any;
}

interface PathNode {
  intersection: Intersection;
  gScore: number; // Cost from start
  fScore: number; // gScore + heuristic
  parent: PathNode | null;
  road: Road | null; // Road taken to reach this node
}

interface RouteResult {
  success: boolean;
  path: Intersection[];
  roads: Road[];
  totalDistance: number;
  estimatedTime: number;
  steps: RouteStep[];
  virtualConnections?: VirtualConnection[]; // For POIs far from roads
}

interface RouteStep {
  instruction: string;
  roadName: string;
  distance: number;
  time: number;
  from: string;
  to: string;
}

interface VirtualConnection {
  type: 'start' | 'end';
  from: { lat: number; lon: number; name?: string };
  to: { lat: number; lon: number; name: string };
  distance: number;
  isVirtual: true;
}

const MAX_VIRTUAL_CONNECTION_DISTANCE = 5.0; // Max 5km for virtual connections

/**
 * Calculate Haversine distance between two GPS coordinates (in kilometers)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const from = turf.point([lon1, lat1]);
  const to = turf.point([lon2, lat2]);
  return turf.distance(from, to, { units: 'kilometers' });
}

/**
 * Find nearest point on a road path to given coordinates
 */
function findNearestPointOnRoad(
  lat: number,
  lon: number,
  roadPath: [number, number][]
): { point: [number, number]; distance: number } {
  const targetPoint = turf.point([lon, lat]);
  const line = turf.lineString(roadPath.map((p) => [p[1], p[0]])); // Convert to [lon, lat]

  const snapped = turf.nearestPointOnLine(line, targetPoint, { units: 'kilometers' });

  return {
    point: [snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]], // Convert back to [lat, lon]
    distance: snapped.properties.dist || 0,
  };
}

/**
 * Find nearest intersection or road node to GPS coordinates
 * Returns the intersection and whether a virtual connection is needed
 */
async function findNearestRoadNode(
  latitude: number,
  longitude: number
): Promise<{
  intersection: Intersection;
  distance: number;
  needsVirtualConnection: boolean;
  virtualConnectionPoint?: [number, number];
}> {
  // First, try to find a close intersection
  const [intersections] = await pool.execute<Intersection[]>(
    'SELECT id, name, latitude, longitude, point_type FROM intersections'
  );

  if (intersections.length === 0) {
    throw new Error('No intersections found in database');
  }

  let nearestIntersection = intersections[0];
  let minDistance = haversineDistance(latitude, longitude, nearestIntersection.latitude, nearestIntersection.longitude);

  for (const intersection of intersections) {
    const distance = haversineDistance(latitude, longitude, intersection.latitude, intersection.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIntersection = intersection;
    }
  }

  // If intersection is close enough (< 500m), use it directly
  if (minDistance < 0.5) {
    return {
      intersection: nearestIntersection,
      distance: minDistance,
      needsVirtualConnection: false,
    };
  }

  // Otherwise, find nearest point on any road
  const [roads] = await pool.execute<Road[]>('SELECT * FROM roads WHERE is_active = TRUE');

  let bestRoadNode: { intersection: Intersection; distance: number; point: [number, number] } | null = null;

  for (const road of roads) {
    if (!road.path || !Array.isArray(road.path)) continue;

    const { point, distance } = findNearestPointOnRoad(latitude, longitude, road.path);

    if (!bestRoadNode || distance < bestRoadNode.distance) {
      // Find which intersection is closer to this point on the road
      const startIntersection = intersections.find((i) => i.id === road.start_intersection_id);
      const endIntersection = intersections.find((i) => i.id === road.end_intersection_id);

      if (!startIntersection || !endIntersection) continue;

      const distToStart = haversineDistance(point[0], point[1], startIntersection.latitude, startIntersection.longitude);
      const distToEnd = haversineDistance(point[0], point[1], endIntersection.latitude, endIntersection.longitude);

      bestRoadNode = {
        intersection: distToStart < distToEnd ? startIntersection : endIntersection,
        distance,
        point,
      };
    }
  }

  if (bestRoadNode && bestRoadNode.distance < MAX_VIRTUAL_CONNECTION_DISTANCE) {
    return {
      intersection: bestRoadNode.intersection,
      distance: bestRoadNode.distance,
      needsVirtualConnection: true,
      virtualConnectionPoint: bestRoadNode.point,
    };
  }

  // Fallback to nearest intersection
  return {
    intersection: nearestIntersection,
    distance: minDistance,
    needsVirtualConnection: minDistance > 0.5,
  };
}

/**
 * Build adjacency list (graph) from database
 */
async function buildGraph(): Promise<{
  intersections: Map<string, Intersection>;
  adjacencyList: Map<string, Array<{ road: Road; neighbor: string }>>;
}> {
  // Get all intersections
  const [intersections] = await pool.execute<Intersection[]>(
    'SELECT id, name, latitude, longitude, point_type FROM intersections'
  );

  const intersectionMap = new Map<string, Intersection>();
  for (const intersection of intersections) {
    intersectionMap.set(intersection.id, intersection);
  }

  // Get all active roads
  const [roads] = await pool.execute<Road[]>('SELECT * FROM roads WHERE is_active = TRUE');

  // Build adjacency list
  const adjacencyList = new Map<string, Array<{ road: Road; neighbor: string }>>();

  for (const road of roads) {
    // Add forward edge (start -> end)
    if (!adjacencyList.has(road.start_intersection_id)) {
      adjacencyList.set(road.start_intersection_id, []);
    }
    adjacencyList.get(road.start_intersection_id)!.push({
      road,
      neighbor: road.end_intersection_id,
    });

    // Add reverse edge if bidirectional (end -> start)
    if (road.is_bidirectional) {
      if (!adjacencyList.has(road.end_intersection_id)) {
        adjacencyList.set(road.end_intersection_id, []);
      }
      adjacencyList.get(road.end_intersection_id)!.push({
        road: {
          ...road,
          // Swap start and end for reverse direction
          start_intersection_id: road.end_intersection_id,
          end_intersection_id: road.start_intersection_id,
        },
        neighbor: road.start_intersection_id,
      });
    }
  }

  return { intersections: intersectionMap, adjacencyList };
}

/**
 * A* Pathfinding Algorithm
 */
export async function findShortestPath(
  startIntersectionId: string,
  endIntersectionId: string,
  optimizeFor: 'distance' | 'time' = 'distance'
): Promise<RouteResult> {
  const { intersections, adjacencyList } = await buildGraph();

  const startIntersection = intersections.get(startIntersectionId);
  const endIntersection = intersections.get(endIntersectionId);

  if (!startIntersection || !endIntersection) {
    return {
      success: false,
      path: [],
      roads: [],
      totalDistance: 0,
      estimatedTime: 0,
      steps: [],
    };
  }

  // Priority queue (using array for simplicity, can optimize with heap)
  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();

  // Initialize with start node
  const startNode: PathNode = {
    intersection: startIntersection,
    gScore: 0,
    fScore: haversineDistance(
      startIntersection.latitude,
      startIntersection.longitude,
      endIntersection.latitude,
      endIntersection.longitude
    ),
    parent: null,
    road: null,
  };

  openSet.push(startNode);

  // Track best scores for each intersection
  const gScores = new Map<string, number>();
  gScores.set(startIntersectionId, 0);

  while (openSet.length > 0) {
    // Get node with lowest fScore
    openSet.sort((a, b) => a.fScore - b.fScore);
    const current = openSet.shift()!;

    // Check if we reached the goal
    if (current.intersection.id === endIntersectionId) {
      return reconstructPath(current, optimizeFor);
    }

    closedSet.add(current.intersection.id);

    // Get neighbors
    const neighbors = adjacencyList.get(current.intersection.id) || [];

    for (const { road, neighbor: neighborId } of neighbors) {
      if (closedSet.has(neighborId)) continue;

      const neighborIntersection = intersections.get(neighborId);
      if (!neighborIntersection) continue;

      // Calculate cost based on optimization preference
      const edgeCost =
        optimizeFor === 'time'
          ? road.estimated_time / 60 // Convert minutes to hours for consistency
          : road.distance;

      const tentativeGScore = current.gScore + edgeCost;

      // Check if this path is better
      const existingGScore = gScores.get(neighborId);
      if (existingGScore !== undefined && tentativeGScore >= existingGScore) {
        continue; // Not a better path
      }

      // Calculate heuristic (straight-line distance to goal)
      const heuristic = haversineDistance(
        neighborIntersection.latitude,
        neighborIntersection.longitude,
        endIntersection.latitude,
        endIntersection.longitude
      );

      // Create/update neighbor node
      const neighborNode: PathNode = {
        intersection: neighborIntersection,
        gScore: tentativeGScore,
        fScore: tentativeGScore + heuristic,
        parent: current,
        road,
      };

      gScores.set(neighborId, tentativeGScore);

      // Add to open set if not already there
      const existingIndex = openSet.findIndex((n) => n.intersection.id === neighborId);
      if (existingIndex >= 0) {
        openSet[existingIndex] = neighborNode;
      } else {
        openSet.push(neighborNode);
      }
    }
  }

  // No path found
  return {
    success: false,
    path: [],
    roads: [],
    totalDistance: 0,
    estimatedTime: 0,
    steps: [],
  };
}

/**
 * Reconstruct path from goal node to start
 */
function reconstructPath(goalNode: PathNode, optimizeFor: 'distance' | 'time'): RouteResult {
  const path: Intersection[] = [];
  const roads: Road[] = [];
  const steps: RouteStep[] = [];

  let current: PathNode | null = goalNode;
  let totalDistance = 0;
  let totalTime = 0;

  // Build path from goal to start
  while (current) {
    path.unshift(current.intersection);
    if (current.road) {
      roads.unshift(current.road);
    }
    current = current.parent;
  }

  // Build turn-by-turn steps
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    const from = path[i];
    const to = path[i + 1];

    totalDistance += road.distance;
    totalTime += road.estimated_time;

    steps.push({
      instruction: `Take ${road.name} ${road.is_bidirectional ? '(two-way)' : '(one-way)'}`,
      roadName: road.name,
      distance: road.distance,
      time: road.estimated_time,
      from: from.name,
      to: to.name,
    });
  }

  return {
    success: true,
    path,
    roads,
    totalDistance,
    estimatedTime: totalTime,
    steps,
  };
}

/**
 * Find nearest intersection to GPS coordinates
 */
export async function findNearestIntersection(
  latitude: number,
  longitude: number
): Promise<Intersection | null> {
  const result = await findNearestRoadNode(latitude, longitude);
  return result.intersection;
}

/**
 * Calculate route from GPS coordinates to GPS coordinates
 * Handles POIs far from roads by creating virtual connections
 */
export async function calculateRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  optimizeFor: 'distance' | 'time' = 'distance'
): Promise<RouteResult> {
  // Find nearest road nodes for start and end
  const startNode = await findNearestRoadNode(startLat, startLon);
  const endNode = await findNearestRoadNode(endLat, endLon);

  if (!startNode.intersection || !endNode.intersection) {
    return {
      success: false,
      path: [],
      roads: [],
      totalDistance: 0,
      estimatedTime: 0,
      steps: [],
    };
  }

  // Run A* pathfinding
  const result = await findShortestPath(startNode.intersection.id, endNode.intersection.id, optimizeFor);

  if (!result.success) {
    return result;
  }

  // Add virtual connections if needed
  const virtualConnections: VirtualConnection[] = [];

  if (startNode.needsVirtualConnection) {
    const walkDistance = startNode.distance;
    virtualConnections.push({
      type: 'start',
      from: { lat: startLat, lon: startLon, name: 'Starting Point' },
      to: {
        lat: startNode.intersection.latitude,
        lon: startNode.intersection.longitude,
        name: startNode.intersection.name,
      },
      distance: walkDistance,
      isVirtual: true,
    });
    result.totalDistance += walkDistance;
    result.estimatedTime += Math.round((walkDistance / 5) * 60); // Walking speed ~5 km/h
  }

  if (endNode.needsVirtualConnection) {
    const walkDistance = endNode.distance;
    virtualConnections.push({
      type: 'end',
      from: {
        lat: endNode.intersection.latitude,
        lon: endNode.intersection.longitude,
        name: endNode.intersection.name,
      },
      to: { lat: endLat, lon: endLon, name: 'Destination' },
      distance: walkDistance,
      isVirtual: true,
    });
    result.totalDistance += walkDistance;
    result.estimatedTime += Math.round((walkDistance / 5) * 60); // Walking speed ~5 km/h
  }

  if (virtualConnections.length > 0) {
    result.virtualConnections = virtualConnections;
  }

  return result;
}

/**
 * Recalculate route from current position
 * Used when user goes off-course
 */
export async function recalculateRoute(
  currentLat: number,
  currentLon: number,
  destinationLat: number,
  destinationLon: number,
  optimizeFor: 'distance' | 'time' = 'distance',
  threshold: number = 0.1 // 100 meters off-course threshold
): Promise<{ needsRecalculation: boolean; route?: RouteResult; offCourseDistance?: number }> {
  // Calculate new route from current position
  const newRoute = await calculateRoute(currentLat, currentLon, destinationLat, destinationLon, optimizeFor);

  return {
    needsRecalculation: true,
    route: newRoute,
    offCourseDistance: 0, // Can be calculated if we have the original route
  };
}

/**
 * Check if user is off course from planned route
 */
export async function checkIfOffCourse(
  currentLat: number,
  currentLon: number,
  plannedPath: Intersection[],
  plannedRoads: Road[],
  threshold: number = 0.15 // 150 meters threshold
): Promise<{ isOffCourse: boolean; distance: number; nearestRoadIndex: number }> {
  let minDistance = Infinity;
  let nearestRoadIndex = -1;

  // Check distance to all roads in the planned path
  for (let i = 0; i < plannedRoads.length; i++) {
    const road = plannedRoads[i];
    if (!road.path || !Array.isArray(road.path)) continue;

    const { distance } = findNearestPointOnRoad(currentLat, currentLon, road.path);

    if (distance < minDistance) {
      minDistance = distance;
      nearestRoadIndex = i;
    }
  }

  return {
    isOffCourse: minDistance > threshold,
    distance: minDistance,
    nearestRoadIndex,
  };
}
