import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody } from "@heroui/card";
import AdminLayout from '@/layouts/admin';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';
import type { GeoJSONFeatureCollection } from '@/types/api';
import { toast } from '@/lib/toast';
import Head from 'next/head';

// Dynamic import to avoid SSR issues with Leaflet
const MapManager = dynamic(() => import('@/components/MapManager'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p>Loading map...</p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  // Fetch GeoJSON data
  const { data: geojsonData, isLoading, refetch } = useQuery<GeoJSONFeatureCollection>({
    queryKey: ['geojson'],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}${API_ENDPOINTS.INTERSECTIONS_GEOJSON}`);
      if (!response.ok) {
        throw new Error('Failed to fetch GeoJSON');
      }
      return response.json();
    },
  });

  const handleSavePoint = async (point: any) => {
    try {
      console.log('Saving point:', point);

      // Call the backend API to save the intersection point
      const response = await apiClient.post(API_ENDPOINTS.INTERSECTIONS, point);

      if (response.success) {
        // Refetch data to show the new point
        await refetch();
        toast.success(`${point.point_type.replace('_', ' ')} added successfully!`);
      } else {
        throw new Error(response.error || 'Failed to save point');
      }
    } catch (error: any) {
      console.error('Error saving point:', error);
      toast.error(error.message || 'Failed to save point');
      throw error;
    }
  };

  const handleSaveRoad = async (road: any) => {
    try {
      console.log('Saving road:', road);

      // Need to find start and end intersections
      // For now, we'll get all intersections and find the nearest ones
      const allIntersections = await apiClient.get<any[]>(API_ENDPOINTS.INTERSECTIONS);

      if (allIntersections.success && allIntersections.data && Array.isArray(allIntersections.data)) {
        const intersections: any[] = allIntersections.data;

        // Find nearest intersection to start point
        const startPoint = road.path[0];
        const endPoint = road.path[road.path.length - 1];

        const findNearest = (point: [number, number], intersections: any[]) => {
          let minDist = Infinity;
          let nearest = null;

          for (const int of intersections) {
            const dist = Math.sqrt(
              Math.pow(int.latitude - point[0], 2) + Math.pow(int.longitude - point[1], 2)
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

        // Call the backend API to save the road
        const roadData = {
          name: road.name,
          description: road.description,
          start_intersection_id: startIntersection.id,
          end_intersection_id: endIntersection.id,
          road_type: road.road_type,
          path: road.path,
          is_bidirectional: road.is_bidirectional,
        };

        const response = await apiClient.post(API_ENDPOINTS.ROADS, roadData);

        if (response.success) {
          toast.success('Road saved successfully!');
        } else {
          throw new Error(response.error || 'Failed to save road');
        }
      }
    } catch (error: any) {
      console.error('Error saving road:', error);
      toast.error(error.message || 'Failed to save road');
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
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Loading intersection data...</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card className="h-[calc(100vh-12rem)]">
          <CardBody className="p-0 overflow-hidden">
            <MapManager
              geojsonData={geojsonData}
              onSavePoint={handleSavePoint}
              onSaveRoad={handleSaveRoad}
            />
          </CardBody>
        </Card>
      )}

      {/* Instructions */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Adding Points</h3>
            <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>1. Click "Add Point" button</li>
              <li>2. Select point type (Tourist Spot, Bus Terminal, etc.)</li>
              <li>3. Click on map to place point</li>
              <li>4. Enter name and address</li>
              <li>5. Save</li>
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Drawing Roads</h3>
            <ol className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>1. Click "Add Road" button</li>
              <li>2. Select road type (Highway, Main Road, Local)</li>
              <li>3. Click points along the road path</li>
              <li>4. Click "Finish Road"</li>
              <li>5. Enter road name and save</li>
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Point Types</h3>
            <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>• <strong>Tourist Spot</strong>: Destinations</li>
              <li>• <strong>Bus Terminal</strong>: Major hubs</li>
              <li>• <strong>Bus Stop</strong>: Transit points</li>
              <li>• <strong>Pier</strong>: Ferry terminals</li>
              <li>• <strong>Intersection</strong>: Road junctions</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
