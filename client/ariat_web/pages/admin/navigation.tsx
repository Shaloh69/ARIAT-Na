import { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';

export default function NavigationDashboardPage() {
  const [activeSessions, setActiveSessions] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // In a real implementation, this would connect to the WebSocket server
    // and listen for navigation session updates
    setIsConnected(true);
  }, []);

  return (
    <AdminLayout>
      <Head>
        <title>Real-time Navigation - ARIAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Real-time Navigation</h1>
            <p className="text-gray-600 dark:text-gray-400">Monitor active navigation sessions</p>
          </div>
          <Chip size="lg" color={isConnected ? 'success' : 'danger'} variant="flat">
            {isConnected ? '🟢 WebSocket Connected' : '🔴 Disconnected'}
          </Chip>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardBody className="text-center py-8">
              <p className="text-4xl font-bold text-primary mb-2">{activeSessions}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Active Sessions</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="text-center py-8">
              <p className="text-4xl font-bold text-success mb-2">0</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">On-Course Users</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="text-center py-8">
              <p className="text-4xl font-bold text-warning mb-2">0</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Off-Course Alerts</p>
            </CardBody>
          </Card>
        </div>

        {/* Connection Info */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">WebSocket Server</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Server URL</p>
                <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  ws://localhost:5000
                </code>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Status</p>
                <Chip size="sm" color={isConnected ? 'success' : 'danger'} variant="flat">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Chip>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Available Events</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { event: 'navigation:start', desc: 'Begin navigation' },
                  { event: 'navigation:location-update', desc: 'Location update' },
                  { event: 'navigation:route-recalculated', desc: 'Route recalc' },
                  { event: 'navigation:progress', desc: 'Progress update' },
                  { event: 'navigation:instruction', desc: 'Turn instruction' },
                  { event: 'navigation:end', desc: 'End navigation' },
                ].map((item) => (
                  <div
                    key={item.event}
                    className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded"
                  >
                    <code className="text-primary">{item.event}</code>
                    <p className="text-gray-500 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Active Navigation Sessions</h3>
          </CardHeader>
          <CardBody>
            {activeSessions === 0 ? (
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
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <p className="text-gray-600 dark:text-gray-400 mb-2">No active navigation sessions</p>
                <p className="text-sm text-gray-500">
                  Sessions will appear here when users start navigation from the Flutter app
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Session cards will be rendered here when available */}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Implementation Guide */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Flutter App Integration Guide</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div>
                <p className="font-medium mb-2">1. Install Socket.IO Client</p>
                <code className="block text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                  flutter pub add socket_io_client
                </code>
              </div>

              <div>
                <p className="font-medium mb-2">2. Connect to Server</p>
                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
{`import 'package:socket_io_client/socket_io_client.dart';

Socket socket = io('http://your-server:5000', <String, dynamic>{
  'transports': ['websocket'],
  'auth': {'token': 'your-jwt-token'},
});

socket.onConnect((_) {
  print('Connected to navigation server');
});`}
                </pre>
              </div>

              <div>
                <p className="font-medium mb-2">3. Start Navigation</p>
                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
{`socket.emit('navigation:start', {
  'sessionId': uuid(),
  'route': routeData,
  'destination': {'lat': 10.32, 'lon': 123.89},
  'optimizeFor': 'distance'
});`}
                </pre>
              </div>

              <div>
                <p className="font-medium mb-2">4. Send Location Updates</p>
                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
{`// Send every 2-5 seconds
socket.emit('navigation:location-update', {
  'sessionId': sessionId,
  'latitude': currentLat,
  'longitude': currentLon,
  'heading': heading,
  'speed': speed
});`}
                </pre>
              </div>

              <div>
                <p className="font-medium mb-2">5. Listen for Updates</p>
                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
{`socket.on('navigation:route-recalculated', (data) {
  // Update route with new path
  updateRoute(data['newRoute']);
});

socket.on('navigation:progress', (data) {
  // Update UI with progress
  updateProgress(data);
});`}
                </pre>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
