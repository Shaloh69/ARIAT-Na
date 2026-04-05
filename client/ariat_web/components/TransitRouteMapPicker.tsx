/**
 * TransitRouteMapPicker
 *
 * Leaflet map for selecting roads that form a transit route.
 * - Click a road to toggle it in/out of the route.
 * - For stops_only mode, transit stops on selected roads are highlighted;
 *   click them to toggle which stops are "official" for this route.
 * - One-way roads show a directional indicator; bidirectional roads are blue when selected.
 */

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Road {
  id: string;
  name: string;
  positions: [number, number][];
  roadType: string;
  isBidirectional: boolean;
}

interface Intersection {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  point_type: string;
}

interface Props {
  roads: Road[];
  intersections: Intersection[];
  selectedRoadIds: string[];
  selectedStopIds: string[];
  pickupMode: "anywhere" | "stops_only";
  routeColor: string;
  onRoadsChange: (ids: string[]) => void;
  onStopsChange: (ids: string[]) => void;
}

const STOP_COLORS: Record<string, string> = {
  bus_stop: "#3b82f6",
  bus_terminal: "#8b5cf6",
  pier: "#0891b2",
};

export default function TransitRouteMapPicker({
  roads,
  intersections,
  selectedRoadIds,
  selectedStopIds,
  pickupMode,
  routeColor,
  onRoadsChange,
  onStopsChange,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const roadLayersRef = useRef<
    Map<string, { line: L.Polyline; decorator?: any }>
  >(new Map());
  const stopLayersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // Local copies so Leaflet click handlers always see current values
  const selectedRoadsRef = useRef<Set<string>>(new Set(selectedRoadIds));
  const selectedStopsRef = useRef<Set<string>>(new Set(selectedStopIds));

  const [mapReady, setMapReady] = useState(false);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [10.3157, 123.8854],
      zoom: 12,
      minZoom: 9,
      maxZoom: 19,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxNativeZoom: 19,
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ── Draw / redraw roads whenever road list or selection changes ───────────
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) return;

    selectedRoadsRef.current = new Set(selectedRoadIds);

    // Remove stale layers for roads that no longer exist
    roadLayersRef.current.forEach((layers, id) => {
      if (!roads.find((r) => r.id === id)) {
        map.removeLayer(layers.line);
        if (layers.decorator)
          try {
            map.removeLayer(layers.decorator);
          } catch {
            /* ignore */
          }
        roadLayersRef.current.delete(id);
      }
    });

    roads.forEach((road) => {
      const isSelected = selectedRoadsRef.current.has(road.id);
      const color = isSelected ? routeColor : "#64748b";
      const weight = isSelected ? 5 : 2.5;
      const opacity = isSelected ? 0.9 : 0.4;

      const existing = roadLayersRef.current.get(road.id);

      if (existing) {
        existing.line.setStyle({ color, weight, opacity });
        // Remove old decorator
        if (existing.decorator) {
          try {
            map.removeLayer(existing.decorator);
          } catch {
            /* ignore */
          }
          existing.decorator = undefined;
        }
      } else {
        const line = L.polyline(road.positions, {
          color,
          weight,
          opacity,
          interactive: true,
        });

        line.addTo(map);

        // Tooltip
        line.bindTooltip(
          `<strong>${road.name}</strong><br/>${road.isBidirectional ? "↔ Two-way" : "→ One-way"}<br/>${road.roadType.replace("_", " ")}`,
          { sticky: true, className: "leaflet-tooltip" },
        );

        line.on("click", () => {
          const cur = new Set(selectedRoadsRef.current);

          if (cur.has(road.id)) {
            cur.delete(road.id);
          } else {
            cur.add(road.id);
          }
          selectedRoadsRef.current = cur;
          onRoadsChange(Array.from(cur));
        });

        roadLayersRef.current.set(road.id, { line });
      }

      // Directional arrow for one-way selected roads
      if (
        isSelected &&
        !road.isBidirectional &&
        (window as any).L?.polylineDecorator
      ) {
        const entry = roadLayersRef.current.get(road.id);

        if (entry && !entry.decorator) {
          try {
            const dec = (L as any)
              .polylineDecorator(road.positions, {
                patterns: [
                  {
                    offset: "50%",
                    repeat: 0,
                    symbol: (L as any).Symbol.arrowHead({
                      pixelSize: 12,
                      polygon: false,
                      pathOptions: {
                        stroke: true,
                        color: routeColor,
                        weight: 2,
                        opacity: 0.9,
                      },
                    }),
                  },
                ],
              })
              .addTo(map);

            entry.decorator = dec;
          } catch {
            /* polylineDecorator may not be loaded */
          }
        }
      }
    });
  }, [roads, selectedRoadIds, routeColor, onRoadsChange, mapReady]);

  // ── Draw / redraw stops ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) return;

    selectedStopsRef.current = new Set(selectedStopIds);

    // Determine which stops are "on the route" (their road neighbors include selected roads)
    // For simplicity: show all transit stops; highlight those in selectedStopIds
    intersections.forEach((stop) => {
      const isOnRoute = selectedStopsRef.current.has(stop.id);
      const baseColor = STOP_COLORS[stop.point_type] ?? "#64748b";

      const existing = stopLayersRef.current.get(stop.id);

      if (existing) {
        existing.setStyle({
          fillColor: isOnRoute ? baseColor : "#334155",
          color: isOnRoute ? "#fff" : "#64748b",
          fillOpacity: isOnRoute ? 1 : 0.5,
          radius: isOnRoute ? 9 : 6,
        });
      } else {
        const marker = L.circleMarker([stop.latitude, stop.longitude], {
          radius: 6,
          fillColor: "#334155",
          color: "#64748b",
          weight: 2,
          fillOpacity: 0.5,
        }).addTo(map);

        marker.bindTooltip(
          `<strong>${stop.name}</strong><br/>${stop.point_type.replace("_", " ")}`,
          { sticky: true },
        );

        if (pickupMode === "stops_only") {
          marker.on("click", () => {
            const cur = new Set(selectedStopsRef.current);

            if (cur.has(stop.id)) {
              cur.delete(stop.id);
            } else {
              cur.add(stop.id);
            }
            selectedStopsRef.current = cur;
            onStopsChange(Array.from(cur));
          });
        }

        stopLayersRef.current.set(stop.id, marker);
      }
    });
  }, [intersections, selectedStopIds, pickupMode, onStopsChange, mapReady]);

  // ── Legend ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Legend overlay */}
      <div
        className="absolute bottom-6 left-4 z-[1000] rounded-xl p-3 text-xs space-y-1.5"
        style={{
          background: "rgba(2,6,23,0.88)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#e2e8f0",
        }}
      >
        <p className="font-semibold mb-2">Legend</p>
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 rounded" style={{ background: routeColor }} />
          <span>Selected road</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 rounded" style={{ background: "#64748b" }} />
          <span>Unselected road</span>
        </div>
        {pickupMode === "stops_only" && (
          <>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: "#3b82f6" }}
              />
              <span>Bus Stop (click to add)</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: "#8b5cf6" }}
              />
              <span>Bus Terminal</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: "#0891b2" }}
              />
              <span>Pier / Port</span>
            </div>
          </>
        )}
        <p className="text-xs pt-1" style={{ color: "#94a3b8" }}>
          {selectedRoadIds.length} road{selectedRoadIds.length !== 1 ? "s" : ""}{" "}
          selected
          {pickupMode === "stops_only" &&
            ` · ${selectedStopIds.length} stop${selectedStopIds.length !== 1 ? "s" : ""}`}
        </p>
      </div>
    </div>
  );
}
