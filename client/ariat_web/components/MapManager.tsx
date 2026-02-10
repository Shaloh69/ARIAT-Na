import { useEffect, useState, useRef, useMemo } from 'react';
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

// Destination GeoJSON feature from /destinations/geojson endpoint
interface DestinationGeoJSONFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    address?: string;
    image?: string | null;
    is_featured: boolean;
    category_name?: string;
    category_slug?: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface DestinationsGeoJSON {
  type: 'FeatureCollection';
  features: DestinationGeoJSONFeature[];
}

interface MapManagerProps {
  geojsonData?: GeoJSONFeatureCollection;
  roadsGeojsonData?: RoadsGeoJSON;
  destinationsGeojsonData?: DestinationsGeoJSON;
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

// Zoom-aware destination marker: shows pin at low zoom, image+name at high zoom
const ZOOM_THRESHOLD = 15;

function ZoomAwareDestinationMarker({
  position,
  name,
  image,
  categoryName,
  address,
  isFeatured,
}: {
  position: [number, number];
  name: string;
  image?: string | null;
  categoryName?: string;
  address?: string;
  isFeatured: boolean;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [map]);

  const isZoomedIn = zoom >= ZOOM_THRESHOLD;

  // Custom DivIcon for zoomed-in view with image and name
  const zoomedInIcon = useMemo(() => {
    const imgHtml = image
      ? `<img src="${image}" alt="${name}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid ${isFeatured ? '#f59e0b' : '#e11d48'};" />`
      : `<div style="width:60px;height:60px;border-radius:8px;border:2px solid ${isFeatured ? '#f59e0b' : '#e11d48'};background:#1e293b;display:flex;align-items:center;justify-content:center;">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
         </div>`;

    return L.divIcon({
      className: 'destination-marker-zoomed',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;">
          ${imgHtml}
          <div style="margin-top:4px;padding:2px 8px;background:rgba(15,23,42,0.9);border-radius:6px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;">
            <span style="color:#fff;font-size:11px;font-weight:600;">${name}</span>
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid rgba(15,23,42,0.9);"></div>
        </div>
      `,
      iconSize: [80, 100],
      iconAnchor: [40, 100],
    });
  }, [image, name, isFeatured]);

  // Custom destination pin icon for zoomed-out view
  const pinIcon = useMemo(() => {
    return L.divIcon({
      className: 'destination-marker-pin',
      html: `
        <div style="display:flex;align-items:center;justify-content:center;transform:translate(-50%,-100%);">
          <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="${isFeatured ? '#f59e0b' : '#e11d48'}"/>
            <circle cx="14" cy="14" r="7" fill="white" fill-opacity="0.9"/>
            <circle cx="14" cy="14" r="4" fill="${isFeatured ? '#f59e0b' : '#e11d48'}"/>
          </svg>
        </div>
      `,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    });
  }, [isFeatured]);

  return (
    <Marker position={position} icon={isZoomedIn ? zoomedInIcon : pinIcon}>
      <Popup>
        <div style={{ minWidth: '180px' }}>
          {image && (
            <img
              src={image}
              alt={name}
              style={{
                width: '100%',
                height: '100px',
                objectFit: 'cover',
                borderRadius: '6px',
                marginBottom: '8px',
              }}
            />
          )}
          <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 4px', color: '#111' }}>{name}</p>
          {categoryName && (
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 2px' }}>{categoryName}</p>
          )}
          {address && (
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 2px' }}>{address}</p>
          )}
          {isFeatured && (
            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontWeight: 500 }}>
              Featured
            </span>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

// Snap threshold in degrees (~55 meters at Cebu's latitude)
const SNAP_THRESHOLD = 0.0005;

export default function MapManager({
  geojsonData,
  roadsGeojsonData,
  destinationsGeojsonData,
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
  const [selectedDestId, setSelectedDestId] = useState<string>('');
  const [routeError, setRouteError] = useState<string>('');

  // Track whether any modal is open to disable the control panel
  const isAnyModalOpen = isModalOpen || isRoadModalOpen || isDestModalOpen;

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

  // Parse destination features
  const destinationMarkers = useMemo(() => {
    if (!destinationsGeojsonData?.features) return [];
    return destinationsGeojsonData.features.map((feature) => ({
      id: feature.properties.id,
      position: [Number(feature.geometry.coordinates[1]), Number(feature.geometry.coordinates[0])] as [number, number],
      name: feature.properties.name,
      image: feature.properties.image,
      address: feature.properties.address,
      isFeatured: feature.properties.is_featured,
      categoryName: feature.properties.category_name,
    }));
  }, [destinationsGeojsonData]);

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
        setRouteError('');
        setSelectedDestId('');
        toast.info('Start point set. Select a destination from the list or click on the map.');
      } else if (!routeEnd) {
        const end: [number, number] = [latlng.lat, latlng.lng];
        setRouteEnd(end);
        setRouteError('');
        if (onCalculateRoute) {
          setRouteLoading(true);
          try {
            const result = await onCalculateRoute(routeStart[0], routeStart[1], end[0], end[1], routeOptimizeFor);
            setRouteResult(result);
            if (result && result.totalDistance > 0) {
              toast.success(`Route found: ${Number(result.totalDistance).toFixed(2)} km, ~${result.estimatedTime} min`);
            } else if (result) {
              setRouteError('Start and destination are at the same location or too close together.');
              toast.warning('Start and destination are too close');
            } else {
              setRouteError('No route found. Ensure roads exist between the start and destination.');
              toast.warning('No route found between these points');
            }
          } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Route calculation failed';
            setRouteError(msg);
            toast.error(msg);
          } finally {
            setRouteLoading(false);
          }
        } else {
          setRouteError('Route calculation service is not available.');
          toast.error('Route calculation not available');
        }
      } else {
        // Reset for new route
        setRouteStart([latlng.lat, latlng.lng]);
        setRouteEnd(null);
        setRouteResult(null);
        setRouteError('');
        setSelectedDestId('');
        toast.info('New start point set. Select a destination or click on the map.');
      }
    }
  };

  const clearRoute = () => {
    setRouteStart(null);
    setRouteEnd(null);
    setRouteResult(null);
    setRouteError('');
    setSelectedDestId('');
  };

  // Calculate route to a selected destination
  const calculateRouteToDestination = async (destId: string) => {
    if (!routeStart) {
      toast.error('Please set a start point first by clicking on the map');
      return;
    }
    const dest = destinationMarkers.find((d) => d.id === destId);
    if (!dest) {
      toast.error('Destination not found');
      return;
    }
    const end: [number, number] = dest.position;
    setRouteEnd(end);
    setRouteError('');

    if (onCalculateRoute) {
      setRouteLoading(true);
      try {
        const result = await onCalculateRoute(routeStart[0], routeStart[1], end[0], end[1], routeOptimizeFor);
        setRouteResult(result);
        if (result && result.totalDistance > 0) {
          toast.success(`Route to ${dest.name}: ${Number(result.totalDistance).toFixed(2)} km, ~${result.estimatedTime} min`);
        } else if (result) {
          setRouteError('The start and destination are too close together or on the same road segment.');
          toast.warning('Start and destination appear to be at the same location');
        } else {
          setRouteError('No route found. Make sure roads connect the start point to the destination.');
          toast.warning('No route found to ' + dest.name);
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Route calculation failed';
        setRouteError(msg);
        toast.error(msg);
      } finally {
        setRouteLoading(false);
      }
    }
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

  const getCircleMarkerColor = (type: string) => {
    const colors: Record<string, string> = {
      tourist_spot: '#ef4444',
      bus_terminal: '#3b82f6',
      bus_stop: '#22c55e',
      pier: '#a855f7',
      intersection: '#6b7280',
    };
    return colors[type] || '#6b7280';
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
      {/* Control Panel — disabled when any modal is open */}
      <Card
        className={`absolute top-4 left-4 z-[1000] w-80 map-control-panel transition-opacity duration-200 ${isAnyModalOpen ? 'opacity-50' : ''}`}
        style={{
          maxHeight: 'calc(100vh - 16rem)',
          overflowY: 'auto',
          pointerEvents: isAnyModalOpen ? 'none' : 'auto',
        }}
      >
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

                {/* Destination selector — only show when start is set */}
                {routeStart && !routeEnd && destinationMarkers.length > 0 && (
                  <Select
                    label="Select Destination"
                    placeholder="Choose a destination..."
                    selectedKeys={selectedDestId ? [selectedDestId] : []}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) {
                        setSelectedDestId(id);
                        calculateRouteToDestination(id);
                      }
                    }}
                    size="sm"
                    popoverProps={{ className: 'map-select-popover' }}
                  >
                    {destinationMarkers.map((dest) => (
                      <SelectItem key={dest.id}>
                        {dest.name}{dest.categoryName ? ` (${dest.categoryName})` : ''}
                      </SelectItem>
                    ))}
                  </Select>
                )}

                <div style={{ fontSize: '0.875rem', color: '#374151' }} className="space-y-1">
                  {!routeStart ? (
                    <div className="p-2 rounded" style={{ background: 'rgba(59, 130, 246, 0.08)' }}>
                      <p style={{ fontWeight: 500 }}>Step 1: Set your starting point</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Click anywhere on the map to place your start</p>
                    </div>
                  ) : !routeEnd ? (
                    <>
                      <p style={{ color: '#16a34a' }}>Start: {routeStart[0].toFixed(6)}, {routeStart[1].toFixed(6)}</p>
                      <div className="p-2 rounded" style={{ background: 'rgba(59, 130, 246, 0.08)' }}>
                        <p style={{ fontWeight: 500 }}>Step 2: Choose destination</p>
                        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {destinationMarkers.length > 0
                            ? 'Select from the dropdown above or click on the map'
                            : 'Click on the map to set destination'}
                        </p>
                      </div>
                    </>
                  ) : routeLoading ? (
                    <>
                      <p style={{ color: '#16a34a' }}>Start: {routeStart[0].toFixed(6)}, {routeStart[1].toFixed(6)}</p>
                      <p style={{ color: '#dc2626' }}>End: {routeEnd[0].toFixed(6)}, {routeEnd[1].toFixed(6)}</p>
                      <div className="flex items-center gap-2 p-2 rounded" style={{ background: 'rgba(59, 130, 246, 0.08)' }}>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: '#2563eb' }}></div>
                        <p style={{ color: '#2563eb', fontWeight: 500 }}>Calculating route...</p>
                      </div>
                    </>
                  ) : routeResult && routeResult.totalDistance > 0 ? (
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
                      {routeResult.virtualConnections && routeResult.virtualConnections.length > 0 && (
                        <div className="p-1.5 rounded" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.1)', color: '#92400e' }}>
                          Includes {routeResult.virtualConnections.length} walking connection{routeResult.virtualConnections.length > 1 ? 's' : ''} to/from road
                        </div>
                      )}
                      {routeResult.steps.length > 0 && (
                        <div className="pt-2">
                          <p style={{ fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: '#374151' }}>
                            Directions ({routeResult.steps.length} step{routeResult.steps.length > 1 ? 's' : ''})
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
                      <p style={{ color: '#16a34a' }}>Start: {routeStart ? `${routeStart[0].toFixed(6)}, ${routeStart[1].toFixed(6)}` : '—'}</p>
                      <p style={{ color: '#dc2626' }}>End: {routeEnd ? `${routeEnd[0].toFixed(6)}, ${routeEnd[1].toFixed(6)}` : '—'}</p>
                      <div className="p-2 rounded" style={{ background: 'rgba(220, 38, 38, 0.08)' }}>
                        <p style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.8rem' }}>Route not found</p>
                        <p style={{ fontSize: '0.7rem', color: '#991b1b' }}>
                          {routeError || 'No connecting roads between start and destination. Try adding more roads or choosing different points.'}
                        </p>
                      </div>
                    </>
                  )}
                  {routeEnd && !routeLoading && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Click anywhere to start a new route</p>
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
                {/* Points section - circles for intersection-type points */}
                <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '2px', fontWeight: 500 }}>Points</p>
                {[
                  { type: 'bus_terminal', label: 'Bus Terminal' },
                  { type: 'bus_stop', label: 'Bus Stop' },
                  { type: 'pier', label: 'Pier' },
                  { type: 'intersection', label: 'Intersection' },
                ].map((item) => (
                  <div key={item.type} className="flex items-center gap-2">
                    <div
                      className="flex-shrink-0"
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: getCircleMarkerColor(item.type),
                        border: '2px solid white',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
                      }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}

                {/* Destinations section - pin marker icon */}
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '6px 0' }} />
                <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '2px', fontWeight: 500 }}>Destinations</p>
                <div className="flex items-center gap-2">
                  <svg width="14" height="18" viewBox="0 0 28 36" fill="none" className="flex-shrink-0">
                    <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#e11d48"/>
                    <circle cx="14" cy="14" r="7" fill="white" fillOpacity="0.9"/>
                    <circle cx="14" cy="14" r="4" fill="#e11d48"/>
                  </svg>
                  <span>Destination</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="14" height="18" viewBox="0 0 28 36" fill="none" className="flex-shrink-0">
                    <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#f59e0b"/>
                    <circle cx="14" cy="14" r="7" fill="white" fillOpacity="0.9"/>
                    <circle cx="14" cy="14" r="4" fill="#f59e0b"/>
                  </svg>
                  <span>Featured Destination</span>
                </div>
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '2px' }}>
                  Zoom in to see images
                </p>

                {/* Roads section */}
                {savedRoads.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '6px 0' }} />
                    <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '2px', fontWeight: 500 }}>Roads ({savedRoads.length})</p>
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

        {/* Existing markers — render as CircleMarker for all point types */}
        {markers.map((marker, index) => (
          <CircleMarker
            key={marker.id || `marker-${index}`}
            center={marker.position}
            radius={marker.type === 'intersection' ? 6 : 8}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: getCircleMarkerColor(marker.type),
              fillOpacity: 0.9,
            }}
          >
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
          </CircleMarker>
        ))}

        {/* Destination markers — zoom-aware with image/name display */}
        {destinationMarkers.map((dest) => (
          <ZoomAwareDestinationMarker
            key={`dest-${dest.id}`}
            position={dest.position}
            name={dest.name}
            image={dest.image}
            categoryName={dest.categoryName}
            address={dest.address}
            isFeatured={dest.isFeatured}
          />
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
