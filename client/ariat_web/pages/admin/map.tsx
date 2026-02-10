import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody } from "@heroui/card";
import AdminLayout from '@/layouts/admin';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';
import type { GeoJSONFeatureCollection } from '@/types/api';
import type { RouteResult, NewDestination, CategoryOption, DestinationsGeoJSON } from '@/components/MapManager';
import { toast } from '@/lib/toast';
import Head from 'next/head';

// Dynamic import to avoid SSR issues with Leaflet
const MapManager = dynamic(() => import('@/components/MapManager'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <img
            src="/android-chrome-192x192.png"
            alt="AIRAT-NA"
            className="h-16 w-16 object-contain animate-pulse"
          />
          <div
            className="absolute inset-[-6px] rounded-full border-3 border-transparent animate-spin"
            style={{ borderTopColor: '#f43f5e', borderRightColor: '#fda4af' }}
          />
        </div>
        <p style={{ color: 'var(--text-muted)' }}>Loading map...</p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // Fetch intersection GeoJSON data
  const { data: geojsonData, isLoading, refetch } = useQuery<GeoJSONFeatureCollection>({
    queryKey: ['geojson'],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}${API_ENDPOINTS.INTERSECTIONS_GEOJSON}`);
      if (!response.ok) throw new Error('Failed to fetch GeoJSON');
      return response.json();
    },
  });

  // Fetch road GeoJSON data
  const { data: roadsGeojsonData, refetch: refetchRoads } = useQuery({
    queryKey: ['roads-geojson'],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}${API_ENDPOINTS.ROADS_GEOJSON}`);
      if (!response.ok) throw new Error('Failed to fetch roads GeoJSON');
      return response.json();
    },
  });

  // Fetch destinations GeoJSON data for map display
  const { data: destinationsGeojsonData, refetch: refetchDestinations } = useQuery<DestinationsGeoJSON>({
    queryKey: ['destinations-geojson'],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}${API_ENDPOINTS.DESTINATIONS_GEOJSON}`);
      if (!response.ok) throw new Error('Failed to fetch destinations GeoJSON');
      return response.json();
    },
  });

  // Fetch categories for destination creation
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await apiClient.get<CategoryOption[]>(API_ENDPOINTS.CATEGORIES);
        if (response.success && response.data) {
          setCategories(response.data);
        }
      } catch {
        toast.warning('Could not load categories — destination creation may be limited');
      }
    };
    fetchCategories();
  }, []);

  const handleSavePoint = async (point: any) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.INTERSECTIONS, point);

      if (response.success) {
        await refetch();
        toast.success(`${point.point_type.replace('_', ' ')} added successfully!`);
      } else {
        throw new Error(response.error || 'Failed to save point');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || 'Failed to save point';
      toast.error(msg);
      throw error;
    }
  };

  const handleSaveRoad = async (road: any) => {
    try {
      // Find start and end intersections
      const allIntersections = await apiClient.get<any[]>(API_ENDPOINTS.INTERSECTIONS);

      if (!allIntersections.success || !allIntersections.data || !Array.isArray(allIntersections.data)) {
        toast.error('Could not load intersections. Please try again.');
        return;
      }

      const intersections: any[] = allIntersections.data;

      if (intersections.length === 0) {
        toast.error('No intersections found. Please add intersection points first.');
        return;
      }

      const startPoint = road.path[0];
      const endPoint = road.path[road.path.length - 1];

      const findNearest = (point: [number, number], ints: any[]) => {
        let minDist = Infinity;
        let nearest = null;

        for (const int of ints) {
          const lat = Number(int.latitude);
          const lng = Number(int.longitude);
          const dist = Math.sqrt(
            Math.pow(lat - point[0], 2) + Math.pow(lng - point[1], 2)
          );
          if (dist < minDist) {
            minDist = dist;
            nearest = int;
          }
        }
        return nearest;
      };

      const startIntersection = findNearest(startPoint, intersections);
      const endIntersection = findNearest(endPoint, intersections);

      if (!startIntersection || !endIntersection) {
        toast.error('Could not find nearby intersections. Please add intersection points first.');
        return;
      }

      const roadData = {
        name: road.name,
        description: road.description || undefined,
        start_intersection_id: startIntersection.id,
        end_intersection_id: endIntersection.id,
        road_type: road.road_type,
        path: road.path,
        is_bidirectional: road.is_bidirectional,
      };

      const response = await apiClient.post(API_ENDPOINTS.ROADS, roadData);

      if (response.success) {
        await refetchRoads();
        toast.success('Road saved successfully!');
      } else {
        throw new Error(response.error || 'Failed to save road');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || 'Failed to save road';
      toast.error(msg);
      throw error;
    }
  };

  const handleSaveDestination = async (dest: NewDestination) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.DESTINATIONS, {
        ...dest,
        images: dest.images || undefined,
        amenities: dest.amenities || undefined,
      });

      if (response.success) {
        await refetchDestinations();
        toast.success('Destination created successfully!');
      } else {
        throw new Error(response.error || 'Failed to create destination');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || 'Failed to create destination';
      toast.error(msg);
      throw error;
    }
  };

  const handleCalculateRoute = async (
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    optimizeFor: string
  ): Promise<RouteResult | null> => {
    try {
      const response = await apiClient.post<RouteResult>(`${API_ENDPOINTS.ROUTES}/calculate-gps`, {
        start_lat: startLat,
        start_lon: startLon,
        end_lat: endLat,
        end_lon: endLon,
        optimize_for: optimizeFor,
      });

      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || 'Failed to calculate route';
      toast.error(msg);
      throw error;
    }
  };

  const handleDeletePoint = async (id: string) => {
    try {
      const response = await apiClient.delete(`${API_ENDPOINTS.INTERSECTIONS}/${id}`);
      if (response.success) {
        await refetch();
        toast.success('Point deleted');
      } else {
        throw new Error(response.error || 'Failed to delete point');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || 'Failed to delete point';
      toast.error(msg);
      throw error;
    }
  };

  const handleUpdatePoint = async (id: string, data: { name: string }) => {
    try {
      const response = await apiClient.put(`${API_ENDPOINTS.INTERSECTIONS}/${id}`, data);
      if (response.success) {
        await refetch();
        toast.success('Point updated');
      } else {
        throw new Error(response.error || 'Failed to update point');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message || 'Failed to update point';
      toast.error(msg);
      throw error;
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Map Manager - AIRAT-NA Admin</title>
      </Head>

      {isLoading ? (
        <Card className="h-[calc(100vh-12rem)]">
          <CardBody className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <img
                  src="/android-chrome-192x192.png"
                  alt="AIRAT-NA"
                  className="h-16 w-16 object-contain animate-pulse"
                />
                <div
                  className="absolute inset-[-6px] rounded-full border-3 border-transparent animate-spin"
                  style={{ borderTopColor: '#f43f5e', borderRightColor: '#fda4af' }}
                />
              </div>
              <p style={{ color: 'var(--text-muted)' }}>Loading intersection data...</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card className="h-[calc(100vh-12rem)]">
          <CardBody className="p-0 overflow-hidden">
            <MapManager
              geojsonData={geojsonData}
              roadsGeojsonData={roadsGeojsonData}
              destinationsGeojsonData={destinationsGeojsonData}
              categories={categories}
              onSavePoint={handleSavePoint}
              onSaveRoad={handleSaveRoad}
              onSaveDestination={handleSaveDestination}
              onCalculateRoute={handleCalculateRoute}
              onDeletePoint={handleDeletePoint}
              onUpdatePoint={handleUpdatePoint}
            />
          </CardBody>
        </Card>
      )}

      {/* Instructions */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Adding Points & Destinations</h3>
            <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>1. Select "Point" or "Dest." mode</li>
              <li>2. For points: choose type, click map, enter name</li>
              <li>3. For destinations: click map, fill in details</li>
              <li>4. Save to create the entry</li>
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Drawing Roads</h3>
            <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>1. Select "Road" mode</li>
              <li>2. Choose road type</li>
              <li>3. Click points along the road path</li>
              <li>4. Click "Finish Road" and enter name</li>
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Testing Routes</h3>
            <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>1. Select "Route" mode</li>
              <li>2. Choose optimization (distance/time)</li>
              <li>3. Click start point on map</li>
              <li>4. Click destination — route auto-calculates</li>
            </ol>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
