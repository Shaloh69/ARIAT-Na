import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import L from "leaflet";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItineraryStop {
  destination: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    category_name?: string;
    municipality?: string;
    images?: string[];
  };
  leg_distance?: number;
  leg_travel_time?: number;
  visit_duration?: number;
  route_geometry?: [number, number][];
}

interface DayPlan {
  dayNumber?: number;
  itinerary?: { stops?: ItineraryStop[] };
  stops?: ItineraryStop[];
}

interface ItineraryData {
  // Single-day
  stops?: ItineraryStop[];
  legs?: Array<{ routeGeometry?: [number, number][] }>;
  // Multi-day
  days?: DayPlan[];
}

interface ItineraryMapProps {
  /** Raw itinerary JSON from POST /kiosk/generate */
  itinerary: ItineraryData;
  days: number;
  /** Height of the map container */
  height?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAllStops(itinerary: ItineraryData, days: number): ItineraryStop[] {
  if (days > 1 && itinerary.days) {
    return itinerary.days.flatMap((d) => d.itinerary?.stops ?? d.stops ?? []);
  }

  return itinerary.stops ?? [];
}

function getLegsGeometry(
  itinerary: ItineraryData,
  days: number,
): Array<[number, number][]> {
  if (days > 1 && itinerary.days) {
    return itinerary.days.flatMap((d) => {
      const stops = d.itinerary?.stops ?? d.stops ?? [];

      return stops.map((s) => s.route_geometry ?? []);
    });
  }
  // Single day: prefer legs array, else fall back to per-stop route_geometry
  if (itinerary.legs) {
    return itinerary.legs.map((l) => l.routeGeometry ?? []);
  }

  return (itinerary.stops ?? []).map((s) => s.route_geometry ?? []);
}

// Day colour palette
const DAY_COLORS = [
  "#e11d48",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

function numberPin(label: string, color: string, isActive = false): L.DivIcon {
  const size = isActive ? 36 : 30;

  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:${size}px; height:${size}px;
        border-radius:50%;
        background:${color};
        border:2.5px solid #fff;
        box-shadow:0 2px 10px ${color}80;
        display:flex; align-items:center; justify-content:center;
        font-size:${isActive ? 14 : 12}px;
        font-weight:800;
        color:#fff;
        font-family:sans-serif;
      ">${label}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ItineraryMap({
  itinerary,
  days,
  height = 380,
}: ItineraryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false, // kiosk — disable scroll zoom to avoid accidental zoom
      doubleClickZoom: true,
      dragging: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    renderItinerary(map, itinerary, days);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-render when itinerary changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    map.eachLayer((l) => {
      if (!(l instanceof L.TileLayer)) map.removeLayer(l);
    });
    renderItinerary(map, itinerary, days);
  }, [itinerary, days]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: "100%",
        borderRadius: 16,
        overflow: "hidden",
        zIndex: 0,
        position: "relative",
      }}
    />
  );
}

// ─── Map rendering logic (outside component to keep useEffect clean) ─────────

function renderItinerary(map: L.Map, itinerary: ItineraryData, days: number) {
  const allStops = getAllStops(itinerary, days);
  const legGeoms = getLegsGeometry(itinerary, days);

  if (allStops.length === 0) return;

  const bounds: L.LatLngTuple[] = [];

  // Iterate by day so colours are consistent
  if (days > 1 && itinerary.days) {
    let stopOffset = 0;

    itinerary.days.forEach((d, dayIdx) => {
      const stops = d.itinerary?.stops ?? d.stops ?? [];
      const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
      const routePts: L.LatLngTuple[] = [];

      stops.forEach((stop) => {
        const lat = stop.destination.latitude;
        const lon = stop.destination.longitude;

        bounds.push([lat, lon]);
        routePts.push([lat, lon]);

        // Leg polyline from geometry or straight line
        const geom = legGeoms[stopOffset] ?? [];

        if (geom.length >= 2) {
          L.polyline(geom as L.LatLngTuple[], {
            color,
            weight: 4,
            opacity: 0.75,
          }).addTo(map);
        } else if (stopOffset > 0) {
          const prev = allStops[stopOffset - 1];

          L.polyline(
            [
              [prev.destination.latitude, prev.destination.longitude],
              [lat, lon],
            ],
            { color, weight: 3, opacity: 0.55, dashArray: "8 6" },
          ).addTo(map);
        }

        // Marker
        L.marker([lat, lon], {
          icon: numberPin(`${stopOffset + 1}`, color),
        })
          .addTo(map)
          .bindPopup(
            `<b>${stop.destination.name}</b><br/>
             ${stop.destination.municipality ?? stop.destination.category_name ?? ""}<br/>
             <small>${stop.visit_duration ?? 60}min visit</small>`,
          );

        stopOffset++;
      });
    });
  } else {
    // Single day
    const color = DAY_COLORS[0];

    allStops.forEach((stop, i) => {
      const lat = stop.destination.latitude;
      const lon = stop.destination.longitude;

      bounds.push([lat, lon]);

      const geom = legGeoms[i] ?? [];

      if (geom.length >= 2) {
        L.polyline(geom as L.LatLngTuple[], {
          color,
          weight: 4,
          opacity: 0.8,
        }).addTo(map);
      } else if (i > 0) {
        const prev = allStops[i - 1];

        L.polyline(
          [
            [prev.destination.latitude, prev.destination.longitude],
            [lat, lon],
          ],
          { color, weight: 3, opacity: 0.55, dashArray: "8 6" },
        ).addTo(map);
      }

      L.marker([lat, lon], {
        icon: numberPin(`${i + 1}`, color, i === 0),
      })
        .addTo(map)
        .bindPopup(
          `<b>${stop.destination.name}</b><br/>
           ${stop.destination.municipality ?? stop.destination.category_name ?? ""}<br/>
           <small>${stop.visit_duration ?? 60}min visit · ${stop.leg_distance?.toFixed(1) ?? "—"}km</small>`,
        );
    });
  }

  // Fit map to all stop markers
  if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    try {
      map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48] });
    } catch {
      map.setView([10.3157, 123.8854], 10);
    }
  }
}
