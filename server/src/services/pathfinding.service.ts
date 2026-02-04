/**
 * A* Pathfinding Service for GPS-based Road Networks
 * Uses Haversine distance for heuristic and actual road distances for cost
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
}

interface RouteStep {
  instruction: string;
  roadName: string;
  distance: number;
  time: number;
  from: string;
  to: string;
}

/**
 * Calculate Haversine distance between two GPS coordinates (in kilometers)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const from = turf.point([lon1, lat1]);
  const to = turf.point([lon2, lat2]);
  return turf.distance(from, to, { units: 'kilometers' });
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
  const [roads] = await pool.execute<Road[]>(
    'SELECT * FROM roads WHERE is_active = TRUE'
  );

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
  const [intersections] = await pool.execute<Intersection[]>(
    'SELECT id, name, latitude, longitude, point_type FROM intersections'
  );

  if (intersections.length === 0) return null;

  let nearest = intersections[0];
  let minDistance = haversineDistance(latitude, longitude, nearest.latitude, nearest.longitude);

  for (const intersection of intersections) {
    const distance = haversineDistance(latitude, longitude, intersection.latitude, intersection.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = intersection;
    }
  }

  return nearest;
}

/**
 * Calculate route from GPS coordinates to GPS coordinates
 */
export async function calculateRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  optimizeFor: 'distance' | 'time' = 'distance'
): Promise<RouteResult> {
  // Find nearest intersections
  const startIntersection = await findNearestIntersection(startLat, startLon);
  const endIntersection = await findNearestIntersection(endLat, endLon);

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

  // Run A* pathfinding
  return findShortestPath(startIntersection.id, endIntersection.id, optimizeFor);
}
