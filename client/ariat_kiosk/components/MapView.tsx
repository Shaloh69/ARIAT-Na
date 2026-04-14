import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface MapDestination {
  category_name?: string;
  id: string;
  images?: string[];
  latitude: number;
  longitude: number;
  municipality?: string;
  name: string;
}

interface MapViewProps {
  destinations: MapDestination[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const CEBU_CENTER: [number, number] = [10.3157, 123.8854];
const DEFAULT_ZOOM = 10;

// Custom red pin for selected, white pin for others
function createPin(selected: boolean): L.DivIcon {
  const color = selected ? "#e11d48" : "#ffffff";
  const shadow = selected
    ? "0 4px 16px rgba(225,29,72,0.7)"
    : "0 2px 8px rgba(0,0,0,0.4)";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:20px; height:20px;
        border-radius:50% 50% 50% 0;
        background:${color};
        border: 2.5px solid ${selected ? "#fff" : "rgba(0,0,0,0.25)"};
        box-shadow:${shadow};
        transform: rotate(-45deg) translate(-2px,-2px);
        cursor:pointer;
      "></div>`,
    iconAnchor: [10, 20],
    iconSize: [20, 20],
    popupAnchor: [0, -24],
  });
}

export default function MapView({
  destinations,
  selectedId,
  onSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: CEBU_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    // CartoDB dark tiles — look great on a kiosk
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        subdomains: "abcd",
      },
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add/update markers when destinations change
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    destinations.forEach((dest) => {
      if (!dest.latitude || !dest.longitude) return;

      const isSelected = dest.id === selectedId;
      const marker = L.marker([dest.latitude, dest.longitude], {
        icon: createPin(isSelected),
        title: dest.name,
        zIndexOffset: isSelected ? 1000 : 0,
      });

      marker.addTo(map);
      marker.on("click", () => onSelect(dest.id));

      // Tooltip on hover
      marker.bindTooltip(dest.name, {
        className: "map-tooltip",
        direction: "top",
        offset: [0, -20],
        permanent: false,
      });

      markersRef.current.set(dest.id, marker);
    });
  }, [destinations, selectedId, onSelect]);

  // Pan to selected marker
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !selectedId) return;

    const dest = destinations.find((d) => d.id === selectedId);

    if (dest?.latitude && dest?.longitude) {
      map.flyTo([dest.latitude, dest.longitude], 14, {
        animate: true,
        duration: 0.8,
      });
    }

    // Update marker icons
    markersRef.current.forEach((marker, id) => {
      marker.setIcon(createPin(id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    });
  }, [selectedId, destinations]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);

    document.addEventListener("fullscreenchange", onFsChange);

    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void (wrapperRef.current ?? document.documentElement).requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

      {/* Touch-friendly fullscreen button */}
      <button
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 1000,
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "rgba(15,23,42,0.82)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "white",
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? "⛶" : "⛶"}
      </button>
    </div>
  );
}
