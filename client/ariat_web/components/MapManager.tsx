import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import { Button } from '@heroui/button';
import { Card, CardBody } from '@heroui/card';
import { Select, SelectItem } from '@heroui/select';
import { Input } from '@heroui/input';
import { Checkbox } from '@heroui/checkbox';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { toast } from '@/lib/toast';
import type { GeoJSONFeatureCollection, GeoJSONPoint } from '@/types/api';

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

interface MapManagerProps {
  geojsonData?: GeoJSONFeatureCollection;
  onSavePoint: (point: NewPoint) => Promise<void>;
  onSaveRoad: (road: NewRoad) => Promise<void>;
  onDeletePoint?: (id: string) => Promise<void>;
  onUpdatePoint?: (id: string, data: { name: string }) => Promise<void>;
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
    map.setView([10.3157, 123.8854], 13); // Cebu City center
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

    // Create the base polyline
    const polyline = L.polyline(positions, {
      color,
      weight,
      opacity,
    }).addTo(map);

    // Define arrow patterns based on direction
    const arrowPattern = isBidirectional
      ? [
          // Two-way arrows
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
          // One-way arrow
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

    // Create decorator with arrows
    const decorator = (L as any).polylineDecorator(polyline, {
      patterns: arrowPattern,
    }).addTo(map);

    decoratorRef.current = decorator;

    // Cleanup — guard against already-removed layers to prevent _leaflet_events error
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

export default function MapManager({ geojsonData, onSavePoint, onSaveRoad, onDeletePoint, onUpdatePoint }: MapManagerProps) {
  const [mode, setMode] = useState<'view' | 'add_point' | 'add_road'>('view');
  const [pointType, setPointType] = useState<NewPoint['point_type']>('intersection');
  const [roadType, setRoadType] = useState<NewRoad['road_type']>('local_road');
  const [isBidirectional, setIsBidirectional] = useState(true);

  const [markers, setMarkers] = useState<Array<{ id?: string; position: [number, number]; name: string; type: string }>>([]);
  const [roadPoints, setRoadPoints] = useState<[number, number][]>([]);
  const [snappedIndices, setSnappedIndices] = useState<Set<number>>(new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPointName, setNewPointName] = useState('');
  const [newPointAddress, setNewPointAddress] = useState('');
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null);

  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);
  const [roadName, setRoadName] = useState('');

  // Load existing points from GeoJSON
  useEffect(() => {
    if (geojsonData?.features) {
      const existingMarkers = geojsonData.features.map((feature) => ({
        id: feature.properties.id,
        position: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]] as [number, number],
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

  const handleMapClick = (latlng: L.LatLng) => {
    if (mode === 'add_point') {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
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

      // Add to local markers
      setMarkers([
        ...markers,
        {
          position: [pendingPoint.lat, pendingPoint.lng],
          name: newPointName,
          type: pointType,
        },
      ]);

      toast.success('Point added successfully!');
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
        start_intersection_id: 'temp_start', // In real app, select from existing intersections
        end_intersection_id: 'temp_end',
        road_type: roadType,
        path: roadPoints,
        is_bidirectional: isBidirectional,
      });

      toast.success('Road saved successfully!');
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

  const cancelRoad = () => {
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
    setIsRoadModalOpen(true);
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

  return (
    <div className="relative h-full w-full">
      {/* Control Panel — solid white bg with dark text so it's readable over the map */}
      <Card className="absolute top-4 left-4 z-[1000] w-80 map-control-panel">
        <CardBody>
          <h3 className="font-semibold mb-4 text-black">Map Controls</h3>

          {/* Mode Selection */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-2 block text-gray-800">Mode</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  color={mode === 'view' ? 'primary' : 'default'}
                  variant={mode === 'view' ? 'solid' : 'flat'}
                  onClick={() => setMode('view')}
                >
                  View
                </Button>
                <Button
                  size="sm"
                  color={mode === 'add_point' ? 'primary' : 'default'}
                  variant={mode === 'add_point' ? 'solid' : 'flat'}
                  onClick={() => setMode('add_point')}
                >
                  Add Point
                </Button>
                <Button
                  size="sm"
                  color={mode === 'add_road' ? 'primary' : 'default'}
                  variant={mode === 'add_road' ? 'solid' : 'flat'}
                  onClick={() => setMode('add_road')}
                >
                  Add Road
                </Button>
              </div>
            </div>

            {mode === 'add_point' && (
              <Select
                label="Point Type"
                selectedKeys={[pointType]}
                onChange={(e) => setPointType(e.target.value as NewPoint['point_type'])}
                size="sm"
              >
                <SelectItem key="tourist_spot">Tourist Spot</SelectItem>
                <SelectItem key="bus_terminal">Bus Terminal</SelectItem>
                <SelectItem key="bus_stop">Bus Stop</SelectItem>
                <SelectItem key="pier">Pier</SelectItem>
                <SelectItem key="intersection">Intersection</SelectItem>
              </Select>
            )}

            {mode === 'add_road' && (
              <>
                <Select
                  label="Road Type"
                  selectedKeys={[roadType]}
                  onChange={(e) => setRoadType(e.target.value as NewRoad['road_type'])}
                  size="sm"
                >
                  <SelectItem key="highway">Highway</SelectItem>
                  <SelectItem key="main_road">Main Road</SelectItem>
                  <SelectItem key="local_road">Local Road</SelectItem>
                </Select>

                <Checkbox
                  isSelected={isBidirectional}
                  onValueChange={setIsBidirectional}
                  size="sm"
                >
                  Two-way road (bidirectional)
                </Checkbox>

                <div className="text-sm text-gray-700 space-y-1">
                  <p>Points added: {roadPoints.length}</p>
                  <p>Direction: {isBidirectional ? '↔ Two-way' : '→ One-way'}</p>
                  {snappedIndices.size > 0 && (
                    <p className="text-green-700">
                      Snapped: {snappedIndices.size} point{snappedIndices.size > 1 ? 's' : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 italic">
                    Click near an intersection to snap
                  </p>
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

            {/* Legend */}
            <div className="pt-3 border-t border-gray-200">
              <p className="text-sm font-medium mb-2 text-black">Legend</p>
              <div className="space-y-1 text-xs text-gray-800">
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
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Map — bounded to the Cebu region */}
      <MapContainer
        center={[10.3157, 123.8854]} // Cebu City center
        zoom={13}
        minZoom={9}
        maxBounds={[
          [9.35, 123.15],  // Southwest corner (south Cebu)
          [11.35, 124.65], // Northeast corner (north Cebu + Camotes)
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
                  {marker.position[0].toFixed(6)}, {marker.position[1].toFixed(6)}
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

        {/* Road in progress */}
        {roadPoints.length > 0 && (
          <RoadPolyline
            positions={roadPoints}
            color="blue"
            weight={4}
            opacity={0.7}
            isBidirectional={isBidirectional}
          />
        )}

        {/* Road point indicators — green = snapped to intersection, orange = free point */}
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
      </MapContainer>

      {/* Add Point Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
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
            <Button color="danger" variant="flat" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleSavePoint}>
              Save Point
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Road Modal */}
      <Modal isOpen={isRoadModalOpen} onClose={() => setIsRoadModalOpen(false)}>
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
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={() => setIsRoadModalOpen(false)}>
              Cancel
            </Button>
            <Button color="success" onClick={handleSaveRoad}>
              Save Road
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
