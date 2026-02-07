import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import { Button } from '@heroui/button';
import { Card, CardBody } from '@heroui/card';
import { Select, SelectItem } from '@heroui/select';
import { Input, Textarea } from '@heroui/input';
import { Checkbox } from '@heroui/checkbox';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { toast } from '@/lib/toast';
import { modalClassNames } from '@/lib/modal-styles';
import type { GeoJSONFeatureCollection } from '@/types/api';

// Fix Leaflet default icon issue with Next.js webpack
import 'leaflet/dist/leaflet.css';
import iconImg from 'leaflet/dist/images/marker-icon.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconImg === 'string' ? iconImg : iconImg?.src,
  iconRetinaUrl: typeof iconRetina === 'string' ? iconRetina : iconRetina?.src,
  shadowUrl: typeof iconShadow === 'string' ? iconShadow : iconShadow?.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Route calculation result type
export interface RouteResult {
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

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

// Road GeoJSON feature from /roads/geojson endpoint
interface RoadGeoJSONFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    road_type: string;
    distance: number;
    estimated_time: number;
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat]
  };
}

interface RoadsGeoJSON {
  type: 'FeatureCollection';
  features: RoadGeoJSONFeature[];
}

interface MapManagerProps {
  geojsonData?: GeoJSONFeatureCollection;
  roadsGeojsonData?: RoadsGeoJSON;
  categories?: CategoryOption[];
  onSavePoint: (point: NewPoint) => Promise<void>;
  onSaveRoad: (road: NewRoad) => Promise<void>;
  onSaveDestination?: (dest: NewDestination) => Promise<void>;
  onDeletePoint?: (id: string) => Promise<void>;
  onUpdatePoint?: (id: string, data: { name: string }) => Promise<void>;
  onCalculateRoute?: (startLat: number, startLon: number, endLat: number, endLon: number, optimizeFor: string) => Promise<RouteResult | null>;
}

interface NewPoint {
  name: string;
  latitude: number;
  longitude: number;
  point_type: 'tourist_spot' | 'bus_terminal' | 'bus_stop' | 'pier' | 'intersection';
  address?: string;
}

interface NewRoad {
  name: string;
  start_intersection_id: string;
  end_intersection_id: string;
  road_type: 'highway' | 'main_road' | 'local_road';
  path: [number, number][];
  is_bidirectional: boolean;
}

export interface NewDestination {
  name: string;
  description?: string;
  category_id: string;
  latitude: number;
  longitude: number;
  address?: string;
  entrance_fee_local?: number;
  entrance_fee_foreign?: number;
  average_visit_duration?: number;
  best_time_to_visit?: string;
  amenities?: string[];
  images?: string[];
}

type MapMode = 'view' | 'add_point' | 'add_road' | 'add_destination' | 'test_route';

// Map Click Handler Component
function MapClickHandler({ onMapClick, mode }: { onMapClick: (latlng: L.LatLng) => void; mode: string }) {
  useMapEvents({
    click: (e) => {
      if (mode !== 'view') {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

// Center Map Component
function CenterMapButton() {
  const map = useMap();

  const centerMap = () => {
    map.setView([10.3157, 123.8854], 13);
  };

  return (
    <Button
      size="sm"
      color="primary"
      variant="flat"
      className="absolute bottom-24 right-4 z-[1000]"
      onClick={centerMap}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      Center on Cebu
    </Button>
  );
}

// Road Polyline with Directional Arrows
interface RoadPolylineProps {
  positions: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  isBidirectional: boolean;
}

function RoadPolyline({ positions, color, weight = 4, opacity = 0.7, isBidirectional }: RoadPolylineProps) {
  const map = useMap();
  const decoratorRef = useRef<L.PolylineDecorator | null>(null);

  useEffect(() => {
    if (!map || positions.length < 2) return;

    const polyline = L.polyline(positions, { color, weight, opacity }).addTo(map);

    const arrowPattern = isBidirectional
      ? [
          {
            offset: '25%',
            repeat: '50%',
            symbol: L.Symbol.arrowHead({
              pixelSize: 12,
              polygon: false,
              pathOptions: { stroke: true, color, weight: 2, opacity: 0.8 },
            }),
          },
          {
            offset: '75%',
            repeat: '50%',
            symbol: L.Symbol.arrowHead({
              pixelSize: 12,
              polygon: false,
              pathOptions: { stroke: true, color, weight: 2, opacity: 0.8 },
            }),
          },
        ]
      : [
          {
            offset: '50%',
            repeat: 0,
            symbol: L.Symbol.arrowHead({
              pixelSize: 15,
              polygon: false,
              pathOptions: { stroke: true, color, weight: 3, opacity: 0.9 },
            }),
          },
        ];

    const decorator = (L as any).polylineDecorator(polyline, {
      patterns: arrowPattern,
    }).addTo(map);

    decoratorRef.current = decorator;

    return () => {
      try {
        if (decoratorRef.current && map.hasLayer(decoratorRef.current)) {
          map.removeLayer(decoratorRef.current);
        }
        if (map.hasLayer(polyline)) {
          map.removeLayer(polyline);
        }
      } catch {
        // Ignore cleanup errors during component unmount
      }
    };
  }, [map, positions, color, weight, opacity, isBidirectional]);

  return null;
}

// Snap threshold in degrees (~55 meters at Cebu's latitude)
const SNAP_THRESHOLD = 0.0005;

export default function MapManager({
  geojsonData,
  roadsGeojsonData,
  categories,
  onSavePoint,
  onSaveRoad,
  onSaveDestination,
  onDeletePoint,
  onUpdatePoint,
  onCalculateRoute,
}: MapManagerProps) {
  const [mode, setMode] = useState<MapMode>('view');
  const [pointType, setPointType] = useState<NewPoint['point_type']>('intersection');
  const [roadType, setRoadType] = useState<NewRoad['road_type']>('local_road');
  const [isBidirectional, setIsBidirectional] = useState(true);

  const [markers, setMarkers] = useState<Array<{ id?: string; position: [number, number]; name: string; type: string }>>([]);
  const [roadPoints, setRoadPoints] = useState<[number, number][]>([]);
  const [snappedIndices, setSnappedIndices] = useState<Set<number>>(new Set());

  // Point modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPointName, setNewPointName] = useState('');
  const [newPointAddress, setNewPointAddress] = useState('');
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null);

  // Road modal state
  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);
  const [roadName, setRoadName] = useState('');

  // Destination modal state
  const [isDestModalOpen, setIsDestModalOpen] = useState(false);
  const [destForm, setDestForm] = useState({
    name: '',
    description: '',
    category_id: '',
    address: '',
    entrance_fee_local: '0',
    entrance_fee_foreign: '0',
    best_time_to_visit: '',
    amenities: '',
  });

  // Route testing state
  const [routeStart, setRouteStart] = useState<[number, number] | null>(null);
  const [routeEnd, setRouteEnd] = useState<[number, number] | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeOptimizeFor, setRouteOptimizeFor] = useState<'distance' | 'time'>('distance');

  // Load existing points from GeoJSON
  useEffect(() => {
    if (geojsonData?.features) {
      const existingMarkers = geojsonData.features.map((feature) => ({
        id: feature.properties.id,
        position: [Number(feature.geometry.coordinates[1]), Number(feature.geometry.coordinates[0])] as [number, number],
        name: feature.properties.name,
        type: feature.properties.point_type || 'intersection',
      }));
      setMarkers(existingMarkers);
    }
  }, [geojsonData]);

  const findNearestMarker = (lat: number, lng: number) => {
    let minDist = Infinity;
    let nearest: { position: [number, number]; name: string; type: string } | null = null;

    for (const marker of markers) {
      const dlat = marker.position[0] - lat;
      const dlng = marker.position[1] - lng;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < minDist) {
        minDist = dist;
        nearest = marker;
      }
    }

    if (nearest && minDist <= SNAP_THRESHOLD) {
      return nearest;
    }
    return null;
  };

  const getDefaultPointName = () => {
    const typeLabels: Record<string, string> = {
      tourist_spot: 'Tourist Spot',
      bus_terminal: 'Bus Terminal',
      bus_stop: 'Bus Stop',
      pier: 'Pier',
      intersection: 'Intersection',
    };
    const label = typeLabels[pointType] || 'Point';
    const count = markers.filter((m) => m.type === pointType).length;
    return `${label} ${count + 1}`;
  };

  const getDefaultRoadName = () => {
    const count = savedRoads.length;
    const typeLabels: Record<string, string> = {
      highway: 'Highway',
      main_road: 'Main Road',
      local_road: 'Local Road',
    };
    const label = typeLabels[roadType] || 'Road';
    return `${label} ${count + 1}`;
  };

  const handleMapClick = async (latlng: L.LatLng) => {
    if (mode === 'add_point') {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
      setNewPointName(getDefaultPointName());
      setIsModalOpen(true);
    } else if (mode === 'add_road') {
      const snapped = findNearestMarker(latlng.lat, latlng.lng);
      if (snapped) {
        setRoadPoints([...roadPoints, snapped.position]);
        setSnappedIndices((prev) => new Set(prev).add(roadPoints.length));
        toast.success(`Snapped to "${snapped.name}"`);
      } else {
        setRoadPoints([...roadPoints, [latlng.lat, latlng.lng]]);
        toast.info(`Road point added (${roadPoints.length + 1})`);
      }
    } else if (mode === 'add_destination') {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
      setDestForm({ name: '', description: '', category_id: '', address: '', entrance_fee_local: '0', entrance_fee_foreign: '0', best_time_to_visit: '', amenities: '' });
      setIsDestModalOpen(true);
    } else if (mode === 'test_route') {
      if (!routeStart) {
        setRouteStart([latlng.lat, latlng.lng]);
        setRouteEnd(null);
        setRouteResult(null);
        toast.info('Start point set. Click to set destination.');
      } else if (!routeEnd) {
        const end: [number, number] = [latlng.lat, latlng.lng];
        setRouteEnd(end);
        if (onCalculateRoute) {
          setRouteLoading(true);
          try {
            const result = await onCalculateRoute(routeStart[0], routeStart[1], end[0], end[1], routeOptimizeFor);
            setRouteResult(result);
            if (result) {
              toast.success(`Route found: ${Number(result.totalDistance).toFixed(2)} km, ~${result.estimatedTime} min`);
            } else {
              toast.warning('No route found between these points');
            }
          } catch {
            toast.error('Failed to calculate route');
          } finally {
            setRouteLoading(false);
          }
        } else {
          toast.error('Route calculation not available');
        }
      } else {
        // Reset for new route
        setRouteStart([latlng.lat, latlng.lng]);
        setRouteEnd(null);
        setRouteResult(null);
        toast.info('New start point set. Click to set destination.');
      }
    }
  };

  const clearRoute = () => {
    setRouteStart(null);
    setRouteEnd(null);
    setRouteResult(null);
  };

  const handleSavePoint = async () => {
    if (!pendingPoint || !newPointName) {
      toast.error('Please enter a name for the point');
      return;
    }

    try {
      await onSavePoint({
        name: newPointName,
        latitude: pendingPoint.lat,
        longitude: pendingPoint.lng,
        point_type: pointType,
        address: newPointAddress || undefined,
      });

      setMarkers([
        ...markers,
        {
          position: [pendingPoint.lat, pendingPoint.lng],
          name: newPointName,
          type: pointType,
        },
      ]);

      setIsModalOpen(false);
      setNewPointName('');
      setNewPointAddress('');
      setPendingPoint(null);
      setMode('view');
    } catch (error) {
      toast.error('Failed to save point');
    }
  };

  const handleSaveRoad = async () => {
    if (roadPoints.length < 2) {
      toast.error('A road needs at least 2 points');
      return;
    }

    if (!roadName) {
      toast.error('Please enter a name for the road');
      return;
    }

    try {
      await onSaveRoad({
        name: roadName,
        start_intersection_id: 'temp_start',
        end_intersection_id: 'temp_end',
        road_type: roadType,
        path: roadPoints,
        is_bidirectional: isBidirectional,
      });

      setIsRoadModalOpen(false);
      setRoadName('');
      setRoadPoints([]);
      setSnappedIndices(new Set());
      setIsBidirectional(true);
      setMode('view');
    } catch (error) {
      toast.error('Failed to save road');
    }
  };

  const handleSaveDestination = async () => {
    if (!pendingPoint) return;
    if (!destForm.name.trim()) {
      toast.error('Destination name is required');
      return;
    }
    if (!destForm.category_id) {
      toast.error('Please select a category');
      return;
    }
    if (!onSaveDestination) {
      toast.error('Destination saving not available');
      return;
    }

    try {
      await onSaveDestination({
        name: destForm.name.trim(),
        description: destForm.description.trim() || undefined,
        category_id: destForm.category_id,
        latitude: pendingPoint.lat,
        longitude: pendingPoint.lng,
        address: destForm.address.trim() || undefined,
        entrance_fee_local: parseFloat(destForm.entrance_fee_local) || 0,
        entrance_fee_foreign: parseFloat(destForm.entrance_fee_foreign) || 0,
        best_time_to_visit: destForm.best_time_to_visit.trim() || undefined,
        amenities: destForm.amenities.trim()
          ? destForm.amenities.split(',').map((a) => a.trim()).filter(Boolean)
          : undefined,
      });

      setIsDestModalOpen(false);
      setPendingPoint(null);
      setMode('view');
      toast.success('Destination created successfully!');
    } catch (error) {
      toast.error('Failed to create destination');
    }
  };

  const cancelRoad = () => {
    if (roadPoints.length > 0) {
      if (!confirm('Are you sure? All drawn road points will be discarded.')) return;
    }
    setRoadPoints([]);
    setSnappedIndices(new Set());
    setMode('view');
    toast.info('Road creation cancelled');
  };

  const finishRoad = () => {
    if (roadPoints.length < 2) {
      toast.error('A road needs at least 2 points');
      return;
    }
    setRoadName(getDefaultRoadName());
    setIsRoadModalOpen(true);
  };

  // Modal cancel handlers — discard unsaved work with confirmation
  const handleCancelPoint = () => {
    if (newPointName.trim() || newPointAddress.trim()) {
      if (!confirm('Discard this point? The placed marker will be removed.')) return;
    }
    setIsModalOpen(false);
    setNewPointName('');
    setNewPointAddress('');
    setPendingPoint(null);
    toast.info('Point discarded');
  };

  const handleCancelRoad = () => {
    if (!confirm('Discard this road? All drawn points will be lost.')) return;
    setIsRoadModalOpen(false);
    setRoadName('');
    setRoadPoints([]);
    setSnappedIndices(new Set());
    toast.info('Road discarded');
  };

  const handleCancelDest = () => {
    const hasData = destForm.name.trim() || destForm.description.trim() || destForm.address.trim();
    if (hasData) {
      if (!confirm('Discard this destination? All entered data will be lost.')) return;
    }
    setIsDestModalOpen(false);
    setPendingPoint(null);
    setDestForm({
      name: '', description: '', category_id: '', address: '',
      entrance_fee_local: '0', entrance_fee_foreign: '0',
      best_time_to_visit: '', amenities: '',
    });
    toast.info('Destination discarded');
  };

  const switchMode = (newMode: MapMode) => {
    if (newMode !== 'test_route') clearRoute();
    if (newMode !== 'add_road') {
      setRoadPoints([]);
      setSnappedIndices(new Set());
    }
    setMode(newMode);
  };

  const getMarkerColor = (type: string) => {
    const colors: Record<string, string> = {
      tourist_spot: 'bg-red-500',
      bus_terminal: 'bg-blue-500',
      bus_stop: 'bg-green-500',
      pier: 'bg-purple-500',
      intersection: 'bg-gray-500',
    };
    return colors[type] || 'bg-gray-500';
  };

  const getRoadColor = (roadType: string) => {
    const colors: Record<string, string> = {
      highway: '#dc2626',     // red
      main_road: '#2563eb',   // blue
      local_road: '#16a34a',  // green
    };
    return colors[roadType] || '#6b7280';
  };

  // Parse saved roads from GeoJSON — coordinates are [lng, lat], convert to [lat, lng]
  const savedRoads = (roadsGeojsonData?.features || []).map((feature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    roadType: feature.properties.road_type,
    distance: feature.properties.distance,
    estimatedTime: feature.properties.estimated_time,
    positions: feature.geometry.coordinates.map(
      (coord) => [Number(coord[1]), Number(coord[0])] as [number, number]
    ),
  }));

  // Route positions for polyline
  const routePositions: [number, number][] = routeResult
    ? routeResult.path.map((p) => [p.latitude, p.longitude] as [number, number])
    : [];

  return (
    <div className="relative h-full w-full">
      {/* Control Panel */}
      <Card className="absolute top-4 left-4 z-[1000] w-80 map-control-panel" style={{ maxHeight: 'calc(100vh - 16rem)', overflowY: 'auto' }}>
        <CardBody>
          <h3 style={{ fontWeight: 600, marginBottom: '1rem', color: '#111827' }}>Map Controls</h3>

          <div className="space-y-3">
            {/* Mode Selection */}
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', display: 'block', color: '#374151' }}>Mode</label>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" color={mode === 'view' ? 'primary' : 'default'} variant={mode === 'view' ? 'solid' : 'flat'} onClick={() => switchMode('view')}>
                  View
                </Button>
                <Button size="sm" color={mode === 'add_point' ? 'primary' : 'default'} variant={mode === 'add_point' ? 'solid' : 'flat'} onClick={() => switchMode('add_point')}>
                  Point
                </Button>
                <Button size="sm" color={mode === 'add_road' ? 'primary' : 'default'} variant={mode === 'add_road' ? 'solid' : 'flat'} onClick={() => switchMode('add_road')}>
                  Road
                </Button>
                <Button size="sm" color={mode === 'add_destination' ? 'primary' : 'default'} variant={mode === 'add_destination' ? 'solid' : 'flat'} onClick={() => switchMode('add_destination')}>
                  Dest.
                </Button>
                <Button size="sm" color={mode === 'test_route' ? 'primary' : 'default'} variant={mode === 'test_route' ? 'solid' : 'flat'} onClick={() => switchMode('test_route')}>
                  Route
                </Button>
              </div>
            </div>

            {/* Add Point Controls */}
            {mode === 'add_point' && (
              <>
                <Select
                  label="Point Type"
                  selectedKeys={[pointType]}
                  onChange={(e) => setPointType(e.target.value as NewPoint['point_type'])}
                  size="sm"
                  popoverProps={{ className: 'map-select-popover' }}
                >
                  <SelectItem key="tourist_spot">Tourist Spot</SelectItem>
                  <SelectItem key="bus_terminal">Bus Terminal</SelectItem>
                  <SelectItem key="bus_stop">Bus Stop</SelectItem>
                  <SelectItem key="pier">Pier</SelectItem>
                  <SelectItem key="intersection">Intersection</SelectItem>
                </Select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Click on the map to place a point</p>
              </>
            )}

            {/* Add Road Controls */}
            {mode === 'add_road' && (
              <>
                <Select
                  label="Road Type"
                  selectedKeys={[roadType]}
                  onChange={(e) => setRoadType(e.target.value as NewRoad['road_type'])}
                  size="sm"
                  popoverProps={{ className: 'map-select-popover' }}
                >
                  <SelectItem key="highway">Highway</SelectItem>
                  <SelectItem key="main_road">Main Road</SelectItem>
                  <SelectItem key="local_road">Local Road</SelectItem>
                </Select>

                <Checkbox isSelected={isBidirectional} onValueChange={setIsBidirectional} size="sm">
                  <span style={{ color: '#374151' }}>Two-way road (bidirectional)</span>
                </Checkbox>

                <div style={{ fontSize: '0.875rem', color: '#374151' }} className="space-y-1">
                  <p>Points added: {roadPoints.length}</p>
                  <p>Direction: {isBidirectional ? '↔ Two-way' : '→ One-way'}</p>
                  {snappedIndices.size > 0 && (
                    <p style={{ color: '#16a34a' }}>
                      Snapped: {snappedIndices.size} point{snappedIndices.size > 1 ? 's' : ''}
                    </p>
                  )}
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Click near an intersection to snap</p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" color="success" onClick={finishRoad} className="flex-1">
                    Finish Road
                  </Button>
                  <Button size="sm" color="danger" variant="flat" onClick={cancelRoad}>
                    Cancel
                  </Button>
                </div>
              </>
            )}

            {/* Add Destination Controls */}
            {mode === 'add_destination' && (
              <div style={{ fontSize: '0.875rem', color: '#374151' }} className="space-y-1">
                <p>Click on the map to place a new destination.</p>
                <p>A form will appear for you to enter details.</p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                  Categories available: {categories?.length || 0}
                </p>
              </div>
            )}

            {/* Route Testing Controls */}
            {mode === 'test_route' && (
              <>
                <Select
                  label="Optimize For"
                  selectedKeys={[routeOptimizeFor]}
                  onChange={(e) => setRouteOptimizeFor(e.target.value as 'distance' | 'time')}
                  size="sm"
                  popoverProps={{ className: 'map-select-popover' }}
                >
                  <SelectItem key="distance">Shortest Distance</SelectItem>
                  <SelectItem key="time">Fastest Time</SelectItem>
                </Select>

                <div style={{ fontSize: '0.875rem', color: '#374151' }} className="space-y-1">
                  {!routeStart ? (
                    <p>Click on the map to set <strong>start point</strong></p>
                  ) : !routeEnd ? (
                    <>
                      <p style={{ color: '#16a34a' }}>Start: {routeStart[0].toFixed(6)}, {routeStart[1].toFixed(6)}</p>
                      <p>Click on the map to set <strong>destination</strong></p>
                    </>
                  ) : routeLoading ? (
                    <>
                      <p style={{ color: '#16a34a' }}>Start: {routeStart[0].toFixed(6)}, {routeStart[1].toFixed(6)}</p>
                      <p style={{ color: '#dc2626' }}>End: {routeEnd[0].toFixed(6)}, {routeEnd[1].toFixed(6)}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: '#2563eb' }}></div>
                        <p style={{ color: '#2563eb' }}>Calculating route...</p>
                      </div>
                    </>
                  ) : routeResult ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 p-2 rounded" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Distance</p>
                          <p style={{ fontWeight: 700, color: '#111827' }}>{Number(routeResult.totalDistance).toFixed(2)} km</p>
                        </div>
                        <div>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Time</p>
                          <p style={{ fontWeight: 700, color: '#111827' }}>{routeResult.estimatedTime} min</p>
                        </div>
                      </div>
                      {routeResult.steps.length > 0 && (
                        <div className="pt-2">
                          <p style={{ fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: '#374151' }}>
                            Directions ({routeResult.steps.length} steps)
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {routeResult.steps.map((step, idx) => (
                              <div key={idx} className="p-1.5 rounded" style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.04)', color: '#374151' }}>
                                <span style={{ fontWeight: 500, color: '#2563eb' }}>{idx + 1}.</span>{' '}
                                {step.instruction}
                                <span style={{ color: '#6b7280' }}> ({Number(step.distance).toFixed(2)}km)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={{ color: '#16a34a' }}>Start: {routeStart[0].toFixed(6)}, {routeStart[1].toFixed(6)}</p>
                      <p style={{ color: '#dc2626' }}>End: {routeEnd[0].toFixed(6)}, {routeEnd[1].toFixed(6)}</p>
                      <p style={{ color: '#dc2626', fontWeight: 500 }}>No route found</p>
                    </>
                  )}
                  {routeEnd && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Click to start a new route</p>
                  )}
                </div>

                {(routeStart || routeResult) && (
                  <Button size="sm" color="danger" variant="flat" onClick={clearRoute} className="w-full">
                    Clear Route
                  </Button>
                )}
              </>
            )}

            {/* Legend */}
            <div className="pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#111827' }}>Legend</p>
              <div className="space-y-1" style={{ fontSize: '0.75rem', color: '#374151' }}>
                {[
                  { type: 'tourist_spot', label: 'Tourist Spot' },
                  { type: 'bus_terminal', label: 'Bus Terminal' },
                  { type: 'bus_stop', label: 'Bus Stop' },
                  { type: 'pier', label: 'Pier' },
                  { type: 'intersection', label: 'Intersection' },
                ].map((item) => (
                  <div key={item.type} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getMarkerColor(item.type)}`} />
                    <span>{item.label}</span>
                  </div>
                ))}
                {savedRoads.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '6px 0' }} />
                    <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '2px' }}>Roads ({savedRoads.length})</p>
                    {[
                      { type: 'highway', label: 'Highway', color: '#dc2626' },
                      { type: 'main_road', label: 'Main Road', color: '#2563eb' },
                      { type: 'local_road', label: 'Local Road', color: '#16a34a' },
                    ].map((item) => (
                      <div key={item.type} className="flex items-center gap-2">
                        <div style={{ width: '16px', height: '3px', background: item.color, borderRadius: '2px' }} />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Map */}
      <MapContainer
        center={[10.3157, 123.8854]}
        zoom={13}
        minZoom={9}
        maxBounds={[
          [9.35, 123.15],
          [11.35, 124.65],
        ]}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapClickHandler onMapClick={handleMapClick} mode={mode} />
        <CenterMapButton />

        {/* Existing markers */}
        {markers.map((marker, index) => (
          <Marker key={marker.id || index} position={marker.position}>
            <Popup>
              <div style={{ minWidth: '160px' }}>
                <p className="font-semibold text-sm">{marker.name}</p>
                <p className="text-xs text-gray-500 mb-2">{marker.type.replace('_', ' ')}</p>
                <p className="text-xs text-gray-400 mb-2">
                  {Number(marker.position[0]).toFixed(6)}, {Number(marker.position[1]).toFixed(6)}
                </p>
                {marker.id && mode === 'view' && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {onUpdatePoint && (
                      <button
                        onClick={() => {
                          const newName = prompt('Edit name:', marker.name);
                          if (newName && newName !== marker.name && marker.id) {
                            onUpdatePoint(marker.id, { name: newName }).then(() => {
                              setMarkers((prev) => prev.map((m) =>
                                m.id === marker.id ? { ...m, name: newName } : m
                              ));
                            });
                          }
                        }}
                        style={{ padding: '2px 8px', fontSize: '11px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                    )}
                    {onDeletePoint && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${marker.name}"?`) && marker.id) {
                            onDeletePoint(marker.id).then(() => {
                              setMarkers((prev) => prev.filter((m) => m.id !== marker.id));
                            });
                          }
                        }}
                        style={{ padding: '2px 8px', fontSize: '11px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Saved roads from server */}
        {savedRoads.map((road) => (
          <Polyline
            key={`saved-road-${road.id}`}
            positions={road.positions}
            pathOptions={{
              color: getRoadColor(road.roadType),
              weight: 3,
              opacity: 0.7,
            }}
          >
            <Popup>
              <div style={{ minWidth: '140px' }}>
                <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 4px' }}>{road.name}</p>
                <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 2px' }}>
                  Type: {road.roadType.replace('_', ' ')}
                </p>
                <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
                  {road.distance} km &middot; ~{road.estimatedTime} min
                </p>
              </div>
            </Popup>
          </Polyline>
        ))}

        {/* Road in progress */}
        {roadPoints.length > 0 && (
          <RoadPolyline positions={roadPoints} color="blue" weight={4} opacity={0.7} isBidirectional={isBidirectional} />
        )}

        {/* Road point indicators */}
        {mode === 'add_road' && roadPoints.map((pt, idx) => (
          <CircleMarker
            key={`road-pt-${idx}`}
            center={pt}
            radius={snappedIndices.has(idx) ? 7 : 5}
            pathOptions={{
              color: snappedIndices.has(idx) ? '#16a34a' : '#f59e0b',
              fillColor: snappedIndices.has(idx) ? '#16a34a' : '#f59e0b',
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <Popup>
              <span className="text-xs">
                {snappedIndices.has(idx) ? 'Snapped to intersection' : 'Free point'}
                {idx === 0 && ' (start)'}
                {idx === roadPoints.length - 1 && idx > 0 && ' (end)'}
              </span>
            </Popup>
          </CircleMarker>
        ))}

        {/* Route testing: start marker */}
        {mode === 'test_route' && routeStart && (
          <CircleMarker
            center={routeStart}
            radius={10}
            pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.9, weight: 3 }}
          >
            <Popup><span style={{ color: '#111', fontWeight: 600 }}>Start Point</span></Popup>
          </CircleMarker>
        )}

        {/* Route testing: end marker */}
        {mode === 'test_route' && routeEnd && (
          <CircleMarker
            center={routeEnd}
            radius={10}
            pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.9, weight: 3 }}
          >
            <Popup><span style={{ color: '#111', fontWeight: 600 }}>Destination</span></Popup>
          </CircleMarker>
        )}

        {/* Route testing: route polyline */}
        {mode === 'test_route' && routePositions.length >= 2 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#7c3aed', weight: 5, opacity: 0.8, dashArray: '10, 6' }}
          />
        )}

        {/* Route testing: virtual connection lines (walking) */}
        {mode === 'test_route' && routeResult?.virtualConnections?.map((vc, idx) => (
          <Polyline
            key={`vc-${idx}`}
            positions={[
              [vc.from.lat, vc.from.lon],
              [vc.to.lat, vc.to.lon],
            ]}
            pathOptions={{ color: '#f59e0b', weight: 3, opacity: 0.7, dashArray: '5, 8' }}
          />
        ))}

        {/* Destination placement marker */}
        {mode === 'add_destination' && pendingPoint && (
          <CircleMarker
            center={[pendingPoint.lat, pendingPoint.lng]}
            radius={12}
            pathOptions={{ color: '#e11d48', fillColor: '#f43f5e', fillOpacity: 0.9, weight: 3 }}
          >
            <Popup><span style={{ color: '#111', fontWeight: 600 }}>New Destination</span></Popup>
          </CircleMarker>
        )}
      </MapContainer>

      {/* Add Point Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCancelPoint} classNames={modalClassNames} isDismissable={false}>
        <ModalContent>
          <ModalHeader>Add New {pointType.replace('_', ' ').toUpperCase()}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder={`Enter ${pointType} name`}
                value={newPointName}
                onChange={(e) => setNewPointName(e.target.value)}
                isRequired
              />
              <Input
                label="Address"
                placeholder="Enter address (optional)"
                value={newPointAddress}
                onChange={(e) => setNewPointAddress(e.target.value)}
              />
              {pendingPoint && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>Latitude: {pendingPoint.lat.toFixed(6)}</p>
                  <p>Longitude: {pendingPoint.lng.toFixed(6)}</p>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={handleCancelPoint}>
              Discard
            </Button>
            <Button color="primary" onClick={handleSavePoint}>
              Save Point
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Road Modal */}
      <Modal isOpen={isRoadModalOpen} onClose={handleCancelRoad} classNames={modalClassNames} isDismissable={false}>
        <ModalContent>
          <ModalHeader>Save Road</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Road Name"
                placeholder="Enter road name"
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                isRequired
              />
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>Road Type: <span className="font-medium">{roadType.replace('_', ' ')}</span></p>
                <p>Total Points: <span className="font-medium">{roadPoints.length}</span></p>
                <p>Direction: <span className="font-medium">{isBidirectional ? '↔ Two-way' : '→ One-way'}</span></p>
              </div>
              <p className="text-xs text-amber-400">Closing this modal will discard the drawn road.</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={handleCancelRoad}>
              Discard Road
            </Button>
            <Button color="success" onClick={handleSaveRoad}>
              Save Road
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Destination Modal */}
      <Modal isOpen={isDestModalOpen} onClose={handleCancelDest} size="2xl" classNames={modalClassNames} isDismissable={false}>
        <ModalContent>
          <ModalHeader>Create New Destination</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Destination Name"
                placeholder="Enter destination name"
                value={destForm.name}
                onChange={(e) => setDestForm({ ...destForm, name: e.target.value })}
                isRequired
              />

              {categories && categories.length > 0 ? (
                <Select
                  label="Category"
                  selectedKeys={destForm.category_id ? [destForm.category_id] : []}
                  onChange={(e) => setDestForm({ ...destForm, category_id: e.target.value })}
                  isRequired
                >
                  {categories.map((cat) => (
                    <SelectItem key={cat.id}>{cat.name}</SelectItem>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-amber-500">No categories available. Please create categories first.</p>
              )}

              <Textarea
                label="Description"
                placeholder="Describe this destination..."
                value={destForm.description}
                onChange={(e) => setDestForm({ ...destForm, description: e.target.value })}
                minRows={3}
                maxRows={8}
              />

              <Input
                label="Address"
                placeholder="Enter address (optional)"
                value={destForm.address}
                onChange={(e) => setDestForm({ ...destForm, address: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Local Fee (PHP)"
                  type="number"
                  value={destForm.entrance_fee_local}
                  onChange={(e) => setDestForm({ ...destForm, entrance_fee_local: e.target.value })}
                />
                <Input
                  label="Foreign Fee (PHP)"
                  type="number"
                  value={destForm.entrance_fee_foreign}
                  onChange={(e) => setDestForm({ ...destForm, entrance_fee_foreign: e.target.value })}
                />
              </div>

              <Input
                label="Best Time to Visit"
                placeholder="e.g. Morning, 6AM-10AM"
                value={destForm.best_time_to_visit}
                onChange={(e) => setDestForm({ ...destForm, best_time_to_visit: e.target.value })}
              />

              <Input
                label="Amenities"
                placeholder="Comma-separated: Parking, WiFi, Restroom"
                value={destForm.amenities}
                onChange={(e) => setDestForm({ ...destForm, amenities: e.target.value })}
              />

              {pendingPoint && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>Location: {pendingPoint.lat.toFixed(6)}, {pendingPoint.lng.toFixed(6)}</p>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={handleCancelDest}>
              Discard
            </Button>
            <Button color="primary" onClick={handleSaveDestination}>
              Create Destination
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
