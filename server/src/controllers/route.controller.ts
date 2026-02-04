import { Request, Response } from 'express';
import {
  findShortestPath,
  calculateRoute,
  findNearestIntersection,
  recalculateRoute,
  checkIfOffCourse,
} from '../services/pathfinding.service';
import { AuthRequest } from '../types';

/**
 * Calculate route between two intersections
 */
export const calculateRouteByIntersections = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_intersection_id, end_intersection_id, optimize_for = 'distance' } = req.body;

    if (!start_intersection_id || !end_intersection_id) {
      res.status(400).json({
        success: false,
        message: 'start_intersection_id and end_intersection_id are required',
      });
      return;
    }

    const result = await findShortestPath(start_intersection_id, end_intersection_id, optimize_for);

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: 'No route found between the specified intersections',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        path: result.path,
        roads: result.roads,
        totalDistance: result.totalDistance,
        estimatedTime: result.estimatedTime,
        steps: result.steps,
        virtualConnections: result.virtualConnections,
        optimizedFor: optimize_for,
      },
    });
  } catch (error) {
    console.error('Error calculating route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate route',
    });
  }
};

/**
 * Calculate route between two GPS coordinates
 */
export const calculateRouteByCoordinates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { start_lat, start_lon, end_lat, end_lon, optimize_for = 'distance' } = req.body;

    if (!start_lat || !start_lon || !end_lat || !end_lon) {
      res.status(400).json({
        success: false,
        message: 'start_lat, start_lon, end_lat, and end_lon are required',
      });
      return;
    }

    const result = await calculateRoute(
      parseFloat(start_lat),
      parseFloat(start_lon),
      parseFloat(end_lat),
      parseFloat(end_lon),
      optimize_for
    );

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: 'No route found between the specified coordinates',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        path: result.path,
        roads: result.roads,
        totalDistance: result.totalDistance,
        estimatedTime: result.estimatedTime,
        steps: result.steps,
        optimizedFor: optimize_for,
      },
    });
  } catch (error) {
    console.error('Error calculating route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate route',
    });
  }
};

/**
 * Find nearest intersection to GPS coordinates
 */
export const getNearestIntersection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      res.status(400).json({
        success: false,
        message: 'latitude and longitude are required',
      });
      return;
    }

    const intersection = await findNearestIntersection(parseFloat(latitude as string), parseFloat(longitude as string));

    if (!intersection) {
      res.status(404).json({
        success: false,
        message: 'No intersections found in the database',
      });
      return;
    }

    res.json({
      success: true,
      data: intersection,
    });
  } catch (error) {
    console.error('Error finding nearest intersection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearest intersection',
    });
  }
};

/**
 * Recalculate route from current position (for off-course scenarios)
 */
export const recalculateRouteFromCurrent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { current_lat, current_lon, destination_lat, destination_lon, optimize_for = 'distance', threshold = 0.1 } = req.body;

    if (!current_lat || !current_lon || !destination_lat || !destination_lon) {
      res.status(400).json({
        success: false,
        message: 'current_lat, current_lon, destination_lat, and destination_lon are required',
      });
      return;
    }

    const result = await recalculateRoute(
      parseFloat(current_lat),
      parseFloat(current_lon),
      parseFloat(destination_lat),
      parseFloat(destination_lon),
      optimize_for,
      parseFloat(threshold)
    );

    if (!result.route || !result.route.success) {
      res.status(404).json({
        success: false,
        message: 'Could not recalculate route from current position',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        needsRecalculation: result.needsRecalculation,
        offCourseDistance: result.offCourseDistance,
        newRoute: {
          path: result.route.path,
          roads: result.route.roads,
          totalDistance: result.route.totalDistance,
          estimatedTime: result.route.estimatedTime,
          steps: result.route.steps,
          virtualConnections: result.route.virtualConnections,
        },
        optimizedFor: optimize_for,
      },
    });
  } catch (error) {
    console.error('Error recalculating route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate route',
    });
  }
};

/**
 * Check if user is off course
 */
export const checkOffCourse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { current_lat, current_lon, planned_path, planned_roads, threshold = 0.15 } = req.body;

    if (!current_lat || !current_lon || !planned_path || !planned_roads) {
      res.status(400).json({
        success: false,
        message: 'current_lat, current_lon, planned_path, and planned_roads are required',
      });
      return;
    }

    const result = await checkIfOffCourse(
      parseFloat(current_lat),
      parseFloat(current_lon),
      planned_path,
      planned_roads,
      parseFloat(threshold)
    );

    res.json({
      success: true,
      data: {
        isOffCourse: result.isOffCourse,
        distance: result.distance,
        nearestRoadIndex: result.nearestRoadIndex,
        threshold,
      },
    });
  } catch (error) {
    console.error('Error checking off course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check off course status',
    });
  }
};
