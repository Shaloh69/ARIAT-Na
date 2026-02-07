import { useState } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Chip } from '@heroui/chip';
import { toast } from '@/lib/toast';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';

interface RouteResult {
  path: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>;
  roads: Array<{
    id: string;
    name: string;
    distance: number;
    estimated_time: number;
    is_bidirectional: boolean;
  }>;
  totalDistance: number;
  estimatedTime: number;
  steps: Array<{
    instruction: string;
    roadName: string;
    distance: number;
    time: number;
    from: string;
    to: string;
  }>;
  virtualConnections?: Array<{
    type: 'start' | 'end';
    from: { lat: number; lon: number; name?: string };
    to: { lat: number; lon: number; name: string };
    distance: number;
    isVirtual: true;
  }>;
}

export default function RouteTestPage() {
  const [loading, setLoading] = useState(false);
  const [testType, setTestType] = useState<'gps' | 'intersection'>('gps');
  const [gpsForm, setGpsForm] = useState({
    start_lat: '10.3157',
    start_lon: '123.8854',
    end_lat: '10.3200',
    end_lon: '123.8900',
  });
  const [optimizeFor, setOptimizeFor] = useState<'distance' | 'time'>('distance');
  const [result, setResult] = useState<RouteResult | null>(null);

  const handleCalculateRoute = async () => {
    if (testType === 'gps') {
      if (!gpsForm.start_lat || !gpsForm.start_lon || !gpsForm.end_lat || !gpsForm.end_lon) {
        toast.error('Please fill in all GPS coordinates');
        return;
      }

      try {
        setLoading(true);
        const response = await apiClient.post<RouteResult>(`${API_ENDPOINTS.ROUTES}/calculate-gps`, {
          start_lat: parseFloat(gpsForm.start_lat),
          start_lon: parseFloat(gpsForm.start_lon),
          end_lat: parseFloat(gpsForm.end_lat),
          end_lon: parseFloat(gpsForm.end_lon),
          optimize_for: optimizeFor,
        });

        if (response.success && response.data) {
          setResult(response.data);
          toast.success('Route calculated successfully!');
        } else {
          toast.error('No route found');
        }
      } catch (error) {
        toast.error('Failed to calculate route');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClear = () => {
    setResult(null);
    setGpsForm({
      start_lat: '10.3157',
      start_lon: '123.8854',
      end_lat: '10.3200',
      end_lon: '123.8900',
    });
  };

  return (
    <AdminLayout>
      <Head>
        <title>Route Testing - AIRAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Route Testing</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Test A* pathfinding algorithm with GPS coordinates
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Route Parameters</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <Select
                label="Optimization"
                selectedKeys={[optimizeFor]}
                onChange={(e) => setOptimizeFor(e.target.value as 'distance' | 'time')}
              >
                <SelectItem key="distance">Shortest Distance</SelectItem>
                <SelectItem key="time">Fastest Time</SelectItem>
              </Select>

              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="font-medium mb-2">Starting Point</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Latitude"
                    type="number"
                    step="0.000001"
                    placeholder="10.3157"
                    value={gpsForm.start_lat}
                    onChange={(e) => setGpsForm({ ...gpsForm, start_lat: e.target.value })}
                  />
                  <Input
                    label="Longitude"
                    type="number"
                    step="0.000001"
                    placeholder="123.8854"
                    value={gpsForm.start_lon}
                    onChange={(e) => setGpsForm({ ...gpsForm, start_lon: e.target.value })}
                  />
                </div>

                <div className="border-b pb-2">
                  <h4 className="font-medium mb-2">Destination</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Latitude"
                    type="number"
                    step="0.000001"
                    placeholder="10.3200"
                    value={gpsForm.end_lat}
                    onChange={(e) => setGpsForm({ ...gpsForm, end_lat: e.target.value })}
                  />
                  <Input
                    label="Longitude"
                    type="number"
                    step="0.000001"
                    placeholder="123.8900"
                    value={gpsForm.end_lon}
                    onChange={(e) => setGpsForm({ ...gpsForm, end_lon: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  color="primary"
                  onClick={handleCalculateRoute}
                  isLoading={loading}
                  className="flex-1"
                >
                  Calculate Route
                </Button>
                <Button color="default" variant="flat" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Route Results</h3>
            </CardHeader>
            <CardBody>
              {!result ? (
                <div className="text-center py-12">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  <p className="text-gray-500">Calculate a route to see results</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Total Distance</p>
                      <p className="text-2xl font-bold">{Number(result.totalDistance).toFixed(2)} km</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Estimated Time</p>
                      <p className="text-2xl font-bold">{result.estimatedTime} min</p>
                    </div>
                  </div>

                  {/* Virtual Connections */}
                  {result.virtualConnections && result.virtualConnections.length > 0 && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                        Virtual Connections (Walking)
                      </p>
                      {result.virtualConnections.map((vc, idx) => (
                        <div key={idx} className="text-xs text-blue-800 dark:text-blue-300">
                          {vc.type === 'start' ? '🚶 Walk to' : '🚶 Walk from'} {vc.to.name} (
                          {Number(vc.distance).toFixed(2)} km)
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Turn-by-turn directions */}
                  <div>
                    <h4 className="font-medium mb-2">Turn-by-Turn Directions</h4>
                    <div className="space-y-2">
                      {result.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{step.instruction}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {step.from} → {step.to}
                            </p>
                            <div className="flex gap-4 mt-2">
                              <Chip size="sm" variant="flat">
                                {Number(step.distance).toFixed(2)} km
                              </Chip>
                              <Chip size="sm" variant="flat">
                                {step.time} min
                              </Chip>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Path Details */}
                  <div>
                    <h4 className="font-medium mb-2">Route Path ({result.path.length} points)</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {result.path.map((point, idx) => (
                        <div
                          key={point.id}
                          className="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded flex items-center justify-between"
                        >
                          <span>{point.name}</span>
                          <span className="text-xs text-gray-500">
                            {idx === 0 && '🚩 Start'}
                            {idx === result.path.length - 1 && '🏁 End'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
