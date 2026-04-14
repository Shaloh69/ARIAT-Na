import type { GeoJSONFeatureCollection } from "@/types/api";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet-polylinedecorator";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Select, SelectItem } from "@heroui/select";
import { Input, Textarea } from "@heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
// Fix Leaflet default icon issue with Next.js webpack
import "leaflet/dist/leaflet.css";
import iconImg from "leaflet/dist/images/marker-icon.png";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

import { modalClassNames } from "@/lib/modal-styles";
import { toast } from "@/lib/toast";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconImg === "string" ? iconImg : iconImg?.src,
  iconRetinaUrl: typeof iconRetina === "string" ? iconRetina : iconRetina?.src,
  shadowUrl: typeof iconShadow === "string" ? iconShadow : iconShadow?.src,
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
  routeGeometry?: [number, number][]; // Full polyline [lat, lng][] following actual road paths
  virtualConnections?: Array<{
    type: "start" | "end";
    from: { lat: number; lon: number; name?: string };
    to: { lat: number; lon: number; name: string };
    distance: number;
    isVirtual: true;
  }>;
  /** True when A* found no road path — straight-line walk returned instead */
  isWalkFallback?: boolean;
  /** Last-mile walk: road ends here, user walks the rest on foot */
  walkTail?: {
    from: [number, number];
    to: [number, number];
    distanceKm: number;
    walkMinutes: number;
  };
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

// Road GeoJSON feature from /roads/geojson endpoint
interface RoadGeoJSONFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    road_type: string;
    distance: number;
    estimated_time: number;
    is_bidirectional: boolean;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lng, lat]
  };
}

interface RoadsGeoJSON {
  type: "FeatureCollection";
  features: RoadGeoJSONFeature[];
}

// Destination GeoJSON feature from /destinations/geojson endpoint
interface DestinationGeoJSONFeature {
  type: "Feature";
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
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface DestinationsGeoJSON {
  type: "FeatureCollection";
  features: DestinationGeoJSONFeature[];
}

interface MapManagerProps {
  geojsonData?: GeoJSONFeatureCollection;
  roadsGeojsonData?: RoadsGeoJSON;
  destinationsGeojsonData?: DestinationsGeoJSON;
  categories?: CategoryOption[];
  onSavePoint?: (point: NewPoint) => Promise<void>;
  onSaveRoad?: (road: NewRoad) => Promise<void>;
  onSaveDestination?: (dest: NewDestination) => Promise<void>;
  onDeletePoint?: (id: string) => Promise<void>;
  onUpdatePoint?: (id: string, data: { name: string }) => Promise<void>;
  onDeleteRoad?: (id: string) => Promise<void>;
  onCalculateRoute?: (
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    optimizeFor: string,
  ) => Promise<RouteResult | null>;
  // Transit route building
  transitSelectedRoadIds?: string[];
  transitSelectedStopIds?: string[];
  transitRouteColor?: string;
  transitPickupMode?: "anywhere" | "stops_only";
  onTransitRoadsChange?: (ids: string[]) => void;
  onTransitStopsChange?: (ids: string[]) => void;
  initialMode?: MapMode;
}

interface NewPoint {
  name: string;
  latitude: number;
  longitude: number;
  point_type:
    | "tourist_spot"
    | "bus_terminal"
    | "bus_stop"
    | "pier"
    | "intersection";
  address?: string;
}

interface NewRoad {
  name: string;
  start_intersection_id?: string;
  end_intersection_id?: string;
  road_type: "highway" | "main_road" | "local_road" | "ferry";
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

type MapMode =
  | "view"
  | "add_point"
  | "add_road"
  | "add_destination"
  | "test_route"
  | "transit_route";

// Map Click Handler Component
function MapClickHandler({
  onMapClick,
  mode,
}: {
  onMapClick: (latlng: L.LatLng) => void;
  mode: string;
}) {
  useMapEvents({
    click: (e) => {
      if (mode !== "view") {
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
      className="absolute bottom-24 right-4 z-[1000]"
      color="primary"
      size="sm"
      variant="flat"
      onClick={centerMap}
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />
      </svg>
      Center on Cebu
    </Button>
  );
}

// ─── Tile layer definitions ───────────────────────────────────────────────────
type TileLayerKey = "osm" | "dark" | "satellite";
const TILE_LAYERS: Record<
  TileLayerKey,
  {
    url: string;
    attribution: string;
    label: string;
    icon: string;
    maxZoom: number;
    subdomains?: string;
  }
> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: "Street Map",
    icon: "🗺️",
    maxZoom: 19,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    label: "Dark Mode",
    icon: "🌙",
    maxZoom: 19,
    subdomains: "abcd",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    label: "Satellite",
    icon: "🛰️",
    maxZoom: 18,
  },
};

// Captures the live map instance for imperative zoom/pan outside MapContainer
function MapRefSetter({
  mapRef,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;

    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);

  return null;
}

// Road Polyline with Directional Arrows
interface RoadPolylineProps {
  positions: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  isBidirectional: boolean;
}

function RoadPolyline({
  positions,
  color,
  weight = 2,
  opacity = 0.65,
  isBidirectional,
}: RoadPolylineProps) {
  const map = useMap();
  const decoratorRef = useRef<L.PolylineDecorator | null>(null);

  useEffect(() => {
    if (!map || positions.length < 2) return;

    const polyline = L.polyline(positions, { color, weight, opacity }).addTo(
      map,
    );

    const arrowSymbol = (size: number) =>
      L.Symbol.arrowHead({
        pixelSize: size,
        polygon: false,
        pathOptions: { stroke: true, color, weight: 2, opacity: 0.9 },
      });

    const forwardDecorator = (L as any)
      .polylineDecorator(positions, {
        patterns: [{ offset: "40%", repeat: "60%", symbol: arrowSymbol(12) }],
      })
      .addTo(map);

    let reverseDecorator: any = null;

    if (isBidirectional) {
      const reversed = [...positions].reverse();

      reverseDecorator = (L as any)
        .polylineDecorator(reversed, {
          patterns: [{ offset: "40%", repeat: "60%", symbol: arrowSymbol(12) }],
        })
        .addTo(map);
    }

    decoratorRef.current = forwardDecorator;

    return () => {
      try {
        if (map.hasLayer(forwardDecorator)) map.removeLayer(forwardDecorator);
        if (reverseDecorator && map.hasLayer(reverseDecorator))
          map.removeLayer(reverseDecorator);
        if (map.hasLayer(polyline)) map.removeLayer(polyline);
      } catch {
        // Ignore cleanup errors during component unmount
      }
    };
  }, [map, positions, color, weight, opacity, isBidirectional]);

  return null;
}

// Adds directional arrow decorators on top of an existing react-leaflet <Polyline>
// without rendering a duplicate polyline layer.
function RoadDecorator({
  positions,
  color,
  isBidirectional,
}: {
  positions: [number, number][];
  color: string;
  isBidirectional: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || positions.length < 2) return;

    const arrowSymbol = (size: number) =>
      L.Symbol.arrowHead({
        pixelSize: size,
        polygon: false,
        pathOptions: { stroke: true, color, weight: 2, opacity: 0.9 },
      });

    // Forward decorator: A→B (pass positions array directly — no invisible anchor needed)
    const forwardDecorator = (L as any)
      .polylineDecorator(positions, {
        patterns: [{ offset: "30%", repeat: "40%", symbol: arrowSymbol(10) }],
      })
      .addTo(map);

    // For two-way roads, add a second decorator on reversed positions (B→A)
    let reverseDecorator: any = null;

    if (isBidirectional) {
      const reversed = [...positions].reverse();

      reverseDecorator = (L as any)
        .polylineDecorator(reversed, {
          patterns: [{ offset: "30%", repeat: "40%", symbol: arrowSymbol(10) }],
        })
        .addTo(map);
    }

    return () => {
      try {
        map.removeLayer(forwardDecorator);
      } catch {
        /* ignore */
      }
      try {
        if (reverseDecorator) map.removeLayer(reverseDecorator);
      } catch {
        /* ignore */
      }
    };
  }, [map, positions, color, isBidirectional]);

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
  interactive = true,
  showPopup = true,
}: {
  position: [number, number];
  name: string;
  image?: string | null;
  categoryName?: string;
  address?: string;
  isFeatured: boolean;
  interactive?: boolean;
  showPopup?: boolean;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());

    map.on("zoomend", onZoom);

    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  const isZoomedIn = zoom >= ZOOM_THRESHOLD;

  // Custom DivIcon for zoomed-in view with image and name
  const zoomedInIcon = useMemo(() => {
    const imgHtml = image
      ? `<img src="${image}" alt="${name}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid ${isFeatured ? "#f59e0b" : "#e11d48"};" />`
      : `<div style="width:60px;height:60px;border-radius:8px;border:2px solid ${isFeatured ? "#f59e0b" : "#e11d48"};background:#1e293b;display:flex;align-items:center;justify-content:center;">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
         </div>`;

    return L.divIcon({
      className: "destination-marker-zoomed",
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
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
      className: "destination-marker-pin",
      html: `
        <div style="display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="${isFeatured ? "#f59e0b" : "#e11d48"}"/>
            <circle cx="14" cy="14" r="7" fill="white" fill-opacity="0.9"/>
            <circle cx="14" cy="14" r="4" fill="${isFeatured ? "#f59e0b" : "#e11d48"}"/>
          </svg>
        </div>
      `,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    });
  }, [isFeatured]);

  return (
    <Marker
      eventHandlers={{
        click: (e) => {
          if (!interactive) {
            L.DomEvent.stopPropagation(e);
          }
        },
      }}
      icon={isZoomedIn ? zoomedInIcon : pinIcon}
      interactive={interactive}
      position={position}
    >
      {showPopup && (
        <Popup>
          <div style={{ minWidth: "180px" }}>
            {image && (
              <img
                alt={name}
                src={image}
                style={{
                  width: "100%",
                  height: "100px",
                  objectFit: "cover",
                  borderRadius: "6px",
                  marginBottom: "8px",
                }}
              />
            )}
            <p
              style={{
                fontWeight: 600,
                fontSize: "13px",
                margin: "0 0 4px",
                color: "#111",
              }}
            >
              {name}
            </p>
            {categoryName && (
              <p
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  margin: "0 0 2px",
                }}
              >
                {categoryName}
              </p>
            )}
            {address && (
              <p
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  margin: "0 0 2px",
                }}
              >
                {address}
              </p>
            )}
            {isFeatured && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  fontWeight: 500,
                }}
              >
                Featured
              </span>
            )}
          </div>
        </Popup>
      )}
    </Marker>
  );
}

// Snap threshold in degrees (~11 meters at Cebu's latitude) — only snaps when clicking on/near an intersection dot
const SNAP_THRESHOLD = 0.0001;

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
  onDeleteRoad,
  onCalculateRoute,
  transitSelectedRoadIds = [],
  transitSelectedStopIds = [],
  transitRouteColor = "#3b82f6",
  transitPickupMode = "stops_only",
  onTransitRoadsChange,
  onTransitStopsChange,
  initialMode = "view",
}: MapManagerProps) {
  const [mode, setMode] = useState<MapMode>(initialMode);
  const [pointType, setPointType] =
    useState<NewPoint["point_type"]>("intersection");
  const [roadType, setRoadType] = useState<NewRoad["road_type"]>("local_road");
  const [isBidirectional, setIsBidirectional] = useState(true);
  const [autoCreateIntersection, setAutoCreateIntersection] = useState(false);

  const [markers, setMarkers] = useState<
    Array<{
      id?: string;
      position: [number, number];
      name: string;
      type: string;
    }>
  >([]);
  const [roadPoints, setRoadPoints] = useState<[number, number][]>([]);
  const [snappedIndices, setSnappedIndices] = useState<Set<number>>(new Set());
  const [isCancelRoadModalOpen, setIsCancelRoadModalOpen] = useState(false);
  // Ref holds the latest undoLastPoint so the keydown handler stays stable
  const undoRef = useRef<() => void>(() => {});
  // Flags for auto-snap: set when a road-context intersection create is in flight
  const pendingRoadSnapRef = useRef(false);
  const roadSnapIndexRef = useRef(-1);

  // Point modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPointName, setNewPointName] = useState("");
  const [newPointAddress, setNewPointAddress] = useState("");
  const [pendingPoint, setPendingPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Road modal state
  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);
  const [roadName, setRoadName] = useState("");

  // Destination modal state
  const [isDestModalOpen, setIsDestModalOpen] = useState(false);
  const [destForm, setDestForm] = useState({
    name: "",
    description: "",
    category_id: "",
    address: "",
    entrance_fee_local: "0",
    entrance_fee_foreign: "0",
    best_time_to_visit: "",
    amenities: "",
  });

  // Route testing state — supports multi-stop itineraries
  const [routeStart, setRouteStart] = useState<[number, number] | null>(null);
  const [routeStops, setRouteStops] = useState<
    Array<{ position: [number, number]; name: string; destId?: string }>
  >([]);
  const [routeLegs, setRouteLegs] = useState<RouteResult[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeOptimizeFor, setRouteOptimizeFor] = useState<"distance" | "time">(
    "distance",
  );
  const [routeError, setRouteError] = useState<string>("");

  // Track whether any modal is open to disable the control panel
  const isAnyModalOpen = isModalOpen || isRoadModalOpen || isDestModalOpen;

  // ── Map-revamp state ───────────────────────────────────────────────────────
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("osm");
  const [panelPos, setPanelPos] = useState({ x: 16, y: 16 });
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showLayerPicker, setShowLayerPicker] = useState(false);

  // ── Layer visibility filters ───────────────────────────────────────────────
  const [showRoads, setShowRoads] = useState(true);
  const [showNodes, setShowNodes] = useState(true);
  const [showDestinations, setShowDestinations] = useState(true);
  const [showRoute, setShowRoute] = useState(true);

  // ── Map-revamp refs ────────────────────────────────────────────────────────
  const mapImperativeRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const draggingPanel = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Stable ref so keyboard handler never re-subscribes
  const switchModeRef = useRef<(m: MapMode) => void>(() => {});
  const isAnyModalOpenRef = useRef(false);

  isAnyModalOpenRef.current = isAnyModalOpen || showShortcutsModal;

  // ── Fullscreen listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);

    document.addEventListener("fullscreenchange", onFsChange);

    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Panel drag mouse events ────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingPanel.current) return;
      setPanelPos({
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(0, e.clientY - dragOffset.current.y),
      });
    };
    const onUp = () => {
      draggingPanel.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Always allow Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undoRef.current();

        return;
      }

      // Block shortcuts when a modal / input is focused
      if (isAnyModalOpenRef.current) return;
      const tag = (e.target as HTMLElement).tagName;

      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "v":
        case "V":
          switchModeRef.current("view");
          break;
        case "p":
        case "P":
          switchModeRef.current("add_point");
          break;
        case "r":
        case "R":
          switchModeRef.current("add_road");
          break;
        case "d":
        case "D":
          switchModeRef.current("add_destination");
          break;
        case "t":
        case "T":
          switchModeRef.current("test_route");
          break;
        case "x":
        case "X":
          switchModeRef.current("transit_route");
          break;
        case "+":
        case "=":
          e.preventDefault();
          mapImperativeRef.current?.zoomIn();
          break;
        case "-":
          e.preventDefault();
          mapImperativeRef.current?.zoomOut();
          break;
        case "0":
          e.preventDefault();
          mapImperativeRef.current?.setView([10.3157, 123.8854], 11);
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (!document.fullscreenElement) {
            void document.documentElement.requestFullscreen();
          } else {
            void document.exitFullscreen();
          }
          break;
        case "Escape":
          setShowShortcutsModal(false);
          setShowLayerPicker(false);
          break;
        case "?":
          e.preventDefault();
          setShowShortcutsModal((v) => !v);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load existing points from GeoJSON

  useEffect(() => {
    if (geojsonData?.features) {
      const existingMarkers = geojsonData.features.map((feature) => ({
        id: feature.properties.id,
        position: [
          Number(feature.geometry.coordinates[1]),
          Number(feature.geometry.coordinates[0]),
        ] as [number, number],
        name: feature.properties.name,
        type: feature.properties.point_type || "intersection",
      }));

      setMarkers(existingMarkers);
    }
  }, [geojsonData]);

  // Parse destination features
  const destinationMarkers = useMemo(() => {
    if (!destinationsGeojsonData?.features) return [];

    return destinationsGeojsonData.features.map((feature) => ({
      id: feature.properties.id,
      position: [
        Number(feature.geometry.coordinates[1]),
        Number(feature.geometry.coordinates[0]),
      ] as [number, number],
      name: feature.properties.name,
      image: feature.properties.image,
      address: feature.properties.address,
      isFeatured: feature.properties.is_featured,
      categoryName: feature.properties.category_name,
    }));
  }, [destinationsGeojsonData]);

  const findNearestMarker = (lat: number, lng: number) => {
    let minDist = Infinity;
    let nearest: {
      id?: string;
      position: [number, number];
      name: string;
      type: string;
    } | null = null;

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
      tourist_spot: "Tourist Spot",
      bus_terminal: "Bus Terminal",
      bus_stop: "Bus Stop",
      pier: "Pier",
      intersection: "Intersection",
    };
    const label = typeLabels[pointType] || "Point";
    const count = markers.filter((m) => m.type === pointType).length;

    return `${label} ${count + 1}`;
  };

  const getDefaultRoadName = () => {
    const count = savedRoads.length;
    const typeLabels: Record<string, string> = {
      highway: "Highway",
      main_road: "Main Road",
      local_road: "Local Road",
      ferry: "Ferry Route",
    };
    const label = typeLabels[roadType] || "Road";

    return `${label} ${count + 1}`;
  };

  const handleMapClick = async (latlng: L.LatLng) => {
    if (mode === "add_point") {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
      setNewPointName(getDefaultPointName());
      setIsModalOpen(true);
    } else if (mode === "add_road") {
      const snapped = findNearestMarker(latlng.lat, latlng.lng);

      if (snapped) {
        setRoadPoints([...roadPoints, snapped.position]);
        setSnappedIndices((prev) => new Set(prev).add(roadPoints.length));
        toast.success(`Snapped to "${snapped.name}"`);
      } else if (autoCreateIntersection) {
        // Open the point-naming modal; on save the point is appended to roadPoints
        pendingRoadSnapRef.current = true;
        roadSnapIndexRef.current = roadPoints.length;
        setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
        setPointType("intersection");
        setNewPointName(getDefaultPointName());
        setIsModalOpen(true);
      } else {
        setRoadPoints([...roadPoints, [latlng.lat, latlng.lng]]);
        toast.info(`Road point added (${roadPoints.length + 1})`);
      }
    } else if (mode === "add_destination") {
      setPendingPoint({ lat: latlng.lat, lng: latlng.lng });
      setDestForm({
        name: "",
        description: "",
        category_id: "",
        address: "",
        entrance_fee_local: "0",
        entrance_fee_foreign: "0",
        best_time_to_visit: "",
        amenities: "",
      });
      setIsDestModalOpen(true);
    } else if (mode === "test_route") {
      if (!routeStart) {
        setRouteStart([latlng.lat, latlng.lng]);
        setRouteStops([]);
        setRouteLegs([]);
        setRouteError("");
        toast.info(
          "Start point set. Add destinations from the dropdown or click on the map.",
        );
      } else {
        // Add as a new stop
        addStop({
          position: [latlng.lat, latlng.lng],
          name: `Stop ${routeStops.length + 1}`,
        });
      }
    }
  };

  const clearRoute = () => {
    setRouteStart(null);
    setRouteStops([]);
    setRouteLegs([]);
    setRouteError("");
  };

  // Add a stop to the itinerary
  const addStop = (stop: {
    position: [number, number];
    name: string;
    destId?: string;
  }) => {
    const newStops = [...routeStops, stop];

    setRouteStops(newStops);
    calculateMultiStopRoute(newStops);
  };

  // Add a destination as a stop
  const addDestinationStop = (destId: string) => {
    const dest = destinationMarkers.find((d) => d.id === destId);

    if (!dest) return;
    if (routeStops.some((s) => s.destId === destId)) {
      toast.warning(`${dest.name} is already in the itinerary`);

      return;
    }
    addStop({ position: dest.position, name: dest.name, destId: dest.id });
  };

  // Remove a stop from the itinerary
  const removeStop = (idx: number) => {
    const newStops = routeStops.filter((_, i) => i !== idx);

    setRouteStops(newStops);
    if (newStops.length > 0) {
      calculateMultiStopRoute(newStops);
    } else {
      setRouteLegs([]);
      setRouteError("");
    }
  };

  // Calculate route through all stops
  const calculateMultiStopRoute = async (stops: typeof routeStops) => {
    if (!routeStart || stops.length === 0 || !onCalculateRoute) return;

    setRouteLoading(true);
    setRouteError("");

    try {
      const legs: RouteResult[] = [];
      const waypoints: [number, number][] = [
        routeStart,
        ...stops.map((s) => s.position),
      ];

      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        const result = await onCalculateRoute(
          from[0],
          from[1],
          to[0],
          to[1],
          routeOptimizeFor,
        );

        if (!result || !result.totalDistance) {
          const fromName = i === 0 ? "Start" : stops[i - 1].name;
          const toName = stops[i].name;

          setRouteError(
            `No route found for leg ${i + 1}: ${fromName} \u2192 ${toName}. Make sure roads connect these areas.`,
          );
          setRouteLegs(legs);

          return;
        }
        legs.push(result);
      }

      setRouteLegs(legs);
      const totalDist = legs.reduce(
        (sum, l) => sum + Number(l.totalDistance),
        0,
      );
      const totalTime = legs.reduce((sum, l) => sum + l.estimatedTime, 0);

      toast.success(
        `Route: ${totalDist.toFixed(2)} km, ~${totalTime} min (${legs.length} leg${legs.length > 1 ? "s" : ""})`,
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Route calculation failed";

      setRouteError(msg);
      toast.error(msg);
    } finally {
      setRouteLoading(false);
    }
  };

  const handleSavePoint = async () => {
    if (!pendingPoint || !newPointName) {
      toast.error("Please enter a name for the point");

      return;
    }

    try {
      if (!onSavePoint) {
        pendingRoadSnapRef.current = false;

        return;
      }

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

      // If this save was triggered from road-drawing mode, snap the new
      // intersection onto the road path immediately
      if (pendingRoadSnapRef.current) {
        pendingRoadSnapRef.current = false;
        const snapPos: [number, number] = [pendingPoint.lat, pendingPoint.lng];

        setRoadPoints((prev) => [...prev, snapPos]);
        setSnappedIndices((prev) =>
          new Set(prev).add(roadSnapIndexRef.current),
        );
        toast.success(
          `Intersection "${newPointName}" created and snapped to road`,
        );
      }

      setIsModalOpen(false);
      setNewPointName("");
      setNewPointAddress("");
      setPendingPoint(null);
      // stay on current mode
    } catch {
      pendingRoadSnapRef.current = false;
      toast.error("Failed to save point");
    }
  };

  const handleSaveRoad = async () => {
    if (roadPoints.length < 2) {
      toast.error("A road needs at least 2 points");

      return;
    }

    if (!roadName) {
      toast.error("Please enter a name for the road");

      return;
    }

    try {
      if (!onSaveRoad) return;
      await onSaveRoad({
        name: roadName,
        road_type: roadType,
        path: roadPoints,
        is_bidirectional: isBidirectional,
      });

      setIsRoadModalOpen(false);
      setRoadName("");
      setRoadPoints([]);
      setSnappedIndices(new Set());
      setIsBidirectional(true);
      // stay on current mode
    } catch {
      toast.error("Failed to save road");
    }
  };

  const handleSaveDestination = async () => {
    if (!pendingPoint) return;
    if (!destForm.name.trim()) {
      toast.error("Destination name is required");

      return;
    }
    if (!destForm.category_id) {
      toast.error("Please select a category");

      return;
    }
    if (!onSaveDestination) {
      toast.error("Destination saving not available");

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
          ? destForm.amenities
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
          : undefined,
      });

      setIsDestModalOpen(false);
      setPendingPoint(null);
      // stay on current mode
      toast.success("Destination created successfully!");
    } catch {
      toast.error("Failed to create destination");
    }
  };

  const undoLastPoint = () => {
    if (mode !== "add_road" || roadPoints.length === 0) return;
    const lastIdx = roadPoints.length - 1;

    setRoadPoints((prev) => prev.slice(0, -1));
    setSnappedIndices((prev) => {
      const next = new Set(prev);

      next.delete(lastIdx);

      return next;
    });
    toast.info(`Point ${lastIdx + 1} removed`);
  };

  // Keep undoRef current after every render so the stable keydown handler calls latest version
  undoRef.current = undoLastPoint;

  const discardAllRoadPoints = () => {
    setRoadPoints([]);
    setSnappedIndices(new Set());
    setIsCancelRoadModalOpen(false);
    toast.info("Road creation cancelled");
  };

  const cancelRoad = () => {
    if (roadPoints.length === 0) {
      discardAllRoadPoints();

      return;
    }
    setIsCancelRoadModalOpen(true);
  };

  const finishRoad = () => {
    if (roadPoints.length < 2) {
      toast.error("A road needs at least 2 points");

      return;
    }
    setRoadName(getDefaultRoadName());
    setIsRoadModalOpen(true);
  };

  // Modal cancel handlers — discard unsaved work with confirmation
  const handleCancelPoint = () => {
    if (newPointName.trim() || newPointAddress.trim()) {
      if (!confirm("Discard this point? The placed marker will be removed."))
        return;
    }
    pendingRoadSnapRef.current = false;
    setIsModalOpen(false);
    setNewPointName("");
    setNewPointAddress("");
    setPendingPoint(null);
    toast.info("Point discarded");
  };

  const handleCancelRoad = () => {
    // Close the Save Road modal and go back to drawing — don't discard points
    setIsRoadModalOpen(false);
    toast.info("Returned to road drawing. Add more points or finish again.");
  };

  const handleDiscardRoadFromModal = () => {
    setIsRoadModalOpen(false);
    setRoadName("");
    setRoadPoints([]);
    setSnappedIndices(new Set());
    toast.info("Road discarded");
  };

  const handleCancelDest = () => {
    const hasData =
      destForm.name.trim() ||
      destForm.description.trim() ||
      destForm.address.trim();

    if (hasData) {
      if (!confirm("Discard this destination? All entered data will be lost."))
        return;
    }
    setIsDestModalOpen(false);
    setPendingPoint(null);
    setDestForm({
      name: "",
      description: "",
      category_id: "",
      address: "",
      entrance_fee_local: "0",
      entrance_fee_foreign: "0",
      best_time_to_visit: "",
      amenities: "",
    });
    toast.info("Destination discarded");
  };

  const switchMode = (newMode: MapMode) => {
    if (newMode !== "test_route") clearRoute();
    if (newMode !== "add_road") {
      setRoadPoints([]);
      setSnappedIndices(new Set());
      setAutoCreateIntersection(false);
      pendingRoadSnapRef.current = false;
    }
    setMode(newMode);
  };

  // Keep ref in sync so keyboard handler always calls the latest version
  switchModeRef.current = switchMode;

  const getCircleMarkerColor = (type: string) => {
    const colors: Record<string, string> = {
      tourist_spot: "#ef4444",
      bus_terminal: "#3b82f6",
      bus_stop: "#22c55e",
      pier: "#a855f7",
      intersection: "#6b7280",
    };

    return colors[type] || "#6b7280";
  };

  const getRoadColor = (roadType: string) => {
    const colors: Record<string, string> = {
      highway: "#dc2626", // red
      main_road: "#2563eb", // blue
      local_road: "#16a34a", // green
      ferry: "#7c3aed", // purple
    };

    return colors[roadType] || "#6b7280";
  };

  // Parse saved roads from GeoJSON — coordinates are [lng, lat], convert to [lat, lng]
  const savedRoads = (roadsGeojsonData?.features || []).map((feature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    roadType: feature.properties.road_type,
    distance: feature.properties.distance,
    estimatedTime: feature.properties.estimated_time,
    isBidirectional: feature.properties.is_bidirectional !== false,
    positions: feature.geometry.coordinates.map(
      (coord) => [Number(coord[1]), Number(coord[0])] as [number, number],
    ),
  }));

  // Route leg positions for polylines — one array per leg, prefer routeGeometry over intersection path
  const routeLegPositions: [number, number][][] = routeLegs.map((leg) =>
    leg.routeGeometry && leg.routeGeometry.length >= 2
      ? leg.routeGeometry
      : leg.path.map((p) => [p.latitude, p.longitude] as [number, number]),
  );

  return (
    <div
      ref={mapContainerRef}
      className="relative h-full w-full"
      style={{ isolation: "isolate" }}
    >
      {/* Control Panel — collapsed state: small icon button */}
      {panelCollapsed ? (
        <button
          className="absolute z-[1000] flex items-center justify-center rounded-xl shadow-lg text-lg"
          style={{
            left: panelPos.x,
            top: panelPos.y,
            width: 40,
            height: 40,
            background: "white",
            border: "1px solid rgba(0,0,0,0.12)",
            cursor: "pointer",
          }}
          title="Expand map controls"
          onClick={() => setPanelCollapsed(false)}
        >
          ⚙️
        </button>
      ) : (
        /* Control Panel — expanded state */
        <Card
          className={`absolute z-[1000] w-80 map-control-panel transition-opacity duration-200 ${isAnyModalOpen ? "opacity-50" : ""}`}
          style={{
            left: panelPos.x,
            top: panelPos.y,
            maxHeight: "calc(100vh - 8rem)",
            overflowY: "auto",
            pointerEvents: isAnyModalOpen ? "none" : "auto",
          }}
        >
          <CardBody>
            {/* Drag handle + collapse */}
            <div
              className="flex items-center justify-between mb-3 -mx-1 px-2 py-1.5 rounded-lg select-none"
              role="none"
              style={{
                background: "rgba(0,0,0,0.04)",
                cursor: "grab",
              }}
              onMouseDown={(e) => {
                const panel = (
                  e.currentTarget.closest(
                    ".map-control-panel",
                  ) as HTMLElement | null
                )?.parentElement;
                const rect = panel
                  ? panel.getBoundingClientRect()
                  : { left: 0, top: 0 };

                draggingPanel.current = true;
                dragOffset.current = {
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                };
              }}
            >
              <div className="flex items-center gap-2">
                <svg
                  fill="none"
                  height="12"
                  stroke="currentColor"
                  strokeWidth={2}
                  style={{ color: "#9ca3af" }}
                  viewBox="0 0 12 12"
                  width="12"
                >
                  <circle cx="3" cy="3" fill="#9ca3af" r="1" />
                  <circle cx="9" cy="3" fill="#9ca3af" r="1" />
                  <circle cx="3" cy="6" fill="#9ca3af" r="1" />
                  <circle cx="9" cy="6" fill="#9ca3af" r="1" />
                  <circle cx="3" cy="9" fill="#9ca3af" r="1" />
                  <circle cx="9" cy="9" fill="#9ca3af" r="1" />
                </svg>
                <h3
                  style={{
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "#111827",
                  }}
                >
                  Map Controls
                </h3>
              </div>
              <button
                className="rounded p-0.5 text-gray-400 hover:text-gray-700"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
                title="Collapse panel (hide)"
                onClick={() => setPanelCollapsed(true)}
              >
                <svg
                  fill="currentColor"
                  height="14"
                  viewBox="0 0 14 14"
                  width="14"
                >
                  <path d="M2 9l5-5 5 5H2z" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {/* Mode Selection */}
              <div>
                <span
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    display: "block",
                    color: "#374151",
                  }}
                >
                  Mode
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    color={mode === "view" ? "primary" : "default"}
                    size="sm"
                    variant={mode === "view" ? "solid" : "flat"}
                    onClick={() => switchMode("view")}
                  >
                    View
                  </Button>
                  <Button
                    color={mode === "add_point" ? "primary" : "default"}
                    size="sm"
                    variant={mode === "add_point" ? "solid" : "flat"}
                    onClick={() => switchMode("add_point")}
                  >
                    Point
                  </Button>
                  <Button
                    color={mode === "add_road" ? "primary" : "default"}
                    size="sm"
                    variant={mode === "add_road" ? "solid" : "flat"}
                    onClick={() => switchMode("add_road")}
                  >
                    Road
                  </Button>
                  <Button
                    color={mode === "add_destination" ? "primary" : "default"}
                    size="sm"
                    variant={mode === "add_destination" ? "solid" : "flat"}
                    onClick={() => switchMode("add_destination")}
                  >
                    Dest.
                  </Button>
                  <Button
                    color={mode === "test_route" ? "primary" : "default"}
                    size="sm"
                    variant={mode === "test_route" ? "solid" : "flat"}
                    onClick={() => switchMode("test_route")}
                  >
                    Route
                  </Button>
                  <Button
                    color={mode === "transit_route" ? "secondary" : "default"}
                    size="sm"
                    variant={mode === "transit_route" ? "solid" : "flat"}
                    onClick={() => switchMode("transit_route")}
                  >
                    Transit
                  </Button>
                </div>
              </div>

              {/* Add Point Controls */}
              {mode === "add_point" && (
                <>
                  <Select
                    label="Point Type"
                    popoverProps={{ className: "map-select-popover" }}
                    selectedKeys={[pointType]}
                    size="sm"
                    onChange={(e) =>
                      setPointType(e.target.value as NewPoint["point_type"])
                    }
                  >
                    <SelectItem key="tourist_spot">Tourist Spot</SelectItem>
                    <SelectItem key="bus_terminal">Bus Terminal</SelectItem>
                    <SelectItem key="bus_stop">Bus Stop</SelectItem>
                    <SelectItem key="pier">Pier</SelectItem>
                    <SelectItem key="intersection">Intersection</SelectItem>
                  </Select>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#6b7280",
                      fontStyle: "italic",
                    }}
                  >
                    Click on the map to place a point
                  </p>
                </>
              )}

              {/* Add Road Controls */}
              {mode === "add_road" && (
                <>
                  <Select
                    label="Road Type"
                    popoverProps={{ className: "map-select-popover" }}
                    selectedKeys={[roadType]}
                    size="sm"
                    onChange={(e) =>
                      setRoadType(e.target.value as NewRoad["road_type"])
                    }
                  >
                    <SelectItem key="highway">Highway</SelectItem>
                    <SelectItem key="main_road">Main Road</SelectItem>
                    <SelectItem key="local_road">Local Road</SelectItem>
                    <SelectItem key="ferry">Ferry Route</SelectItem>
                  </Select>

                  {/* Direction toggle */}
                  <div>
                    <p
                      style={{
                        fontSize: "0.7rem",
                        color: "#6b7280",
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Direction
                    </p>
                    <div className="flex gap-1">
                      <Button
                        className="flex-1"
                        color={!isBidirectional ? "primary" : "default"}
                        size="sm"
                        variant={!isBidirectional ? "solid" : "flat"}
                        onClick={() => setIsBidirectional(false)}
                      >
                        → 1-Way
                      </Button>
                      <Button
                        className="flex-1"
                        color={isBidirectional ? "primary" : "default"}
                        size="sm"
                        variant={isBidirectional ? "solid" : "flat"}
                        onClick={() => setIsBidirectional(true)}
                      >
                        ↔ 2-Way
                      </Button>
                    </div>
                  </div>

                  {/* Auto-create intersection toggle */}
                  <div
                    className="rounded-lg p-2"
                    style={{
                      background: autoCreateIntersection
                        ? "rgba(34,197,94,0.08)"
                        : "rgba(0,0,0,0.04)",
                      border: `1px solid ${autoCreateIntersection ? "rgba(34,197,94,0.4)" : "transparent"}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "#374151",
                            fontWeight: 500,
                          }}
                        >
                          Auto-create intersections
                        </p>
                        <p style={{ fontSize: "0.65rem", color: "#6b7280" }}>
                          {autoCreateIntersection
                            ? "Click map → names & snaps new intersection"
                            : "Click map → free road point"}
                        </p>
                      </div>
                      <Button
                        color={autoCreateIntersection ? "success" : "default"}
                        size="sm"
                        variant={autoCreateIntersection ? "solid" : "flat"}
                        onClick={() => {
                          const next = !autoCreateIntersection;

                          setAutoCreateIntersection(next);
                          if (next) setPointType("intersection");
                        }}
                      >
                        {autoCreateIntersection ? "ON" : "OFF"}
                      </Button>
                    </div>
                  </div>

                  <div
                    className="space-y-1"
                    style={{ fontSize: "0.875rem", color: "#374151" }}
                  >
                    <p>Points added: {roadPoints.length}</p>
                    {snappedIndices.size > 0 && (
                      <p style={{ color: "#16a34a" }}>
                        Snapped: {snappedIndices.size} point
                        {snappedIndices.size > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      color="success"
                      size="sm"
                      onClick={finishRoad}
                    >
                      Finish Road
                    </Button>
                    <Button
                      color="warning"
                      isDisabled={roadPoints.length === 0}
                      size="sm"
                      title="Undo last point (Ctrl+Z)"
                      variant="flat"
                      onClick={undoLastPoint}
                    >
                      ↩ Undo
                    </Button>
                    <Button
                      color="danger"
                      size="sm"
                      variant="flat"
                      onClick={cancelRoad}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {/* Add Destination Controls */}
              {mode === "add_destination" && (
                <div
                  className="space-y-1"
                  style={{ fontSize: "0.875rem", color: "#374151" }}
                >
                  <p>Click on the map to place a new destination.</p>
                  <p>A form will appear for you to enter details.</p>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#6b7280",
                      fontStyle: "italic",
                    }}
                  >
                    Categories available: {categories?.length || 0}
                  </p>
                </div>
              )}

              {/* Route Testing Controls — Multi-stop Itinerary */}
              {mode === "test_route" && (
                <>
                  <Select
                    label="Optimize For"
                    popoverProps={{ className: "map-select-popover" }}
                    selectedKeys={[routeOptimizeFor]}
                    size="sm"
                    onChange={(e) =>
                      setRouteOptimizeFor(e.target.value as "distance" | "time")
                    }
                  >
                    <SelectItem key="distance">Shortest Distance</SelectItem>
                    <SelectItem key="time">Fastest Time</SelectItem>
                  </Select>

                  {/* Destination selector — show when start is set */}
                  {routeStart && destinationMarkers.length > 0 && (
                    <Select
                      label="Add Destination Stop"
                      placeholder="Choose a destination..."
                      popoverProps={{ className: "map-select-popover" }}
                      selectedKeys={[]}
                      size="sm"
                      onChange={(e) => {
                        if (e.target.value) addDestinationStop(e.target.value);
                      }}
                    >
                      {destinationMarkers.map((dest) => (
                        <SelectItem key={dest.id}>
                          {dest.name}
                          {dest.categoryName ? ` (${dest.categoryName})` : ""}
                        </SelectItem>
                      ))}
                    </Select>
                  )}

                  {/* Itinerary stops list */}
                  {routeStops.length > 0 && (
                    <div className="space-y-1">
                      <p
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          color: "#374151",
                        }}
                      >
                        Itinerary ({routeStops.length} stop
                        {routeStops.length > 1 ? "s" : ""})
                      </p>
                      {routeStops.map((stop, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-1.5 rounded"
                          style={{ background: "rgba(0,0,0,0.04)" }}
                        >
                          <span
                            style={{ fontSize: "0.75rem", color: "#374151" }}
                          >
                            {idx + 1}. {stop.name}
                          </span>
                          <button
                            style={{
                              fontSize: "0.7rem",
                              color: "#dc2626",
                              cursor: "pointer",
                              background: "none",
                              border: "none",
                              padding: "2px 6px",
                            }}
                            onClick={() => removeStop(idx)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className="space-y-1"
                    style={{ fontSize: "0.875rem", color: "#374151" }}
                  >
                    {!routeStart ? (
                      <div
                        className="p-2 rounded"
                        style={{ background: "rgba(59, 130, 246, 0.08)" }}
                      >
                        <p style={{ fontWeight: 500 }}>
                          Step 1: Set your starting point
                        </p>
                        <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                          Click anywhere on the map
                        </p>
                      </div>
                    ) : routeStops.length === 0 ? (
                      <>
                        <p style={{ color: "#16a34a" }}>
                          Start: {routeStart[0].toFixed(6)},{" "}
                          {routeStart[1].toFixed(6)}
                        </p>
                        <div
                          className="p-2 rounded"
                          style={{ background: "rgba(59, 130, 246, 0.08)" }}
                        >
                          <p style={{ fontWeight: 500 }}>
                            Step 2: Add destinations
                          </p>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            {destinationMarkers.length > 0
                              ? "Select from the dropdown above or click on the map"
                              : "Click on the map to add stops"}
                          </p>
                        </div>
                      </>
                    ) : routeLoading ? (
                      <div
                        className="flex items-center gap-2 p-2 rounded"
                        style={{ background: "rgba(59, 130, 246, 0.08)" }}
                      >
                        <div
                          className="animate-spin rounded-full h-4 w-4 border-b-2"
                          style={{ borderColor: "#2563eb" }}
                        />
                        <p style={{ color: "#2563eb", fontWeight: 500 }}>
                          Calculating route...
                        </p>
                      </div>
                    ) : routeLegs.length > 0 ? (
                      <>
                        {/* Total summary */}
                        <div
                          className="grid grid-cols-2 gap-2 p-2 rounded"
                          style={{ background: "rgba(34, 197, 94, 0.1)" }}
                        >
                          <div>
                            <p
                              style={{ fontSize: "0.75rem", color: "#6b7280" }}
                            >
                              Total Distance
                            </p>
                            <p style={{ fontWeight: 700, color: "#111827" }}>
                              {routeLegs
                                .reduce(
                                  (sum, l) => sum + Number(l.totalDistance),
                                  0,
                                )
                                .toFixed(2)}{" "}
                              km
                            </p>
                          </div>
                          <div>
                            <p
                              style={{ fontSize: "0.75rem", color: "#6b7280" }}
                            >
                              Total Time
                            </p>
                            <p style={{ fontWeight: 700, color: "#111827" }}>
                              {Math.round(
                                routeLegs.reduce(
                                  (sum, l) => sum + l.estimatedTime,
                                  0,
                                ),
                              )}{" "}
                              min
                            </p>
                          </div>
                        </div>

                        {/* Walk fallback warnings (>3 km legs) */}
                        {routeLegs.some(
                          (l) => l.isWalkFallback && l.totalDistance > 3,
                        ) && (
                          <div
                            className="p-2 rounded-lg space-y-0.5"
                            style={{
                              background: "rgba(234,179,8,0.1)",
                              border: "1px solid rgba(234,179,8,0.3)",
                            }}
                          >
                            <p
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "#b45309",
                              }}
                            >
                              ⚠️ Long walk detected
                            </p>
                            {routeLegs
                              .filter(
                                (l) => l.isWalkFallback && l.totalDistance > 3,
                              )
                              .map((l, i) => (
                                <p
                                  key={i}
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "#92400e",
                                  }}
                                >
                                  Leg requires{" "}
                                  {Number(l.totalDistance).toFixed(2)} km of
                                  walking — no road route found in this area.
                                </p>
                              ))}
                          </div>
                        )}

                        {/* Walk fallback notice (≤3 km) */}
                        {routeLegs.some(
                          (l) => l.isWalkFallback && l.totalDistance <= 3,
                        ) && (
                          <div
                            className="p-2 rounded-lg"
                            style={{
                              background: "rgba(59,130,246,0.08)",
                              border: "1px solid rgba(59,130,246,0.2)",
                            }}
                          >
                            <p
                              style={{
                                fontSize: "0.72rem",
                                color: "#1d4ed8",
                              }}
                            >
                              🚶 One or more legs use a walking path — no road
                              route available in that area.
                            </p>
                          </div>
                        )}

                        {/* Per-leg breakdown */}
                        {routeLegs.length > 1 && (
                          <div className="space-y-1 pt-1">
                            <p
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 500,
                                color: "#6b7280",
                              }}
                            >
                              Legs
                            </p>
                            {routeLegs.map((leg, idx) => (
                              <div
                                key={idx}
                                className="p-1.5 rounded"
                                style={{
                                  fontSize: "0.75rem",
                                  background: leg.isWalkFallback
                                    ? "rgba(59,130,246,0.08)"
                                    : "rgba(0,0,0,0.04)",
                                  color: "#374151",
                                  border: leg.isWalkFallback
                                    ? "1px solid rgba(59,130,246,0.2)"
                                    : "none",
                                }}
                              >
                                <span
                                  style={{ fontWeight: 500, color: "#7c3aed" }}
                                >
                                  Leg {idx + 1}
                                </span>
                                {leg.isWalkFallback && (
                                  <span
                                    style={{
                                      marginLeft: 4,
                                      fontSize: "0.7rem",
                                      color: "#3b82f6",
                                      fontWeight: 600,
                                    }}
                                  >
                                    🚶 Walk
                                  </span>
                                )}
                                {": "}
                                {idx === 0
                                  ? "Start"
                                  : (routeStops[idx - 1]?.name ?? "Stop")}{" "}
                                {"\u2192"}{" "}
                                {routeStops[idx]?.name ?? "Destination"}
                                <span style={{ color: "#6b7280" }}>
                                  {" "}
                                  ({Number(leg.totalDistance).toFixed(2)}km, ~
                                  {Math.round(leg.estimatedTime)}min)
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Directions */}
                        {routeLegs.some((l) => l.steps.length > 0) && (
                          <div className="pt-2">
                            <p
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 500,
                                marginBottom: "0.25rem",
                                color: "#374151",
                              }}
                            >
                              Directions
                            </p>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {routeLegs.flatMap((leg, legIdx) =>
                                leg.steps.map((step, stepIdx) => (
                                  <div
                                    key={`${legIdx}-${stepIdx}`}
                                    className="p-1.5 rounded"
                                    style={{
                                      fontSize: "0.75rem",
                                      background: "rgba(0,0,0,0.04)",
                                      color: "#374151",
                                    }}
                                  >
                                    {routeLegs.length > 1 && (
                                      <span
                                        style={{
                                          fontSize: "0.65rem",
                                          color: "#9ca3af",
                                        }}
                                      >
                                        [Leg {legIdx + 1}]{" "}
                                      </span>
                                    )}
                                    <span
                                      style={{
                                        fontWeight: 500,
                                        color: "#2563eb",
                                      }}
                                    >
                                      {stepIdx + 1}.
                                    </span>{" "}
                                    {step.instruction}
                                    <span style={{ color: "#6b7280" }}>
                                      {" "}
                                      ({Number(step.distance).toFixed(2)}km)
                                    </span>
                                  </div>
                                )),
                              )}
                            </div>
                          </div>
                        )}

                        {routeError && (
                          <div
                            className="p-2 rounded"
                            style={{ background: "rgba(220, 38, 38, 0.08)" }}
                          >
                            <p
                              style={{ color: "#dc2626", fontSize: "0.75rem" }}
                            >
                              {routeError}
                            </p>
                          </div>
                        )}

                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "#6b7280",
                            fontStyle: "italic",
                          }}
                        >
                          Add more stops from the dropdown or click the map
                        </p>
                      </>
                    ) : routeError ? (
                      <div
                        className="p-2 rounded"
                        style={{ background: "rgba(220, 38, 38, 0.08)" }}
                      >
                        <p
                          style={{
                            color: "#dc2626",
                            fontWeight: 600,
                            fontSize: "0.8rem",
                          }}
                        >
                          Route not found
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "#991b1b" }}>
                          {routeError}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {(routeStart || routeLegs.length > 0) && (
                    <Button
                      className="w-full"
                      color="danger"
                      size="sm"
                      variant="flat"
                      onClick={clearRoute}
                    >
                      Clear Route
                    </Button>
                  )}
                </>
              )}

              {/* Transit Route Mode Panel */}
              {mode === "transit_route" && (
                <div className="space-y-2">
                  <div
                    className="p-2 rounded"
                    style={{
                      background: "rgba(139,92,246,0.08)",
                      border: "1px solid rgba(139,92,246,0.2)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#7c3aed",
                      }}
                    >
                      Transit Route Builder
                    </p>
                    <p
                      style={{
                        fontSize: "0.7rem",
                        color: "#6b7280",
                        marginTop: "2px",
                      }}
                    >
                      Click roads to add/remove from route.
                      {transitPickupMode === "stops_only" &&
                        " Click transit stops to toggle them."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="p-2 rounded text-center"
                      style={{ background: "rgba(0,0,0,0.04)" }}
                    >
                      <p style={{ fontSize: "0.65rem", color: "#6b7280" }}>
                        Roads
                      </p>
                      <p style={{ fontWeight: 700, color: "#7c3aed" }}>
                        {transitSelectedRoadIds.length}
                      </p>
                    </div>
                    <div
                      className="p-2 rounded text-center"
                      style={{ background: "rgba(0,0,0,0.04)" }}
                    >
                      <p style={{ fontSize: "0.65rem", color: "#6b7280" }}>
                        Stops
                      </p>
                      <p style={{ fontWeight: 700, color: "#7c3aed" }}>
                        {transitSelectedStopIds.length}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-1 rounded"
                      style={{ background: transitRouteColor }}
                    />
                    <span style={{ fontSize: "0.7rem", color: "#374151" }}>
                      Selected road
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-1 rounded"
                      style={{ background: "#94a3b8" }}
                    />
                    <span style={{ fontSize: "0.7rem", color: "#374151" }}>
                      Unselected road
                    </span>
                  </div>
                  {transitPickupMode === "stops_only" && (
                    <>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: "#3b82f6" }}
                        />
                        <span style={{ fontSize: "0.7rem", color: "#374151" }}>
                          Bus Stop
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: "#8b5cf6" }}
                        />
                        <span style={{ fontSize: "0.7rem", color: "#374151" }}>
                          Bus Terminal
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ background: "#0891b2" }}
                        />
                        <span style={{ fontSize: "0.7rem", color: "#374151" }}>
                          Pier / Port
                        </span>
                      </div>
                    </>
                  )}
                  {(transitSelectedRoadIds.length > 0 ||
                    transitSelectedStopIds.length > 0) &&
                    onTransitRoadsChange && (
                      <Button
                        className="w-full"
                        color="danger"
                        size="sm"
                        variant="flat"
                        onClick={() => {
                          onTransitRoadsChange([]);
                          onTransitStopsChange?.([]);
                        }}
                      >
                        Clear Selection
                      </Button>
                    )}
                </div>
              )}

              {/* Legend */}
              <div
                className="pt-3"
                style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }}
              >
                <p
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "0.5rem",
                    color: "#111827",
                  }}
                >
                  Legend
                </p>
                <div
                  className="space-y-1"
                  style={{ fontSize: "0.75rem", color: "#374151" }}
                >
                  {/* Points section - circles for intersection-type points */}
                  <p
                    style={{
                      fontSize: "0.7rem",
                      color: "#6b7280",
                      marginBottom: "2px",
                      fontWeight: 500,
                    }}
                  >
                    Points
                  </p>
                  {[
                    { type: "bus_terminal", label: "Bus Terminal" },
                    { type: "bus_stop", label: "Bus Stop" },
                    { type: "pier", label: "Pier" },
                    { type: "intersection", label: "Intersection" },
                  ].map((item) => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div
                        className="flex-shrink-0"
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: getCircleMarkerColor(item.type),
                          border: "2px solid white",
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                        }}
                      />
                      <span>{item.label}</span>
                    </div>
                  ))}

                  {/* Destinations section - pin marker icon */}
                  <div
                    style={{
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      margin: "6px 0",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "0.7rem",
                      color: "#6b7280",
                      marginBottom: "2px",
                      fontWeight: 500,
                    }}
                  >
                    Destinations
                  </p>
                  <div className="flex items-center gap-2">
                    <svg
                      className="flex-shrink-0"
                      fill="none"
                      height="18"
                      viewBox="0 0 28 36"
                      width="14"
                    >
                      <path
                        d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                        fill="#e11d48"
                      />
                      <circle
                        cx="14"
                        cy="14"
                        fill="white"
                        fillOpacity="0.9"
                        r="7"
                      />
                      <circle cx="14" cy="14" fill="#e11d48" r="4" />
                    </svg>
                    <span>Destination</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg
                      className="flex-shrink-0"
                      fill="none"
                      height="18"
                      viewBox="0 0 28 36"
                      width="14"
                    >
                      <path
                        d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                        fill="#f59e0b"
                      />
                      <circle
                        cx="14"
                        cy="14"
                        fill="white"
                        fillOpacity="0.9"
                        r="7"
                      />
                      <circle cx="14" cy="14" fill="#f59e0b" r="4" />
                    </svg>
                    <span>Featured Destination</span>
                  </div>
                  <p
                    style={{
                      fontSize: "0.65rem",
                      color: "#9ca3af",
                      fontStyle: "italic",
                      marginTop: "2px",
                    }}
                  >
                    Zoom in to see images
                  </p>

                  {/* Roads section */}
                  {savedRoads.length > 0 && (
                    <>
                      <div
                        style={{
                          borderTop: "1px solid rgba(0,0,0,0.08)",
                          margin: "6px 0",
                        }}
                      />
                      <p
                        style={{
                          fontSize: "0.7rem",
                          color: "#6b7280",
                          marginBottom: "2px",
                          fontWeight: 500,
                        }}
                      >
                        Roads ({savedRoads.length})
                      </p>
                      {[
                        { type: "highway", label: "Highway", color: "#dc2626" },
                        {
                          type: "main_road",
                          label: "Main Road",
                          color: "#2563eb",
                        },
                        {
                          type: "local_road",
                          label: "Local Road",
                          color: "#16a34a",
                        },
                        {
                          type: "ferry",
                          label: "Ferry Route",
                          color: "#7c3aed",
                        },
                      ].map((item) => (
                        <div
                          key={item.type}
                          className="flex items-center gap-2"
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "3px",
                              background: item.color,
                              borderRadius: "2px",
                            }}
                          />
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Layer Filters ──────────────────────────────────────────── */}
            <div
              className="pt-3"
              style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  marginBottom: "0.5rem",
                  color: "#111827",
                }}
              >
                Layers
              </p>
              <div className="space-y-1.5">
                {(
                  [
                    {
                      label: "Roads",
                      state: showRoads,
                      set: setShowRoads,
                      color: "#2563eb",
                    },
                    {
                      label: "Nodes & Stops",
                      state: showNodes,
                      set: setShowNodes,
                      color: "#6b7280",
                    },
                    {
                      label: "Destinations",
                      state: showDestinations,
                      set: setShowDestinations,
                      color: "#e11d48",
                    },
                    {
                      label: "Route",
                      state: showRoute,
                      set: setShowRoute,
                      color: "#7c3aed",
                    },
                  ] as const
                ).map(({ label, state, set, color }) => (
                  <button
                    key={label}
                    className="flex items-center justify-between w-full rounded-lg px-2 py-1.5"
                    style={{
                      background: state ? `${color}11` : "rgba(0,0,0,0.03)",
                      border: `1px solid ${state ? color + "44" : "transparent"}`,
                      cursor: "pointer",
                    }}
                    type="button"
                    onClick={() => set(!state)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: state ? color : "#d1d5db",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: state ? "#111827" : "#9ca3af",
                          fontWeight: state ? 500 : 400,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: state ? color : "#9ca3af",
                        fontWeight: 600,
                      }}
                    >
                      {state ? "ON" : "OFF"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Map */}
      <MapContainer
        center={[10.3157, 123.8854]}
        className="z-0"
        maxBounds={[
          [9.35, 123.15],
          [11.35, 124.65],
        ]}
        maxBoundsViscosity={1.0}
        maxZoom={19}
        minZoom={9}
        style={{ height: "100%", width: "100%" }}
        zoom={11}
        zoomControl={false}
      >
        {/* Dynamic tile layer — key forces remount on layer switch */}
        <TileLayer
          key={tileLayer}
          attribution={TILE_LAYERS[tileLayer].attribution}
          maxNativeZoom={TILE_LAYERS[tileLayer].maxZoom}
          maxZoom={TILE_LAYERS[tileLayer].maxZoom}
          subdomains={TILE_LAYERS[tileLayer].subdomains ?? "abc"}
          url={TILE_LAYERS[tileLayer].url}
        />

        <MapRefSetter mapRef={mapImperativeRef} />
        <MapClickHandler mode={mode} onMapClick={handleMapClick} />
        <CenterMapButton />

        {/* Existing markers — render as CircleMarker for all point types */}
        {showNodes &&
          markers.map((marker, index) => {
            const isTransitStop = ["bus_stop", "bus_terminal", "pier"].includes(
              marker.type,
            );
            const isTransitMode = mode === "transit_route";
            const isTransitSelected = marker.id
              ? transitSelectedStopIds.includes(marker.id)
              : false;
            // Smaller fixed-pixel radii — clean at any zoom level
            const transitRadius = isTransitSelected ? 7 : 4;
            const transitFillOpacity = isTransitSelected ? 1.0 : 0.5;
            const normalRadius = marker.type === "intersection" ? 3 : 5;

            return (
              <CircleMarker
                key={marker.id || `marker-${index}`}
                center={marker.position}
                eventHandlers={{
                  click: (e) => {
                    if (
                      isTransitMode &&
                      isTransitStop &&
                      transitPickupMode === "stops_only" &&
                      marker.id &&
                      onTransitStopsChange
                    ) {
                      const cur = new Set(transitSelectedStopIds);

                      if (cur.has(marker.id)) {
                        cur.delete(marker.id);
                      } else {
                        cur.add(marker.id);
                      }
                      onTransitStopsChange(Array.from(cur));
                    } else if (mode !== "view") {
                      L.DomEvent.stopPropagation(e);
                    }
                  },
                }}
                pathOptions={{
                  color: isTransitMode && isTransitSelected ? "#fff" : "#fff",
                  weight: isTransitMode ? (isTransitSelected ? 3 : 1.5) : 2,
                  fillColor: getCircleMarkerColor(marker.type),
                  fillOpacity: isTransitMode ? transitFillOpacity : 0.9,
                  interactive:
                    mode === "view" ||
                    (isTransitMode &&
                      isTransitStop &&
                      transitPickupMode === "stops_only"),
                }}
                radius={isTransitMode ? transitRadius : normalRadius}
              >
                {mode === "view" && (
                  <Popup>
                    <div style={{ minWidth: "160px" }}>
                      <p className="font-semibold text-sm">{marker.name}</p>
                      <p className="text-xs text-gray-500 mb-2">
                        {marker.type.replace("_", " ")}
                      </p>
                      <p className="text-xs text-gray-400 mb-2">
                        {Number(marker.position[0]).toFixed(6)},{" "}
                        {Number(marker.position[1]).toFixed(6)}
                      </p>
                      {marker.id && mode === "view" && (
                        <div style={{ display: "flex", gap: "4px" }}>
                          {onUpdatePoint && (
                            <button
                              style={{
                                padding: "2px 8px",
                                fontSize: "11px",
                                background: "#2563eb",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                const newName = prompt(
                                  "Edit name:",
                                  marker.name,
                                );

                                if (
                                  newName &&
                                  newName !== marker.name &&
                                  marker.id
                                ) {
                                  onUpdatePoint(marker.id, {
                                    name: newName,
                                  }).then(() => {
                                    setMarkers((prev) =>
                                      prev.map((m) =>
                                        m.id === marker.id
                                          ? { ...m, name: newName }
                                          : m,
                                      ),
                                    );
                                  });
                                }
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {onDeletePoint && (
                            <button
                              style={{
                                padding: "2px 8px",
                                fontSize: "11px",
                                background: "#dc2626",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                if (
                                  confirm(`Delete "${marker.name}"?`) &&
                                  marker.id
                                ) {
                                  onDeletePoint(marker.id).then(() => {
                                    setMarkers((prev) =>
                                      prev.filter((m) => m.id !== marker.id),
                                    );
                                  });
                                }
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </Popup>
                )}
              </CircleMarker>
            );
          })}

        {/* Destination markers — zoom-aware with image/name display */}
        {showDestinations &&
          destinationMarkers.map((dest) => (
            <ZoomAwareDestinationMarker
              key={`dest-${dest.id}`}
              address={dest.address}
              categoryName={dest.categoryName}
              image={dest.image}
              interactive={mode === "view"}
              isFeatured={dest.isFeatured}
              name={dest.name}
              position={dest.position}
              showPopup={mode === "view"}
            />
          ))}

        {/* Saved roads from server */}
        {showRoads &&
          savedRoads.map((road) => {
            const isTransitMode = mode === "transit_route";
            const isTransitSelected = transitSelectedRoadIds.includes(road.id);
            const roadColor = isTransitMode
              ? isTransitSelected
                ? transitRouteColor
                : "#94a3b8"
              : getRoadColor(road.roadType);
            const roadWeight = isTransitMode
              ? isTransitSelected
                ? 5
                : 2
              : road.roadType === "ferry"
                ? 2
                : 3;
            const roadOpacity = isTransitMode
              ? isTransitSelected
                ? 0.95
                : 0.35
              : 0.8;

            return (
              <React.Fragment key={`saved-road-${road.id}`}>
                <Polyline
                  eventHandlers={
                    isTransitMode && onTransitRoadsChange
                      ? {
                          click: () => {
                            const cur = new Set(transitSelectedRoadIds);

                            if (cur.has(road.id)) {
                              cur.delete(road.id);
                            } else {
                              cur.add(road.id);
                            }
                            onTransitRoadsChange(Array.from(cur));
                          },
                        }
                      : {}
                  }
                  pathOptions={{
                    color: roadColor,
                    weight: roadWeight,
                    opacity: roadOpacity,
                    dashArray:
                      !isTransitMode && road.roadType === "ferry"
                        ? "8 6"
                        : undefined,
                  }}
                  positions={road.positions}
                >
                  {!isTransitMode && (
                    <Popup>
                      <div style={{ minWidth: "140px" }}>
                        <p
                          style={{
                            fontWeight: 600,
                            fontSize: "13px",
                            margin: "0 0 4px",
                          }}
                        >
                          {road.name}
                        </p>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "#6b7280",
                            margin: "0 0 2px",
                          }}
                        >
                          Type: {road.roadType.replace("_", " ")}
                        </p>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "#6b7280",
                            margin: "0 0 2px",
                          }}
                        >
                          {Number(road.distance).toFixed(2)} km &middot; ~
                          {Math.round(road.estimatedTime)} min
                        </p>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "#6b7280",
                            margin: "0 0 8px",
                          }}
                        >
                          Direction:{" "}
                          {road.isBidirectional ? "↔ Two-way" : "→ One-way"}
                        </p>
                        {onDeleteRoad && (
                          <Button
                            color="danger"
                            size="sm"
                            style={{
                              fontSize: "11px",
                              minHeight: "24px",
                              height: "24px",
                              padding: "0 8px",
                            }}
                            variant="flat"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete road "${road.name}"? This cannot be undone.`,
                                )
                              ) {
                                onDeleteRoad(road.id);
                              }
                            }}
                          >
                            Delete Road
                          </Button>
                        )}
                      </div>
                    </Popup>
                  )}
                </Polyline>
                {/* Show direction decorators: in transit mode only for selected roads */}
                {(!isTransitMode || isTransitSelected) && (
                  <RoadDecorator
                    color={roadColor}
                    isBidirectional={road.isBidirectional}
                    positions={road.positions}
                  />
                )}
              </React.Fragment>
            );
          })}

        {/* Road in progress */}
        {roadPoints.length > 0 && (
          <RoadPolyline
            color="blue"
            isBidirectional={isBidirectional}
            opacity={0.7}
            positions={roadPoints}
            weight={4}
          />
        )}

        {/* Road point indicators */}
        {mode === "add_road" &&
          roadPoints.map((pt, idx) => (
            <CircleMarker
              key={`road-pt-${idx}`}
              center={pt}
              pathOptions={{
                color: snappedIndices.has(idx) ? "#16a34a" : "#f59e0b",
                fillColor: snappedIndices.has(idx) ? "#16a34a" : "#f59e0b",
                fillOpacity: 0.8,
                weight: 2,
              }}
              radius={snappedIndices.has(idx) ? 7 : 5}
            >
              <Popup>
                <span className="text-xs">
                  {snappedIndices.has(idx)
                    ? "Snapped to intersection"
                    : "Free point"}
                  {idx === 0 && " (start)"}
                  {idx === roadPoints.length - 1 && idx > 0 && " (end)"}
                </span>
              </Popup>
            </CircleMarker>
          ))}

        {/* Route testing: start marker */}
        {mode === "test_route" && routeStart && (
          <CircleMarker
            center={routeStart}
            pathOptions={{
              color: "#16a34a",
              fillColor: "#22c55e",
              fillOpacity: 0.9,
              weight: 3,
            }}
            radius={10}
          >
            <Popup>
              <span style={{ color: "#111", fontWeight: 600 }}>
                Start Point
              </span>
            </Popup>
          </CircleMarker>
        )}

        {/* Route testing: stop markers */}
        {mode === "test_route" &&
          routeStops.map((stop, idx) => (
            <CircleMarker
              key={`route-stop-${idx}`}
              center={stop.position}
              pathOptions={{
                color: idx === routeStops.length - 1 ? "#dc2626" : "#7c3aed",
                fillColor:
                  idx === routeStops.length - 1 ? "#ef4444" : "#a78bfa",
                fillOpacity: 0.9,
                weight: 3,
              }}
              radius={idx === routeStops.length - 1 ? 10 : 8}
            >
              <Popup>
                <span style={{ color: "#111", fontWeight: 600 }}>
                  Stop {idx + 1}: {stop.name}
                </span>
              </Popup>
            </CircleMarker>
          ))}

        {/* Route testing: route polylines (one per leg) */}
        {mode === "test_route" &&
          showRoute &&
          routeLegPositions.map((positions, idx) =>
            positions.length >= 2 ? (
              <Polyline
                key={`route-leg-${idx}`}
                pathOptions={{
                  color: "#7c3aed",
                  weight: 5,
                  opacity: 0.8,
                  dashArray: "10, 6",
                }}
                positions={positions}
              />
            ) : null,
          )}

        {/* Route testing: virtual connection lines (last-mile walk) */}
        {mode === "test_route" &&
          showRoute &&
          routeLegs.flatMap((leg, legIdx) =>
            (leg.virtualConnections || []).map((vc, idx) => (
              <Polyline
                key={`vc-${legIdx}-${idx}`}
                pathOptions={{
                  color: "#f59e0b",
                  weight: 3,
                  opacity: 0.7,
                  dashArray: "5, 8",
                }}
                positions={[
                  [vc.from.lat, vc.from.lon],
                  [vc.to.lat, vc.to.lon],
                ]}
              />
            )),
          )}

        {/* Route testing: walk fallback / walk-tail polylines (animated blue dashed) */}
        {mode === "test_route" &&
          showRoute &&
          routeLegs.map((leg, idx) => {
            const geo = leg.isWalkFallback
              ? (leg.routeGeometry as [number, number][])
              : leg.walkTail
                ? [leg.walkTail.from, leg.walkTail.to]
                : null;

            if (!geo || geo.length < 2) return null;
            return (
              <Polyline
                key={`walk-${idx}`}
                pathOptions={{
                  color: "#3b82f6",
                  weight: 4,
                  opacity: 0.9,
                  dashArray: "8 6",
                  className: "walk-route-polyline",
                }}
                positions={geo}
              />
            );
          })}

        {/* Destination placement marker */}
        {mode === "add_destination" && pendingPoint && (
          <CircleMarker
            center={[pendingPoint.lat, pendingPoint.lng]}
            pathOptions={{
              color: "#e11d48",
              fillColor: "#f43f5e",
              fillOpacity: 0.9,
              weight: 3,
            }}
            radius={12}
          >
            <Popup>
              <span style={{ color: "#111", fontWeight: 600 }}>
                New Destination
              </span>
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>

      {/* ── Floating right-side control cluster ───────────────────────────── */}
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-2"
        style={{ userSelect: "none" }}
      >
        {/* Zoom in */}
        <button
          className="map-fab"
          title="Zoom in (+)"
          onClick={() => mapImperativeRef.current?.zoomIn()}
        >
          +
        </button>
        {/* Zoom out */}
        <button
          className="map-fab"
          title="Zoom out (−)"
          onClick={() => mapImperativeRef.current?.zoomOut()}
        >
          −
        </button>
        {/* Reset view */}
        <button
          className="map-fab"
          title="Reset view (0)"
          onClick={() =>
            mapImperativeRef.current?.setView([10.3157, 123.8854], 11)
          }
        >
          ⊙
        </button>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(0,0,0,0.1)",
            margin: "2px 4px",
          }}
        />

        {/* Layer picker toggle */}
        <div className="relative">
          <button
            className={`map-fab ${showLayerPicker ? "map-fab-active" : ""}`}
            title="Switch tile layer"
            onClick={() => setShowLayerPicker((v) => !v)}
          >
            {TILE_LAYERS[tileLayer].icon}
          </button>
          {showLayerPicker && (
            <div
              className="absolute right-12 top-0 flex flex-col gap-1 rounded-xl shadow-xl p-2"
              style={{
                background: "white",
                border: "1px solid rgba(0,0,0,0.12)",
                minWidth: 130,
              }}
            >
              {(Object.keys(TILE_LAYERS) as TileLayerKey[]).map((key) => (
                <button
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm"
                  style={{
                    background:
                      tileLayer === key ? "rgba(37,99,235,0.1)" : "transparent",
                    color: tileLayer === key ? "#2563eb" : "#374151",
                    fontWeight: tileLayer === key ? 600 : 400,
                    cursor: "pointer",
                    border: "none",
                  }}
                  onClick={() => {
                    setTileLayer(key);
                    setShowLayerPicker(false);
                  }}
                >
                  <span>{TILE_LAYERS[key].icon}</span>
                  <span>{TILE_LAYERS[key].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button
          className={`map-fab ${isFullscreen ? "map-fab-active" : ""}`}
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          onClick={() => {
            if (!document.fullscreenElement) {
              void document.documentElement.requestFullscreen();
            } else {
              void document.exitFullscreen();
            }
          }}
        >
          {isFullscreen ? "⛶" : "⛶"}
        </button>

        {/* Shortcuts modal */}
        <button
          className={`map-fab ${showShortcutsModal ? "map-fab-active" : ""}`}
          title="Keyboard shortcuts (?)"
          onClick={() => setShowShortcutsModal((v) => !v)}
        >
          ?
        </button>
      </div>

      {/* ── Keyboard Shortcuts Modal ──────────────────────────────────────── */}
      <Modal
        classNames={modalClassNames}
        isOpen={showShortcutsModal}
        size="md"
        onClose={() => setShowShortcutsModal(false)}
      >
        <ModalContent>
          <ModalHeader>Keyboard Shortcuts</ModalHeader>
          <ModalBody>
            <div className="space-y-3 pb-2">
              {[
                {
                  group: "Modes",
                  rows: [
                    { key: "V", label: "View mode" },
                    { key: "P", label: "Add Point mode" },
                    { key: "R", label: "Add Road mode" },
                    { key: "D", label: "Add Destination mode" },
                    { key: "T", label: "Route Test mode" },
                    { key: "X", label: "Transit Route mode" },
                  ],
                },
                {
                  group: "Map",
                  rows: [
                    { key: "+ / =", label: "Zoom in" },
                    { key: "−", label: "Zoom out" },
                    { key: "0", label: "Reset view to Cebu" },
                    { key: "F", label: "Toggle fullscreen" },
                  ],
                },
                {
                  group: "Editing",
                  rows: [
                    { key: "Ctrl + Z", label: "Undo last road point" },
                    { key: "Esc", label: "Close layer picker / this modal" },
                    { key: "?", label: "Toggle this shortcuts panel" },
                  ],
                },
              ].map(({ group, rows }) => (
                <div key={group}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                    {group}
                  </p>
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    {rows.map(({ key, label }, i) => (
                      <div
                        key={key}
                        className="flex items-center justify-between px-3 py-2"
                        style={{
                          background:
                            i % 2 === 0 ? "rgba(0,0,0,0.02)" : "transparent",
                        }}
                      >
                        <span className="text-sm text-gray-700">{label}</span>
                        <kbd
                          className="text-xs px-2 py-0.5 rounded font-mono"
                          style={{
                            background: "rgba(0,0,0,0.07)",
                            border: "1px solid rgba(0,0,0,0.12)",
                            color: "#374151",
                          }}
                        >
                          {key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              variant="flat"
              onClick={() => setShowShortcutsModal(false)}
            >
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Point Modal */}
      <Modal
        classNames={modalClassNames}
        isDismissable={false}
        isOpen={isModalOpen}
        onClose={handleCancelPoint}
      >
        <ModalContent>
          <ModalHeader>
            Add New {pointType.replace("_", " ").toUpperCase()}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                isRequired
                label="Name"
                placeholder={`Enter ${pointType} name`}
                value={newPointName}
                onChange={(e) => setNewPointName(e.target.value)}
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
      <Modal
        classNames={modalClassNames}
        isDismissable={false}
        isOpen={isRoadModalOpen}
        onClose={handleCancelRoad}
      >
        <ModalContent>
          <ModalHeader>Save Road</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                isRequired
                label="Road Name"
                placeholder="Enter road name"
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
              />
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>
                  Road Type:{" "}
                  <span className="font-medium">
                    {roadType.replace("_", " ")}
                  </span>
                </p>
                <p>
                  Total Points:{" "}
                  <span className="font-medium">{roadPoints.length}</span>
                </p>
                <div>
                  <p className="mb-1">Direction:</p>
                  <div className="flex gap-1">
                    <Button
                      className="flex-1"
                      color={!isBidirectional ? "primary" : "default"}
                      size="sm"
                      variant={!isBidirectional ? "solid" : "flat"}
                      onClick={() => setIsBidirectional(false)}
                    >
                      → 1-Way
                    </Button>
                    <Button
                      className="flex-1"
                      color={isBidirectional ? "primary" : "default"}
                      size="sm"
                      variant={isBidirectional ? "solid" : "flat"}
                      onClick={() => setIsBidirectional(true)}
                    >
                      ↔ 2-Way
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-amber-400">
                &ldquo;Back to Drawing&rdquo; keeps your points.{" "}
                &ldquo;Discard&rdquo; removes them.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="danger"
              variant="flat"
              onClick={handleDiscardRoadFromModal}
            >
              Discard Road
            </Button>
            <Button variant="flat" onClick={handleCancelRoad}>
              ← Back to Drawing
            </Button>
            <Button color="success" onClick={handleSaveRoad}>
              Save Road
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Cancel road confirmation modal */}
      <Modal
        classNames={modalClassNames}
        isOpen={isCancelRoadModalOpen}
        size="sm"
        onClose={() => setIsCancelRoadModalOpen(false)}
      >
        <ModalContent>
          <ModalHeader>Cancel Road Drawing?</ModalHeader>
          <ModalBody>
            <p className="text-sm" style={{ color: "#374151" }}>
              You have{" "}
              <span className="font-semibold">
                {roadPoints.length} point{roadPoints.length !== 1 ? "s" : ""}
              </span>{" "}
              drawn. What would you like to do?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              size="sm"
              variant="flat"
              onClick={() => setIsCancelRoadModalOpen(false)}
            >
              Keep Drawing
            </Button>
            <Button
              color="warning"
              size="sm"
              variant="flat"
              onClick={() => {
                setIsCancelRoadModalOpen(false);
                undoLastPoint();
              }}
            >
              ↩ Undo Last Point
            </Button>
            <Button color="danger" size="sm" onClick={discardAllRoadPoints}>
              Discard All
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Destination Modal */}
      <Modal
        classNames={modalClassNames}
        isDismissable={false}
        isOpen={isDestModalOpen}
        size="2xl"
        onClose={handleCancelDest}
      >
        <ModalContent>
          <ModalHeader>Create New Destination</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                isRequired
                label="Destination Name"
                placeholder="Enter destination name"
                value={destForm.name}
                onChange={(e) =>
                  setDestForm({ ...destForm, name: e.target.value })
                }
              />

              {categories && categories.length > 0 ? (
                <Select
                  isRequired
                  label="Category"
                  selectedKeys={
                    destForm.category_id ? [destForm.category_id] : []
                  }
                  onChange={(e) =>
                    setDestForm({ ...destForm, category_id: e.target.value })
                  }
                >
                  {categories.map((cat) => (
                    <SelectItem key={cat.id}>{cat.name}</SelectItem>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-amber-500">
                  No categories available. Please create categories first.
                </p>
              )}

              <Textarea
                label="Description"
                maxRows={8}
                minRows={3}
                placeholder="Describe this destination..."
                value={destForm.description}
                onChange={(e) =>
                  setDestForm({ ...destForm, description: e.target.value })
                }
              />

              <Input
                label="Address"
                placeholder="Enter address (optional)"
                value={destForm.address}
                onChange={(e) =>
                  setDestForm({ ...destForm, address: e.target.value })
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Local Fee (PHP)"
                  type="number"
                  value={destForm.entrance_fee_local}
                  onChange={(e) =>
                    setDestForm({
                      ...destForm,
                      entrance_fee_local: e.target.value,
                    })
                  }
                />
                <Input
                  label="Foreign Fee (PHP)"
                  type="number"
                  value={destForm.entrance_fee_foreign}
                  onChange={(e) =>
                    setDestForm({
                      ...destForm,
                      entrance_fee_foreign: e.target.value,
                    })
                  }
                />
              </div>

              <Input
                label="Best Time to Visit"
                placeholder="e.g. Morning, 6AM-10AM"
                value={destForm.best_time_to_visit}
                onChange={(e) =>
                  setDestForm({
                    ...destForm,
                    best_time_to_visit: e.target.value,
                  })
                }
              />

              <Input
                label="Amenities"
                placeholder="Comma-separated: Parking, WiFi, Restroom"
                value={destForm.amenities}
                onChange={(e) =>
                  setDestForm({ ...destForm, amenities: e.target.value })
                }
              />

              {pendingPoint && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>
                    Location: {pendingPoint.lat.toFixed(6)},{" "}
                    {pendingPoint.lng.toFixed(6)}
                  </p>
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
