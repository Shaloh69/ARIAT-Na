import { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';

interface Road {
  id: string;
  name: string;
  description?: string;
  start_intersection_id: string;
  end_intersection_id: string;
  road_type: string;
  distance: number;
  estimated_time: number;
  is_active: boolean;
  is_bidirectional: boolean;
  created_at: string;
}

interface Intersection {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export default function RoadsPage() {
  const [roads, setRoads] = useState<Road[]>([]);
  const [intersections, setIntersections] = useState<Map<string, Intersection>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch roads and intersections in parallel
      const [roadsResponse, intersectionsResponse] = await Promise.all([
        apiClient.get<Road[]>(API_ENDPOINTS.ROADS),
        apiClient.get<Intersection[]>(API_ENDPOINTS.INTERSECTIONS),
      ]);

      if (roadsResponse.success && roadsResponse.data) {
        setRoads(roadsResponse.data);
      }

      if (intersectionsResponse.success && intersectionsResponse.data) {
        const map = new Map<string, Intersection>();
        intersectionsResponse.data.forEach((int: Intersection) => {
          map.set(int.id, int);
        });
        setIntersections(map);
      }
    } catch (error) {
      toast.error('Failed to fetch roads');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (road: Road) => {
    try {
      const response = await apiClient.put(`${API_ENDPOINTS.ROADS}/${road.id}`, {
        is_active: !road.is_active,
      });
      if (response.success) {
        toast.success(`Road ${road.is_active ? 'deactivated' : 'activated'} successfully`);
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to update road');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this road?')) return;

    try {
      const response = await apiClient.delete(`${API_ENDPOINTS.ROADS}/${id}`);
      if (response.success) {
        toast.success('Road deleted successfully');
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to delete road');
    }
  };

  const getRoadTypeColor = (type: string) => {
    const colors: Record<string, any> = {
      highway: 'primary',
      main_road: 'secondary',
      local_road: 'default',
    };
    return colors[type] || 'default';
  };

  const getRoadTypeName = (type: string) => {
    const names: Record<string, string> = {
      highway: 'Highway',
      main_road: 'Main Road',
      local_road: 'Local Road',
    };
    return names[type] || type;
  };

  return (
    <AdminLayout>
      <Head>
        <title>Roads - AIRAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Roads</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage road network ({roads.length} total roads)
            </p>
          </div>
          <Button color="primary" onClick={() => (window.location.href = '/admin/map')}>
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Add Road on Map
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-gray-600">Loading roads...</p>
            </CardBody>
          </Card>
        ) : roads.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-gray-600 dark:text-gray-400 mb-2">No roads yet</p>
              <p className="text-sm text-gray-500 mb-4">Create roads using the Map Manager</p>
              <Button color="primary" onClick={() => (window.location.href = '/admin/map')}>
                Go to Map Manager
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            {roads.map((road) => {
              const startIntersection = intersections.get(road.start_intersection_id);
              const endIntersection = intersections.get(road.end_intersection_id);

              return (
                <Card key={road.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{road.name}</h3>
                        <Chip size="sm" color={getRoadTypeColor(road.road_type)} variant="flat">
                          {getRoadTypeName(road.road_type)}
                        </Chip>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Chip size="sm" color={road.is_active ? 'success' : 'default'} variant="flat">
                        {road.is_active ? 'Active' : 'Inactive'}
                      </Chip>
                      {road.is_bidirectional ? (
                        <Chip size="sm" color="primary" variant="flat">
                          ↔ Two-way
                        </Chip>
                      ) : (
                        <Chip size="sm" color="warning" variant="flat">
                          → One-way
                        </Chip>
                      )}
                    </div>
                  </CardHeader>
                  <CardBody className="pt-2">
                    {road.description && (
                      <p className="text-sm text-gray-500 mb-3">{road.description}</p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Start Point</p>
                        <p className="text-sm font-medium">
                          {startIntersection?.name || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">End Point</p>
                        <p className="text-sm font-medium">
                          {endIntersection?.name || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Distance</p>
                        <p className="text-sm font-medium">{road.distance.toFixed(2)} km</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Estimated Time</p>
                        <p className="text-sm font-medium">{road.estimated_time} min</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        color={road.is_active ? 'warning' : 'success'}
                        variant="flat"
                        onClick={() => handleToggleActive(road)}
                      >
                        {road.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button size="sm" color="danger" variant="flat" onClick={() => handleDelete(road.id)}>
                        Delete
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
