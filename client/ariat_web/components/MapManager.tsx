import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
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

// Fix Leaflet default icon issue
import 'leaflet/dist/leaflet.css';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon.src,
  shadowUrl: iconShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapManagerProps {
  geojsonData?: GeoJSONFeatureCollection;
  onSavePoint: (point: NewPoint) => Promise<void>;
  onSaveRoad: (road: NewRoad) => Promise<void>;
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

    // Cleanup
    return () => {
      if (decoratorRef.current) {
        map.removeLayer(decoratorRef.current);
      }
      map.removeLayer(polyline);
    };
  }, [map, positions, color, weight, opacity, isBidirectional]);

  return null;
}

export default function MapManager({ geojsonData, onSavePoint, onSaveRoad }: MapManagerProps) {
  const [mode, setMode] = useState<'view' | 'add_point' | 'add_road'>('view');
  const [pointType, setPointType] = useState<NewPoint['point_type']>('intersection');
  const [roadType, setRoadType] = useState<NewRoad['road_type']>('local_road');
  const [isBidirectional, setIsBidirectional] = useState(true);

  const [markers, setMarkers] = useState<Array<{ position: [number, number]; name: string; type: string }>>([]);
  const [roadPoints, setRoadPoints] = useState<[number, number][]>([]);

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
        position: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]] as [number, number],
        name: feature.properties.name,
        type: feature.properties.point_type || 'intersection',
      }));
      setMarkers(existingMarkers);
    }
  }, [geojsonData]);

  const handleMapClick = (latlng: L.LatLng) => {
    if (mode === 'add_point') {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
      setIsModalOpen(true);
    } else if (mode === 'add_road') {
      setRoadPoints([...roadPoints, [latlng.lat, latlng.lng]]);
      toast.info(`Road point added (${roadPoints.length + 1})`);
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
      setIsBidirectional(true);
      setMode('view');
    } catch (error) {
      toast.error('Failed to save road');
    }
  };

  const cancelRoad = () => {
    setRoadPoints([]);
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
      {/* Control Panel */}
      <Card className="absolute top-4 left-4 z-[1000] w-80">
        <CardBody>
          <h3 className="font-semibold mb-4">Map Controls</h3>

          {/* Mode Selection */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Mode</label>
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

                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Points added: {roadPoints.length}
                  <br />
                  Direction: {isBidirectional ? '↔ Two-way' : '→ One-way'}
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
            <div className="pt-3 border-t">
              <p className="text-sm font-medium mb-2">Legend</p>
              <div className="space-y-1 text-xs">
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

      {/* Map */}
      <MapContainer
        center={[10.3157, 123.8854]} // Cebu City
        zoom={13}
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
          <Marker key={index} position={marker.position}>
            <Popup>
              <div>
                <p className="font-semibold">{marker.name}</p>
                <p className="text-xs text-gray-500">{marker.type}</p>
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
