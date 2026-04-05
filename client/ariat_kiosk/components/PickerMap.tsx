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

// ─── Day colour palette (reuse same order as ItineraryMap) ───────────────────
const SEL_COLOR = "#e11d48";   // red — selected
const DEF_COLOR = "#6b7280";   // grey — unselected

function makePin(label: string, color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:${size}px; height:${size}px;
        border-radius:50%;
        background:${color};
        border:2.5px solid #fff;
        box-shadow:0 2px 8px ${color}90;
        display:flex; align-items:center; justify-content:center;
        font-size:${size > 28 ? 13 : 10}px;
        font-weight:800;
        color:#fff;
        font-family:sans-serif;
        cursor:pointer;
        transition:transform .15s;
      ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PickerMap({ destinations, selectedIds, onToggle }: PickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  // Keep a ref to the latest callbacks so event handlers don't go stale
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

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

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
      if (!nextIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });

    // Add new markers
    destinations.forEach((dest) => {
      if (!dest.latitude || !dest.longitude) return;
      if (existing.has(dest.id)) return;

      const isSelected = selectedIdsRef.current.includes(dest.id);
      const idx = selectedIdsRef.current.indexOf(dest.id);
      const label = isSelected ? `${idx + 1}` : "·";
      const marker = L.marker([dest.latitude, dest.longitude], {
        icon: makePin(label, isSelected ? SEL_COLOR : DEF_COLOR, isSelected ? 32 : 22),
      })
        .addTo(map)
        .bindPopup(
          `<b>${dest.name}</b><br/>${dest.municipality ?? dest.category_name ?? ""}`,
          { closeButton: false, maxWidth: 180 },
        )
        .on("click", () => {
          onToggleRef.current(dest.id);
        });

      existing.set(dest.id, marker);
    });

    // Fit to bounds if this is the first load
    if (destinations.length > 0 && existing.size > 0) {
      try {
        const bounds = destinations
          .filter((d) => d.latitude && d.longitude)
          .map((d): L.LatLngTuple => [d.latitude, d.longitude]);
        if (bounds.length > 1) {
          map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 13 });
        }
      } catch { /* noop */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations]);

  // ── Update marker icons when selection changes ────────────────────
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const isSelected = selectedIds.includes(id);
      const idx = selectedIds.indexOf(id);
      const label = isSelected ? `${idx + 1}` : "·";
      marker.setIcon(makePin(label, isSelected ? SEL_COLOR : DEF_COLOR, isSelected ? 32 : 22));
    });
  }, [selectedIds]);

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        width: "100%",
        borderRadius: 0,
        zIndex: 0,
        position: "relative",
      }}
    />
  );
}
