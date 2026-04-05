import type { NextPage } from "next";
import type { ComponentType } from "react";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Skeleton } from "@heroui/skeleton";
import { Spinner } from "@heroui/spinner";

import KioskLayout from "@/components/KioskLayout";
import QRHandoffModal from "@/components/QRHandoffModal";
import { API_BASE_URL, API_ENDPOINTS } from "@/lib/constants";
import { toast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapDestination {
  category_name?: string;
  cluster_name?: string;
  entrance_fee_local?: number;
  id: string;
  images?: string[];
  latitude: number;
  longitude: number;
  municipality?: string;
  name: string;
  rating?: number;
}

interface QRTarget {
  deepLink: string;
  subtitle?: string;
  title: string;
}

interface MapViewProps {
  destinations: MapDestination[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Dynamically import the map so it only runs client-side (Leaflet needs window)
const MapView = dynamic(
  () =>
    import("@/components/MapView") as Promise<{
      default: ComponentType<MapViewProps>;
    }>,
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Spinner color="primary" size="lg" />
      </div>
    ),
    ssr: false,
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDeepLink(id: string, name?: string): string {
  const params = new URLSearchParams({
    id,
    source: "kiosk",
    type: "destination",
  });

  if (name) params.set("name", name);

  return `airatna://start?${params.toString()}`;
}

function clusterColor(name?: string): string {
  if (!name) return "#64748b";
  const n = name.toLowerCase();

  if (n.includes("metro")) return "#f43f5e";
  if (n.includes("south")) return "#10b981";
  if (n.includes("north")) return "#3b82f6";
  if (n.includes("island")) return "#f59e0b";
  if (n.includes("west")) return "#8b5cf6";

  return "#64748b";
}

// ─── Component ────────────────────────────────────────────────────────────────

const MapPage: NextPage = () => {
  const router = useRouter();
  const [destinations, setDestinations] = useState<MapDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [qrTarget, setQrTarget] = useState<QRTarget | null>(null);

  const fetchDestinations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ active: "true", limit: "500" });
      const res = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.DESTINATIONS}?${params.toString()}`,
      );
      const json = (await res.json()) as {
        data: MapDestination[];
        success: boolean;
      };

      if (json.success && json.data) {
        // Only include destinations with coordinates
        setDestinations(json.data.filter((d) => d.latitude && d.longitude));
      }
    } catch {
      toast.error("Failed to load map destinations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDestinations();
  }, [fetchDestinations]);

  const selectedDest = destinations.find((d) => d.id === selectedId) ?? null;

  const filtered = search.trim()
    ? destinations.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.municipality?.toLowerCase().includes(search.toLowerCase()) ||
          d.category_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : destinations;

  const openQR = (dest: MapDestination) =>
    setQrTarget({
      deepLink: buildDeepLink(dest.id, dest.name),
      subtitle: dest.municipality ?? dest.category_name,
      title: dest.name,
    });

  return (
    <KioskLayout title="Destination Map — AIRAT-NA Kiosk">
      <div className="map-page">
        {/* ── Left: Leaflet map ───────────────────────────────────────── */}
        <div className="map-panel">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner color="primary" size="lg" />
            </div>
          ) : (
            <MapView
              destinations={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}

          {/* Floating back button */}
          <div className="map-back-btn">
            <Button
              size="lg"
              variant="flat"
              onPress={() => void router.push("/")}
            >
              ← Home
            </Button>
          </div>

          {/* Floating destination count */}
          <div className="map-count-badge">
            <span>{filtered.length} destinations</span>
          </div>
        </div>

        {/* ── Right: Destination list panel ──────────────────────────── */}
        <div className="map-sidebar">
          {/* Search */}
          <div className="map-sidebar-search">
            <Input
              classNames={{ input: "text-base", inputWrapper: "h-12" }}
              placeholder="Search destinations…"
              size="md"
              startContent={
                <span style={{ color: "var(--text-faint)" }}>🔍</span>
              }
              value={search}
              onValueChange={(v) => {
                setSearch(v);
                setSelectedId(null);
              }}
            />
          </div>

          {/* Selected destination detail */}
          {selectedDest && (
            <div className="map-selected-card">
              <div className="map-selected-img">
                {selectedDest.images?.[0] ? (
                  <img
                    alt={selectedDest.name}
                    className="w-full h-full object-cover"
                    src={selectedDest.images[0]}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl bg-transparent">
                    🗺️
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2">
                <p className="map-selected-name">{selectedDest.name}</p>
                <p className="map-selected-location">
                  📍{" "}
                  {selectedDest.municipality ??
                    selectedDest.category_name ??
                    "Cebu"}
                </p>
                {selectedDest.cluster_name && (
                  <Chip
                    size="sm"
                    style={{
                      background:
                        clusterColor(selectedDest.cluster_name) + "20",
                      borderColor:
                        clusterColor(selectedDest.cluster_name) + "50",
                      color: clusterColor(selectedDest.cluster_name),
                    }}
                    variant="flat"
                  >
                    {selectedDest.cluster_name}
                  </Chip>
                )}
                {!!selectedDest.entrance_fee_local &&
                  selectedDest.entrance_fee_local > 0 && (
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-faint)" }}
                    >
                      ₱{selectedDest.entrance_fee_local} entrance fee
                    </p>
                  )}
                <Button
                  className="w-full h-12 text-base mt-2"
                  color="primary"
                  onPress={() => openQR(selectedDest)}
                >
                  Scan QR to Start Journey →
                </Button>
              </div>
            </div>
          )}

          {/* List */}
          <div className="map-list">
            {loading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-2xl h-16" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <span className="text-4xl mb-3">🔍</span>
                <p
                  className="text-base font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  No destinations match
                </p>
                <button
                  className="mt-3 text-sm"
                  style={{ color: "var(--red-500)" }}
                  type="button"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="map-list-items">
                {filtered.map((dest) => (
                  <button
                    key={dest.id}
                    className="map-list-item"
                    data-selected={dest.id === selectedId}
                    type="button"
                    onClick={() => setSelectedId(dest.id)}
                  >
                    <div className="map-list-thumb">
                      {dest.images?.[0] ? (
                        <img
                          alt=""
                          className="w-full h-full object-cover"
                          src={dest.images[0]}
                        />
                      ) : (
                        <span>🗺️</span>
                      )}
                    </div>
                    <div className="map-list-info">
                      <p className="map-list-name">{dest.name}</p>
                      <p className="map-list-location">
                        {dest.municipality ?? dest.category_name ?? "Cebu"}
                      </p>
                    </div>
                    {dest.id === selectedId && (
                      <div className="map-list-selected-dot" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <QRHandoffModal
        deepLink={qrTarget?.deepLink ?? ""}
        isOpen={qrTarget !== null}
        subtitle={qrTarget?.subtitle}
        title={qrTarget?.title ?? ""}
        onClose={() => setQrTarget(null)}
      />
    </KioskLayout>
  );
};

export default MapPage;
