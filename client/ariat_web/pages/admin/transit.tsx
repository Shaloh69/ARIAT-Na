import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Chip } from "@heroui/chip";

import { API_ENDPOINTS } from "@/lib/constants";
import { apiClient } from "@/lib/api";
import AdminLayout from "@/layouts/admin";
import { modalClassNames } from "@/lib/modal-styles";
import { toast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  point_type: "bus_stop" | "bus_terminal" | "pier";
  address?: string;
}

interface FareConfig {
  id: string;
  transport_type: string;
  display_name: string;
}

interface TransitRoute {
  id: string;
  fare_config_id: string;
  fare_config_name: string;
  route_name: string;
  transport_type: string;
  road_ids: string[];
  stop_ids: string[];
  pickup_mode: "anywhere" | "stops_only";
  color: string;
  description?: string;
  is_active: boolean;
}

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

// ─── Map (dynamic — no SSR) ──────────────────────────────────────────────────

const MapManager = dynamic(() => import("@/components/MapManager"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-full text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      Loading map…
    </div>
  ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STOP_COLORS: Record<string, string> = {
  bus_stop: "#3b82f6",
  bus_terminal: "#8b5cf6",
  pier: "#0891b2",
};

const STOP_LABELS: Record<string, string> = {
  bus_stop: "Bus Stop",
  bus_terminal: "Bus Terminal",
  pier: "Pier / Port",
};

const TRANSPORT_LABELS: Record<string, string> = {
  jeepney: "Jeepney",
  bus: "Bus",
  bus_ac: "Bus (AC)",
  ferry: "Ferry",
  tricycle: "Tricycle",
  habal_habal: "Habal-Habal",
};

const emptyRoute: Omit<TransitRoute, "id" | "fare_config_name"> = {
  fare_config_id: "",
  route_name: "",
  transport_type: "",
  road_ids: [],
  stop_ids: [],
  pickup_mode: "stops_only",
  color: "#3b82f6",
  description: "",
  is_active: true,
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransitPage() {
  const [tab, setTab] = useState<"stops" | "routes">("stops");

  // Stops state
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopModal, setStopModal] = useState(false);
  const [editingStop, setEditingStop] = useState<TransitStop | null>(null);
  const [stopForm, setStopForm] = useState({
    name: "",
    latitude: "",
    longitude: "",
    point_type: "bus_stop" as TransitStop["point_type"],
    address: "",
  });

  // Routes state
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [fareConfigs, setFareConfigs] = useState<FareConfig[]>([]);
  const [routeModal, setRouteModal] = useState(false);
  const [routeEditorOpen, setRouteEditorOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<TransitRoute | null>(null);
  const [routeForm, setRouteForm] = useState<typeof emptyRoute>({
    ...emptyRoute,
  });

  // Road data for picker
  const [allRoads, setAllRoads] = useState<Road[]>([]);
  // Raw GeoJSON for MapManager
  const [roadsGeojson, setRoadsGeojson] = useState<any>(null);
  const [intersectionsGeojson, setIntersectionsGeojson] = useState<any>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchStops = useCallback(async () => {
    setStopsLoading(true);
    try {
      const res = await apiClient.get<TransitStop[]>(
        API_ENDPOINTS.TRANSIT_STOPS,
      );

      if (res.success && res.data) setStops(res.data);
    } catch {
      toast.error("Failed to load transit stops");
    } finally {
      setStopsLoading(false);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    setRoutesLoading(true);
    try {
      const res = await apiClient.get<TransitRoute[]>(
        API_ENDPOINTS.TRANSIT_ROUTES,
      );

      if (res.success && res.data) {
        setRoutes(
          res.data.map((r: any) => ({
            ...r,
            road_ids:
              typeof r.road_ids === "string"
                ? JSON.parse(r.road_ids)
                : (r.road_ids ?? []),
            stop_ids:
              typeof r.stop_ids === "string"
                ? JSON.parse(r.stop_ids)
                : (r.stop_ids ?? []),
          })),
        );
      }
    } catch {
      toast.error("Failed to load transit routes");
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  const fetchFareConfigs = useCallback(async () => {
    try {
      const res = await apiClient.get<FareConfig[]>(API_ENDPOINTS.FARE_CONFIGS);

      if (res.success && res.data) setFareConfigs(res.data);
    } catch {
      /* non-fatal */
    }
  }, []);

  const fetchMapData = useCallback(async () => {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

    try {
      // Roads GeoJSON returns raw FeatureCollection (no { success, data } wrapper)
      // Use fetch() directly, same as the Map Manager page
      const [geojson, intRes] = await Promise.all([
        fetch(`${baseUrl}${API_ENDPOINTS.ROADS_GEOJSON}`).then((r) => r.json()),
        apiClient.get<Intersection[]>(API_ENDPOINTS.INTERSECTIONS),
      ]);

      if (geojson?.features) {
        setRoadsGeojson(geojson);
        setAllRoads(
          geojson.features.map((f: any) => ({
            id: String(f.properties.id),
            name: f.properties.name,
            // GeoJSON stores [lng, lat]; Leaflet needs [lat, lng]
            positions: f.geometry.coordinates.map(
              ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
            ),
            roadType: f.properties.road_type ?? "local_road",
            isBidirectional: f.properties.is_bidirectional !== false,
          })),
        );
      }

      if (intRes.success && intRes.data) {
        const ints = intRes.data as Intersection[];

        // Build GeoJSON FeatureCollection for MapManager
        setIntersectionsGeojson({
          type: "FeatureCollection",
          features: ints.map((i) => ({
            type: "Feature",
            properties: { id: i.id, name: i.name, point_type: i.point_type },
            geometry: { type: "Point", coordinates: [i.longitude, i.latitude] },
          })),
        });
      }
    } catch {
      // fetchMapData error — silently ignore, map data will be empty
    }
  }, []);

  useEffect(() => {
    fetchStops();
    fetchRoutes();
    fetchFareConfigs();
    fetchMapData();
  }, [fetchStops, fetchRoutes, fetchFareConfigs, fetchMapData]);

  // ── Stop CRUD ───────────────────────────────────────────────────────────────

  const openAddStop = () => {
    setEditingStop(null);
    setStopForm({
      name: "",
      latitude: "",
      longitude: "",
      point_type: "bus_stop",
      address: "",
    });
    setStopModal(true);
  };

  const openEditStop = (s: TransitStop) => {
    setEditingStop(s);
    setStopForm({
      name: s.name,
      latitude: String(s.latitude),
      longitude: String(s.longitude),
      point_type: s.point_type,
      address: s.address ?? "",
    });
    setStopModal(true);
  };

  const handleSaveStop = async () => {
    const { name, latitude, longitude, point_type, address } = stopForm;

    if (!name || !latitude || !longitude) {
      toast.error("Name, latitude and longitude are required");

      return;
    }
    try {
      const payload = {
        name,
        latitude: Number(latitude),
        longitude: Number(longitude),
        point_type,
        address: address || undefined,
      };

      if (editingStop) {
        await apiClient.put(
          `${API_ENDPOINTS.TRANSIT_STOPS}/${editingStop.id}`,
          payload,
        );
        toast.success("Stop updated");
      } else {
        await apiClient.post(API_ENDPOINTS.TRANSIT_STOPS, payload);
        toast.success("Stop created");
      }
      setStopModal(false);
      fetchStops();
      fetchMapData();
    } catch (e: any) {
      toast.error(
        e.response?.data?.message ?? e.message ?? "Failed to save stop",
      );
    }
  };

  const handleDeleteStop = async (id: string, name: string) => {
    if (!confirm(`Delete stop "${name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`${API_ENDPOINTS.TRANSIT_STOPS}/${id}`);
      toast.success("Stop deleted");
      fetchStops();
      fetchMapData();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Failed to delete stop");
    }
  };

  // ── Route CRUD ──────────────────────────────────────────────────────────────

  const openAddRoute = () => {
    setEditingRoute(null);
    setRouteForm({ ...emptyRoute });
    // Open map overlay directly — save happens via "Save Route" in the overlay header
    setRouteEditorOpen(true);
  };

  const openEditRoute = (r: TransitRoute) => {
    setEditingRoute(r);
    setRouteForm({
      fare_config_id: r.fare_config_id,
      route_name: r.route_name,
      transport_type: r.transport_type,
      road_ids: r.road_ids,
      stop_ids: r.stop_ids,
      pickup_mode: r.pickup_mode,
      color: r.color,
      description: r.description ?? "",
      is_active: r.is_active,
    });
    // Open map overlay directly
    setRouteEditorOpen(true);
  };

  const handleSaveRoute = async () => {
    if (!routeForm.route_name.trim()) {
      toast.error("Route name is required");
      setRouteEditorOpen(true); // re-open so user can fill name
      return;
    }
    if (!routeForm.fare_config_id || !routeForm.transport_type) {
      toast.error("Fare config is required");
      setRouteEditorOpen(true); // re-open so user can select fare config
      return;
    }
    try {
      if (editingRoute) {
        await apiClient.put(
          `${API_ENDPOINTS.TRANSIT_ROUTES}/${editingRoute.id}`,
          routeForm,
        );
        toast.success("Route updated");
      } else {
        await apiClient.post(API_ENDPOINTS.TRANSIT_ROUTES, routeForm);
        toast.success("Route created");
      }
      setRouteModal(false);
      setEditingRoute(null);
      fetchRoutes();
    } catch (e: any) {
      toast.error(
        e.response?.data?.message ?? e.message ?? "Failed to save route",
      );
    }
  };

  const handleDeleteRoute = async (id: string, name: string) => {
    if (!confirm(`Delete route "${name}"?`)) return;
    try {
      await apiClient.delete(`${API_ENDPOINTS.TRANSIT_ROUTES}/${id}`);
      toast.success("Route deleted");
      fetchRoutes();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Failed to delete route");
    }
  };

  // ── Grouped routes by transport type ───────────────────────────────────────
  const grouped = routes.reduce<Record<string, TransitRoute[]>>((acc, r) => {
    const k = r.transport_type;

    if (!acc[k]) acc[k] = [];
    acc[k].push(r);

    return acc;
  }, {});

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--text-strong)" }}
            >
              Transit Management
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Manage bus stops, terminals, piers and define fixed transit routes
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-2 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {(["stops", "routes"] as const).map((t) => (
            <button
              key={t}
              className="px-5 py-2.5 text-sm font-medium transition-colors rounded-t-lg"
              style={{
                color: tab === t ? "var(--red-500)" : "var(--text-muted)",
                borderBottom:
                  tab === t
                    ? "2px solid var(--red-500)"
                    : "2px solid transparent",
                background: "transparent",
              }}
              onClick={() => setTab(t)}
            >
              {t === "stops" ? "Stops & Terminals" : "Transit Routes"}
            </button>
          ))}
        </div>

        {/* ── STOPS TAB ─────────────────────────────────────────────────────── */}
        {tab === "stops" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {stops.length} stop{stops.length !== 1 ? "s" : ""} registered
              </p>
              <Button color="primary" size="sm" onClick={openAddStop}>
                + Add Stop
              </Button>
            </div>

            {stopsLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Loading…
              </p>
            ) : stops.length === 0 ? (
              <div
                className="text-center py-12"
                style={{ color: "var(--text-faint)" }}
              >
                <p className="text-lg mb-1">No transit stops yet</p>
                <p className="text-sm">
                  Add bus stops, terminals, and piers to enable transit routing
                </p>
              </div>
            ) : (
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: "var(--border)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {[
                        "Type",
                        "Name",
                        "Coordinates",
                        "Address",
                        "Actions",
                      ].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((s) => (
                      <tr
                        key={s.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                            style={{ background: STOP_COLORS[s.point_type] }}
                          >
                            {STOP_LABELS[s.point_type]}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 font-medium"
                          style={{ color: "var(--text-strong)" }}
                        >
                          {s.name}
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {Number(s.latitude).toFixed(5)},{" "}
                          {Number(s.longitude).toFixed(5)}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {s.address ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              onClick={() => openEditStop(s)}
                            >
                              Edit
                            </Button>
                            <Button
                              color="danger"
                              size="sm"
                              variant="flat"
                              onClick={() => handleDeleteStop(s.id, s.name)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ROUTES TAB ────────────────────────────────────────────────────── */}
        {tab === "routes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {routes.length} route{routes.length !== 1 ? "s" : ""} defined
              </p>
              <Button color="primary" size="sm" onClick={openAddRoute}>
                + Add Route
              </Button>
            </div>

            {routesLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Loading…
              </p>
            ) : routes.length === 0 ? (
              <div
                className="text-center py-12"
                style={{ color: "var(--text-faint)" }}
              >
                <p className="text-lg mb-1">No transit routes yet</p>
                <p className="text-sm">
                  Define jeepney corridors, bus lines, and ferry routes
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([type, typeRoutes]) => (
                  <div key={type}>
                    <h3
                      className="text-sm font-semibold mb-2 uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {TRANSPORT_LABELS[type] ?? type}
                    </h3>
                    <div className="space-y-2">
                      {typeRoutes.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between px-4 py-3 rounded-xl border"
                          style={{
                            borderColor: "var(--border)",
                            borderLeft: `4px solid ${r.color}`,
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="min-w-0">
                              <p
                                className="font-medium truncate"
                                style={{ color: "var(--text-strong)" }}
                              >
                                {r.route_name}
                              </p>
                              <p
                                className="text-xs mt-0.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {r.fare_config_name} &middot;&nbsp;
                                <span
                                  style={{
                                    color:
                                      r.pickup_mode === "anywhere"
                                        ? "#10b981"
                                        : "#f59e0b",
                                  }}
                                >
                                  {r.pickup_mode === "anywhere"
                                    ? "Flag anywhere"
                                    : "Stops only"}
                                </span>
                                &nbsp;&middot; {r.road_ids.length} roads
                                &middot; {r.stop_ids.length} stops
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <Chip
                              color={r.is_active ? "success" : "default"}
                              size="sm"
                              variant="flat"
                            >
                              {r.is_active ? "Active" : "Inactive"}
                            </Chip>
                            <Button
                              size="sm"
                              variant="flat"
                              onClick={() => openEditRoute(r)}
                            >
                              Edit
                            </Button>
                            <Button
                              color="danger"
                              size="sm"
                              variant="flat"
                              onClick={() =>
                                handleDeleteRoute(r.id, r.route_name)
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Stop Modal ──────────────────────────────────────────────────────── */}
      <Modal
        classNames={modalClassNames}
        isOpen={stopModal}
        size="md"
        onClose={() => setStopModal(false)}
      >
        <ModalContent>
          <ModalHeader>
            {editingStop ? "Edit Stop" : "Add Transit Stop"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Select
                label="Type"
                selectedKeys={[stopForm.point_type]}
                onSelectionChange={(keys) =>
                  setStopForm((p) => ({
                    ...p,
                    point_type: Array.from(
                      keys,
                    )[0] as TransitStop["point_type"],
                  }))
                }
              >
                <SelectItem key="bus_stop">Bus Stop</SelectItem>
                <SelectItem key="bus_terminal">Bus Terminal</SelectItem>
                <SelectItem key="pier">Pier / Port</SelectItem>
              </Select>
              <Input
                label="Name"
                placeholder="e.g. South Bus Terminal"
                value={stopForm.name}
                onValueChange={(v) => setStopForm((p) => ({ ...p, name: v }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Latitude"
                  placeholder="10.3157"
                  value={stopForm.latitude}
                  onValueChange={(v) =>
                    setStopForm((p) => ({ ...p, latitude: v }))
                  }
                />
                <Input
                  label="Longitude"
                  placeholder="123.8854"
                  value={stopForm.longitude}
                  onValueChange={(v) =>
                    setStopForm((p) => ({ ...p, longitude: v }))
                  }
                />
              </div>
              <Input
                label="Address (optional)"
                placeholder="e.g. N. Bacalso Ave, Cebu City"
                value={stopForm.address}
                onValueChange={(v) =>
                  setStopForm((p) => ({ ...p, address: v }))
                }
              />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Tip: You can also place stops directly on the map using Map →
                Point mode.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onClick={() => setStopModal(false)}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleSaveStop}>
              {editingStop ? "Update" : "Create"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Route Modal ─────────────────────────────────────────────────────── */}
      <Modal
        classNames={modalClassNames}
        isOpen={routeModal}
        size="2xl"
        onClose={() => setRouteModal(false)}
      >
        <ModalContent>
          <ModalHeader>
            {editingRoute ? "Edit Transit Route" : "Add Transit Route"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Fare Config"
                  selectedKeys={
                    routeForm.fare_config_id ? [routeForm.fare_config_id] : []
                  }
                  onSelectionChange={(keys) => {
                    const id = String(Array.from(keys)[0] ?? "");
                    const fc = fareConfigs.find((f) => f.id === id);

                    setRouteForm((p) => ({
                      ...p,
                      fare_config_id: id,
                      transport_type: fc?.transport_type ?? p.transport_type,
                    }));
                  }}
                >
                  {fareConfigs.map((fc) => (
                    <SelectItem key={fc.id}>{fc.display_name}</SelectItem>
                  ))}
                </Select>
                <Input
                  label="Route Name"
                  placeholder="e.g. Route 04 – Carbon to Mandaue"
                  value={routeForm.route_name}
                  onValueChange={(v) =>
                    setRouteForm((p) => ({ ...p, route_name: v }))
                  }
                />
              </div>

              {/* Pickup mode */}
              <div>
                <p
                  className="text-xs font-medium mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Pickup Mode
                </p>
                <div className="flex gap-3">
                  {(["stops_only", "anywhere"] as const).map((m) => (
                    <button
                      key={m}
                      className="flex-1 px-3 py-2 rounded-xl border text-sm text-left transition-colors"
                      style={{
                        borderColor:
                          routeForm.pickup_mode === m
                            ? "var(--red-500)"
                            : "var(--border)",
                        background:
                          routeForm.pickup_mode === m
                            ? "rgba(244,63,94,0.1)"
                            : "transparent",
                        color: "var(--text)",
                      }}
                      onClick={() =>
                        setRouteForm((p) => ({ ...p, pickup_mode: m }))
                      }
                    >
                      <span
                        className="font-medium block"
                        style={{
                          color:
                            routeForm.pickup_mode === m
                              ? "var(--red-400)"
                              : "var(--text-strong)",
                        }}
                      >
                        {m === "stops_only"
                          ? "Stops / Terminals only"
                          : "Anywhere on route"}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {m === "stops_only"
                          ? "Bus, Jeepney — board at marked stops"
                          : "Tricycle, Habal-habal — flag from roadside"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Route color */}
              <div className="flex items-center gap-3">
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Route Color
                  </p>
                  <input
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                    type="color"
                    value={routeForm.color}
                    onChange={(e) =>
                      setRouteForm((p) => ({ ...p, color: e.target.value }))
                    }
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label="Description (optional)"
                    placeholder="e.g. Runs from 5am to 10pm"
                    value={routeForm.description ?? ""}
                    onValueChange={(v) =>
                      setRouteForm((p) => ({ ...p, description: v }))
                    }
                  />
                </div>
              </div>

              {/* Road/stop picker */}
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-strong)" }}
                    >
                      Route Roads & Stops
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {routeForm.road_ids.length} road
                      {routeForm.road_ids.length !== 1 ? "s" : ""} selected
                      &nbsp;&middot;&nbsp;
                      {routeForm.stop_ids.length} stop
                      {routeForm.stop_ids.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button
                    color="primary"
                    size="sm"
                    variant="flat"
                    onClick={() => setRouteEditorOpen(true)}
                  >
                    {routeForm.road_ids.length > 0
                      ? "Edit on Map"
                      : "Pick on Map"}
                  </Button>
                </div>
                {routeForm.road_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {routeForm.road_ids.slice(0, 6).map((id) => {
                      const road = allRoads.find((r) => r.id === id);

                      return (
                        <span
                          key={id}
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{
                            background: "rgba(255,255,255,0.08)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {road?.name ?? id.slice(0, 8)}
                        </span>
                      );
                    })}
                    {routeForm.road_ids.length > 6 && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          color: "var(--text-muted)",
                        }}
                      >
                        +{routeForm.road_ids.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text)" }}>
                  Active (used for routing)
                </span>
                <Switch
                  isSelected={routeForm.is_active}
                  onValueChange={(v) =>
                    setRouteForm((p) => ({ ...p, is_active: v }))
                  }
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onClick={() => setRouteModal(false)}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleSaveRoute}>
              {editingRoute ? "Update" : "Create"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Map Road Picker (full-screen overlay) ───────────────────────────── */}
      {routeEditorOpen && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col"
          style={{ background: "rgba(2,6,23,0.97)" }}
        >
          {/* Header with inline form fields */}
          <div
            className="flex items-center gap-4 px-6 py-3 border-b flex-wrap"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Route name */}
            <Input
              classNames={{ inputWrapper: "h-9 min-h-9 bg-white/8 border-white/20" }}
              placeholder="Route name *"
              size="sm"
              style={{ width: 180 }}
              value={routeForm.route_name}
              onValueChange={(v) => setRouteForm((p) => ({ ...p, route_name: v }))}
            />

            {/* Fare config */}
            <Select
              classNames={{ trigger: "h-9 min-h-9 bg-white/8 border-white/20" }}
              placeholder="Fare config *"
              selectedKeys={routeForm.fare_config_id ? [routeForm.fare_config_id] : []}
              size="sm"
              style={{ width: 180 }}
              onSelectionChange={(keys) => {
                const id = String(Array.from(keys)[0] ?? "");
                const fc = fareConfigs.find((f) => f.id === id);

                setRouteForm((p) => ({
                  ...p,
                  fare_config_id: id,
                  transport_type: fc?.transport_type ?? p.transport_type,
                }));
              }}
            >
              {fareConfigs.map((fc) => (
                <SelectItem key={fc.id}>{fc.display_name}</SelectItem>
              ))}
            </Select>

            {/* Color picker */}
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>Color</label>
              <input
                style={{ width: 32, height: 32, borderRadius: 6, border: "none", cursor: "pointer", padding: 2 }}
                type="color"
                value={routeForm.color}
                onChange={(e) => setRouteForm((p) => ({ ...p, color: e.target.value }))}
              />
            </div>

            {/* Road/stop count badge */}
            <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
              {routeForm.road_ids.length} road{routeForm.road_ids.length !== 1 ? "s" : ""}
              {" · "}
              {routeForm.stop_ids.length} stop{routeForm.stop_ids.length !== 1 ? "s" : ""}
            </span>

            {/* Hint */}
            <span className="text-xs hidden lg:block ml-auto" style={{ color: "var(--text-faint)" }}>
              Click roads to select · Ctrl+Z to undo
            </span>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="flat"
                onClick={() => {
                  setRouteEditorOpen(false);
                  setEditingRoute(null);
                }}
              >
                Cancel
              </Button>
              <Button
                color="primary"
                size="sm"
                onClick={async () => {
                  setRouteEditorOpen(false);
                  await handleSaveRoute();
                }}
              >
                {editingRoute ? "Update Route" : "Save Route"}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <MapManager
              geojsonData={intersectionsGeojson}
              initialMode="transit_route"
              roadsGeojsonData={roadsGeojson}
              transitPickupMode={routeForm.pickup_mode}
              transitRouteColor={routeForm.color}
              transitSelectedRoadIds={routeForm.road_ids}
              transitSelectedStopIds={routeForm.stop_ids}
              onTransitRoadsChange={(ids) =>
                setRouteForm((p) => ({ ...p, road_ids: ids }))
              }
              onTransitStopsChange={(ids) =>
                setRouteForm((p) => ({ ...p, stop_ids: ids }))
              }
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
