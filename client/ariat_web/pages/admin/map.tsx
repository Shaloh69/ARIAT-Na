import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody } from "@heroui/card";
import AdminLayout from '@/layouts/admin';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';
import type { GeoJSONFeatureCollection } from '@/types/api';
// Split imports - heroui uses individual packages
import { toast } from 'sonner';
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
      // In a real implementation, this would call the API to save the point
      // For now, we'll simulate the API call
      console.log('Saving point:', point);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // In production, uncomment this:
      // await apiClient.post('/intersections', point);

      // Refetch data
      await refetch();

      toast.success(`${point.point_type} added successfully!`);
    } catch (error) {
      console.error('Error saving point:', error);
      throw error;
    }
  };

  const handleSaveRoad = async (road: any) => {
    try {
      // In a real implementation, this would call the API to save the road
      console.log('Saving road:', road);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // In production, uncomment this:
      // await apiClient.post('/roads', road);

      toast.success('Road saved successfully!');
    } catch (error) {
      console.error('Error saving road:', error);
      throw error;
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Map Manager - ARIAT-NA Admin</title>
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
