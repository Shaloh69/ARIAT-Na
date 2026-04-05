import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import L from "leaflet";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickerDestination {
  category_name?: string;
  id: string;
  images?: string[];
  latitude: number;
  longitude: number;
  municipality?: string;
  name: string;
}

interface PickerMapProps {
  destinations: PickerDestination[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

// ─── Pin factory ─────────────────────────────────────────────────────────────

function createPin(isSelected: boolean, order: number): L.DivIcon {
  if (isSelected) {
    return L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:36px;height:36px;">
          <!-- glow ring -->
          <div style="
            position:absolute;inset:-4px;
            border-radius:50%;
            background:rgba(225,29,72,0.22);
            animation:pinPulse 1.6s ease-in-out infinite;
          "></div>
          <!-- pin body -->
          <div style="
            position:absolute;inset:0;
            border-radius:50%;
            background:#e11d48;
            border:2.5px solid #fff;
            box-shadow:0 4px 18px rgba(225,29,72,0.7);
            display:flex;align-items:center;justify-content:center;
            font-size:14px;font-weight:800;color:#fff;font-family:sans-serif;
            cursor:pointer;
          ">${order}</div>
        </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -22],
    });
  }

  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:18px;height:18px;
        border-radius:50%;
        background:#ffffff;
        border:2px solid rgba(255,255,255,0.3);
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
        cursor:pointer;
        transition:transform .15s;
      "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -14],
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PickerMap({ destinations, selectedIds, onToggle }: PickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Keep latest callbacks in refs so marker event handlers stay fresh
  const selectedIdsRef = useRef(selectedIds);
  const onToggleRef = useRef(onToggle);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { onToggleRef.current = onToggle; }, [onToggle]);

  // ── Init map once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [10.3157, 123.8854],
      zoom: 10,
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
    });

    // CartoDB dark tiles — matches kiosk dark theme
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        subdomains: "abcd",
      },
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync markers when destinations list changes ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const nextIds = new Set(destinations.map((d) => d.id));

    // Remove stale markers
    existing.forEach((marker, id) => {
      if (!nextIds.has(id)) { marker.remove(); existing.delete(id); }
    });

    // Add new markers
    destinations.forEach((dest) => {
      if (!dest.latitude || !dest.longitude) return;
      if (existing.has(dest.id)) return;

      const isSelected = selectedIdsRef.current.includes(dest.id);
      const order = selectedIdsRef.current.indexOf(dest.id) + 1;

      const marker = L.marker([dest.latitude, dest.longitude], {
        icon: createPin(isSelected, order),
        zIndexOffset: isSelected ? 1000 : 0,
      })
        .addTo(map)
        .bindTooltip(
          `<b>${dest.name}</b><br/><span style="opacity:.6">${dest.municipality ?? dest.category_name ?? ""}</span>`,
          { className: "map-tooltip", direction: "top", offset: [0, -14] },
        )
        .on("click", () => {
          onToggleRef.current(dest.id);
        });

      existing.set(dest.id, marker);
    });

    // Fit to bounds on first load
    if (destinations.length > 0) {
      try {
        const pts = destinations
          .filter((d) => d.latitude && d.longitude)
          .map((d): L.LatLngTuple => [d.latitude, d.longitude]);
        if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 13 });
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations]);

  // ── Update icons + flyTo when selection changes ───────────────────
  useEffect(() => {
    const map = mapRef.current;

    markersRef.current.forEach((marker, id) => {
      const isSel = selectedIds.includes(id);
      const order = selectedIds.indexOf(id) + 1;
      marker.setIcon(createPin(isSel, order));
      marker.setZIndexOffset(isSel ? 1000 : 0);
    });

    // Fly to most recently selected
    if (selectedIds.length > 0 && map) {
      const lastId = selectedIds[selectedIds.length - 1];
      const dest = destinations.find((d) => d.id === lastId);
      if (dest?.latitude && dest?.longitude) {
        map.flyTo([dest.latitude, dest.longitude], Math.max(map.getZoom(), 13), {
          animate: true, duration: 0.7,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  return (
    <>
      <style>{`
        @keyframes pinPulse {
          0%,100% { transform: scale(1); opacity: .7; }
          50% { transform: scale(1.35); opacity: .35; }
        }
      `}</style>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </>
  );
}
