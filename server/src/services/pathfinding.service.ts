/**
 * A* Pathfinding Service for GPS-based Road Networks
 * Uses Haversine distance for heuristic and actual road distances for cost
 * Supports road interpolation (virtual nodes every ~100m) for precise snapping
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
  routeGeometry?: [number, number][]; // Full polyline coordinates [lat, lng] following actual road paths
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
const INTERPOLATION_INTERVAL = 0.1; // ~100 meters between virtual nodes

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
): { point: [number, number]; distance: number; index: number } {
  const targetPoint = turf.point([lon, lat]);
  const line = turf.lineString(roadPath.map((p) => [p[1], p[0]])); // Convert to [lon, lat]

  const snapped = turf.nearestPointOnLine(line, targetPoint, { units: 'kilometers' });

  return {
    point: [snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]], // Convert back to [lat, lon]
    distance: snapped.properties.dist || 0,
    index: snapped.properties.index || 0,
  };
}

/**
 * Interpolate points along a road path at regular intervals
 * Returns virtual intersection nodes placed every ~INTERPOLATION_INTERVAL km
 */
function interpolateRoadPoints(
  roadPath: [number, number][],
  roadId: string,
  roadName: string
): { nodes: Intersection[]; segmentDistances: number[] } {
  if (!roadPath || roadPath.length < 2) return { nodes: [], segmentDistances: [] };

  const nodes: Intersection[] = [];
  const segmentDistances: number[] = [];

  // Convert road path to turf line [lon, lat]
  const lineCoords = roadPath.map((p) => [p[1], p[0]]);
  const line = turf.lineString(lineCoords);
  const totalLength = turf.length(line, { units: 'kilometers' });

  if (totalLength < INTERPOLATION_INTERVAL) {
    // Road is shorter than the interval — no intermediate nodes needed
    return { nodes: [], segmentDistances: [] };
  }

  // Generate points at regular intervals along the road
  let distAlong = INTERPOLATION_INTERVAL;
  while (distAlong < totalLength) {
    const interpolatedPoint = turf.along(line, distAlong, { units: 'kilometers' });
    const [lon, lat] = interpolatedPoint.geometry.coordinates;

    const virtualNode = {
      id: `virtual_${roadId}_${Math.round(distAlong * 1000)}`,
      name: `${roadName} (${distAlong.toFixed(1)}km)`,
      latitude: lat,
      longitude: lon,
      point_type: 'virtual',
    } as Intersection;

    nodes.push(virtualNode);
    segmentDistances.push(distAlong);
    distAlong += INTERPOLATION_INTERVAL;
  }

  return { nodes, segmentDistances };
}

/**
 * Find nearest intersection or road node to GPS coordinates
 * Now considers interpolated virtual nodes for better precision
 */
async function findNearestRoadNode(
  latitude: number,
  longitude: number,
  allNodes?: Map<string, Intersection>
): Promise<{
  intersection: Intersection;
  distance: number;
  needsVirtualConnection: boolean;
  virtualConnectionPoint?: [number, number];
}> {
  // If we have a pre-built graph with virtual nodes, use it for better precision
  if (allNodes && allNodes.size > 0) {
    let nearestNode: Intersection | null = null;
    let minDistance = Infinity;

    for (const node of allNodes.values()) {
      const distance = haversineDistance(latitude, longitude, node.latitude, node.longitude);
      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    }

    if (nearestNode) {
      return {
        intersection: nearestNode,
        distance: minDistance,
        needsVirtualConnection: minDistance > 0.05, // > 50m needs virtual connection
      };
    }
  }

  // Fallback: query database directly
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
 * Now includes interpolated virtual nodes every ~100m along roads
 */
async function buildGraph(): Promise<{
  intersections: Map<string, Intersection>;
  adjacencyList: Map<string, Array<{ road: Road; neighbor: string }>>;
  roadPaths: Map<string, [number, number][]>; // original road ID → path geometry [lat, lng]
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

  // Build adjacency list and store original road paths
  const adjacencyList = new Map<string, Array<{ road: Road; neighbor: string }>>();
  const roadPaths = new Map<string, [number, number][]>();

  for (const road of roads) {
    let roadPath: [number, number][] | null = null;
    if (road.path && Array.isArray(road.path) && road.path.length >= 2) {
      roadPath = road.path;
      // Store original road path for route geometry building
      roadPaths.set(road.id, roadPath);
    }

    // Interpolate virtual nodes along the road path
    const { nodes: virtualNodes, segmentDistances } = roadPath
      ? interpolateRoadPoints(roadPath, road.id, road.name)
      : { nodes: [], segmentDistances: [] };

    if (virtualNodes.length > 0) {
      // Add virtual nodes to the intersection map
      for (const vNode of virtualNodes) {
        intersectionMap.set(vNode.id, vNode);
      }

      // Calculate total road length for time estimation
      const totalRoadLength = road.distance || 1;
      const totalRoadTime = road.estimated_time || 1;
      const timePerKm = totalRoadTime / totalRoadLength;

      // Build chain: start → v1 → v2 → ... → vN → end
      const chainIds = [
        road.start_intersection_id,
        ...virtualNodes.map((v) => v.id),
        road.end_intersection_id,
      ];

      // Distances for each segment: [0, d1, d2, ..., dN, totalLength]
      const chainDistances = [0, ...segmentDistances, totalRoadLength];

      for (let i = 0; i < chainIds.length - 1; i++) {
        const fromId = chainIds[i];
        const toId = chainIds[i + 1];
        const segDist = Math.max(0.001, chainDistances[i + 1] - chainDistances[i]);
        const segTime = segDist * timePerKm;

        // Create a virtual road segment for this edge
        const segmentRoad = {
          ...road,
          id: `${road.id}_seg_${i}`,
          name: road.name,
          start_intersection_id: fromId,
          end_intersection_id: toId,
          distance: segDist,
          estimated_time: segTime,
        } as Road;

        // Forward edge
        if (!adjacencyList.has(fromId)) adjacencyList.set(fromId, []);
        adjacencyList.get(fromId)!.push({ road: segmentRoad, neighbor: toId });

        // Reverse edge if bidirectional
        if (road.is_bidirectional) {
          const reverseRoad = {
            ...segmentRoad,
            start_intersection_id: toId,
            end_intersection_id: fromId,
          } as Road;
          if (!adjacencyList.has(toId)) adjacencyList.set(toId, []);
          adjacencyList.get(toId)!.push({ road: reverseRoad, neighbor: fromId });
        }
      }
    } else {
      // No interpolation needed — add direct edges (original behavior)
      if (!adjacencyList.has(road.start_intersection_id)) {
        adjacencyList.set(road.start_intersection_id, []);
      }
      adjacencyList.get(road.start_intersection_id)!.push({
        road,
        neighbor: road.end_intersection_id,
      });

      if (road.is_bidirectional) {
        if (!adjacencyList.has(road.end_intersection_id)) {
          adjacencyList.set(road.end_intersection_id, []);
        }
        adjacencyList.get(road.end_intersection_id)!.push({
          road: {
            ...road,
            start_intersection_id: road.end_intersection_id,
            end_intersection_id: road.start_intersection_id,
          },
          neighbor: road.start_intersection_id,
        });
      }
    }
  }

  return { intersections: intersectionMap, adjacencyList, roadPaths };
}

/**
 * A* Pathfinding Algorithm
 */
export async function findShortestPath(
  startIntersectionId: string,
  endIntersectionId: string,
  optimizeFor: 'distance' | 'time' = 'distance',
  prebuiltGraph?: {
    intersections: Map<string, Intersection>;
    adjacencyList: Map<string, Array<{ road: Road; neighbor: string }>>;
    roadPaths: Map<string, [number, number][]>;
  }
): Promise<RouteResult> {
  const { intersections, adjacencyList, roadPaths } = prebuiltGraph || await buildGraph();

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

  // Same start and end — return immediately
  if (startIntersectionId === endIntersectionId) {
    return {
      success: true,
      path: [startIntersection],
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
      return reconstructPath(current, optimizeFor, roadPaths);
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
 * Consolidates consecutive segments of the same road into single steps
 */
function reconstructPath(
  goalNode: PathNode,
  optimizeFor: 'distance' | 'time',
  roadPaths: Map<string, [number, number][]>
): RouteResult {
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

  // Consolidate road segments into named road steps
  // (virtual segments of the same road should be combined)
  let i = 0;
  while (i < roads.length) {
    const road = roads[i];
    // Extract the base road name (strip segment suffix)
    const baseName = road.name;

    let segmentDistance = road.distance;
    let segmentTime = road.estimated_time;
    const from = path[i];
    let to = path[i + 1];

    // Consolidate consecutive segments of the same named road
    let j = i + 1;
    while (j < roads.length && roads[j].name === baseName) {
      segmentDistance += roads[j].distance;
      segmentTime += roads[j].estimated_time;
      to = path[j + 1];
      j++;
    }

    totalDistance += segmentDistance;
    totalTime += segmentTime;

    // Only add step for real, named road transitions (skip internal virtual segments)
    steps.push({
      instruction: `Take ${baseName} ${road.is_bidirectional ? '(two-way)' : '(one-way)'}`,
      roadName: baseName,
      distance: segmentDistance,
      time: segmentTime,
      from: from.name,
      to: to.name,
    });

    i = j;
  }

  // Build route geometry from actual road paths for precise polyline rendering
  const routeGeometry: [number, number][] = [];

  for (let k = 0; k < roads.length; k++) {
    const road = roads[k];
    const fromNode = path[k];
    const toNode = path[k + 1];

    // Get original road ID (strip _seg_N suffix from virtual segments)
    const originalRoadId = road.id.replace(/_seg_\d+$/, '');
    const fullPath = roadPaths.get(originalRoadId);

    if (fullPath && fullPath.length >= 2) {
      try {
        // Use turf.lineSlice to extract the portion between fromNode and toNode
        const line = turf.lineString(fullPath.map((p) => [p[1], p[0]])); // Convert to [lon, lat]
        const startPt = turf.point([fromNode.longitude, fromNode.latitude]);
        const endPt = turf.point([toNode.longitude, toNode.latitude]);
        const sliced = turf.lineSlice(startPt, endPt, line);

        // Convert back to [lat, lon]
        const slicedCoords = sliced.geometry.coordinates.map(
          (c) => [c[1], c[0]] as [number, number]
        );

        // Check if we need to reverse (route goes backward along this road)
        if (slicedCoords.length >= 2) {
          const firstCoord = slicedCoords[0];
          const lastCoord = slicedCoords[slicedCoords.length - 1];
          const distFirstToFrom = haversineDistance(
            firstCoord[0], firstCoord[1], fromNode.latitude, fromNode.longitude
          );
          const distLastToFrom = haversineDistance(
            lastCoord[0], lastCoord[1], fromNode.latitude, fromNode.longitude
          );
          if (distLastToFrom < distFirstToFrom) {
            slicedCoords.reverse();
          }
        }

        // Append coordinates, skipping first point on subsequent segments to avoid duplicates
        if (routeGeometry.length > 0 && slicedCoords.length > 0) {
          routeGeometry.push(...slicedCoords.slice(1));
        } else {
          routeGeometry.push(...slicedCoords);
        }
      } catch {
        // Fallback: use straight line between nodes
        if (routeGeometry.length === 0) {
          routeGeometry.push([fromNode.latitude, fromNode.longitude]);
        }
        routeGeometry.push([toNode.latitude, toNode.longitude]);
      }
    } else {
      // No path available for this road, use straight line
      if (routeGeometry.length === 0) {
        routeGeometry.push([fromNode.latitude, fromNode.longitude]);
      }
      routeGeometry.push([toNode.latitude, toNode.longitude]);
    }
  }

  return {
    success: true,
    path,
    roads,
    totalDistance,
    estimatedTime: totalTime,
    steps,
    routeGeometry: routeGeometry.length >= 2 ? routeGeometry : undefined,
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
 * Uses interpolated road nodes for precise snapping
 */
export async function calculateRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  optimizeFor: 'distance' | 'time' = 'distance'
): Promise<RouteResult> {
  // Build the enriched graph with virtual nodes
  const { intersections: allNodes, adjacencyList, roadPaths } = await buildGraph();

  // Find nearest nodes using the enriched graph (includes interpolated points)
  const startNode = await findNearestRoadNode(startLat, startLon, allNodes);
  const endNode = await findNearestRoadNode(endLat, endLon, allNodes);

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

  // Same node? If they're very close, it's a zero-distance route
  if (startNode.intersection.id === endNode.intersection.id) {
    const directDist = haversineDistance(startLat, startLon, endLat, endLon);
    if (directDist < 0.05) {
      // < 50m apart, basically same location
      return {
        success: true,
        path: [startNode.intersection],
        roads: [],
        totalDistance: directDist,
        estimatedTime: Math.max(1, Math.round((directDist / 5) * 60)),
        steps: [{
          instruction: 'Walk to destination',
          roadName: 'Direct path',
          distance: directDist,
          time: Math.max(1, Math.round((directDist / 5) * 60)),
          from: 'Starting Point',
          to: 'Destination',
        }],
      };
    }
  }

  // Run A* pathfinding using the pre-built graph (avoids rebuilding it)
  const result = await findShortestPath(
    startNode.intersection.id,
    endNode.intersection.id,
    optimizeFor,
    { intersections: allNodes, adjacencyList, roadPaths }
  );

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
    result.estimatedTime += Math.max(1, Math.round((walkDistance / 5) * 60)); // Walking speed ~5 km/h
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
    result.estimatedTime += Math.max(1, Math.round((walkDistance / 5) * 60)); // Walking speed ~5 km/h
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
