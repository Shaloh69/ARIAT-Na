import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Skeleton } from "@heroui/skeleton";

import KioskLayout from "@/components/KioskLayout";
import QRHandoffModal from "@/components/QRHandoffModal";
import { API_BASE_URL, API_ENDPOINTS } from "@/lib/constants";
import { toast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cluster {
  id: string;
  name: string;
  description?: string;
}

interface Destination {
  id: string;
  name: string;
  category_name?: string;
  municipality?: string;
  images?: string[];
  entrance_fee_local?: number;
  budget_level?: string;
}

interface Guide {
  id: string;
  title: string;
  description?: string;
  cover_image?: string;
  difficulty?: string;
  duration_days?: number;
}

interface QRTarget {
  deepLink: string;
  subtitle?: string;
  title: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDeepLink(
  type: "cluster" | "destination" | "guide",
  id: string,
  name?: string,
): string {
  const params = new URLSearchParams({ id, source: "kiosk", type });

  if (name) params.set("name", name);

  return `airatna://start?${params.toString()}`;
}

function clusterColor(name: string): string {
  const n = name.toLowerCase();

  if (n.includes("metro")) return "#f43f5e";
  if (n.includes("south")) return "#10b981";
  if (n.includes("north")) return "#3b82f6";
  if (n.includes("island")) return "#f59e0b";
  if (n.includes("west")) return "#8b5cf6";

  return "#64748b";
}

function clusterIcon(name: string): string {
  const n = name.toLowerCase();

  if (n.includes("metro")) return "🏙️";
  if (n.includes("south")) return "🌿";
  if (n.includes("north")) return "⛰️";
  if (n.includes("island")) return "🏝️";
  if (n.includes("west")) return "🌊";

  return "📍";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KioskHome() {
  const router = useRouter();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [featuredDests, setFeaturedDests] = useState<Destination[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingDests, setLoadingDests] = useState(true);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [qrTarget, setQrTarget] = useState<QRTarget | null>(null);

  const fetchData = useCallback(async () => {
    const base = API_BASE_URL;

    setLoadingClusters(true);
    try {
      const res = await fetch(`${base}${API_ENDPOINTS.CLUSTERS}`);
      const json = (await res.json()) as { success: boolean; data: Cluster[] };

      if (json.success && json.data) setClusters(json.data);
    } catch {
      toast.error("Failed to load regions");
    } finally {
      setLoadingClusters(false);
    }

    setLoadingDests(true);
    try {
      const res = await fetch(`${base}${API_ENDPOINTS.DESTINATIONS_FEATURED}`);
      const json = (await res.json()) as {
        success: boolean;
        data: Destination[];
      };

      if (json.success && json.data) setFeaturedDests(json.data.slice(0, 8));
    } catch {
      toast.error("Failed to load destinations");
    } finally {
      setLoadingDests(false);
    }

    setLoadingGuides(true);
    try {
      const res = await fetch(`${base}${API_ENDPOINTS.GUIDES}`);
      const json = (await res.json()) as { success: boolean; data: Guide[] };

      if (json.success && json.data) setGuides(json.data.slice(0, 6));
    } catch {
      toast.error("Failed to load guides");
    } finally {
      setLoadingGuides(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openClusterQR = (cluster: Cluster) => {
    setQrTarget({
      deepLink: buildDeepLink("cluster", cluster.id, cluster.name),
      subtitle: cluster.description,
      title: `Explore ${cluster.name}`,
    });
  };

  const openDestQR = (dest: Destination) => {
    setQrTarget({
      deepLink: buildDeepLink("destination", dest.id, dest.name),
      subtitle: dest.municipality ?? dest.category_name,
      title: dest.name,
    });
  };

  const openGuideQR = (guide: Guide) => {
    setQrTarget({
      deepLink: buildDeepLink("guide", guide.id, guide.title),
      subtitle: guide.description,
      title: guide.title,
    });
  };

  return (
    <KioskLayout title="AIRAT-NA — Explore Cebu">
      <div className="px-8 pb-12 space-y-10 max-w-7xl mx-auto">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className="pt-10 text-center">
          <h1
            className="text-5xl font-black mb-3 tracking-tight"
            style={{ color: "var(--text-strong)" }}
          >
            Explore Cebu Like Never Before
          </h1>
          <p
            className="text-xl max-w-2xl mx-auto mb-6"
            style={{ color: "var(--text-muted)" }}
          >
            Discover destinations, plan multi-day trips, and navigate with ease.
            No account needed — just tap and scan to start.
          </p>
          <Button
            color="primary"
            size="lg"
            onPress={() => void router.push("/explore")}
          >
            Browse All Destinations
          </Button>
        </div>

        <Divider style={{ borderColor: "var(--border)" }} />

        {/* ── Regions ───────────────────────────────────────────────────── */}
        <section>
          <h2
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--text-strong)" }}
          >
            Choose a Region
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Tap a region to start navigating there on the AIRAT-NA app
          </p>

          {loadingClusters ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="rounded-2xl" style={{ height: 120 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              {clusters.map((cluster) => {
                const color = clusterColor(cluster.name);
                const icon = clusterIcon(cluster.name);

                return (
                  <Card
                    key={cluster.id}
                    isPressable
                    className="rounded-2xl border transition-transform active:scale-95"
                    style={{
                      background: color + "12",
                      borderColor: color + "40",
                    }}
                    onPress={() => openClusterQR(cluster)}
                  >
                    <CardBody className="flex flex-col items-center justify-center gap-2 min-h-[120px] px-3 py-6 text-center">
                      <span className="text-3xl">{icon}</span>
                      <span
                        className="text-sm font-semibold leading-tight"
                        style={{ color }}
                      >
                        {cluster.name}
                      </span>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Featured Destinations ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="text-2xl font-bold mb-1"
                style={{ color: "var(--text-strong)" }}
              >
                Featured Destinations
              </h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Popular spots across the Cebu Region
              </p>
            </div>
            <Button
              size="sm"
              variant="flat"
              onPress={() => void router.push("/explore")}
            >
              See All
            </Button>
          </div>

          {loadingDests ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="rounded-2xl" style={{ height: 220 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {featuredDests.map((dest) => (
                <Card
                  key={dest.id}
                  isPressable
                  className="rounded-2xl overflow-hidden border transition-transform active:scale-95"
                  style={{ borderColor: "var(--border)" }}
                  onPress={() => openDestQR(dest)}
                >
                  <div className="relative" style={{ height: 140 }}>
                    {dest.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={dest.name}
                        className="w-full h-full object-cover"
                        src={dest.images[0]}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-4xl"
                        style={{ background: "var(--bg-1)" }}
                      >
                        🗺️
                      </div>
                    )}
                    {dest.budget_level && (
                      <div className="absolute top-2 right-2">
                        <Chip color="default" size="sm" variant="flat">
                          {dest.budget_level === "budget"
                            ? "₱"
                            : dest.budget_level === "mid_range"
                              ? "₱₱"
                              : "₱₱₱"}
                        </Chip>
                      </div>
                    )}
                  </div>
                  <CardBody className="gap-1 px-3 py-3">
                    <p
                      className="text-sm font-semibold leading-tight truncate"
                      style={{ color: "var(--text-strong)" }}
                    >
                      {dest.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {dest.municipality ?? dest.category_name ?? "Cebu"}
                    </p>
                    {!!dest.entrance_fee_local && dest.entrance_fee_local > 0 && (
                      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                        ₱{dest.entrance_fee_local} entrance
                      </p>
                    )}
                    <Button
                      className="mt-2 w-full"
                      color="primary"
                      size="sm"
                      variant="flat"
                      onPress={() => openDestQR(dest)}
                    >
                      Start Journey
                    </Button>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ── Curated Guides ────────────────────────────────────────────── */}
        {(loadingGuides || guides.length > 0) && (
          <section>
            <h2
              className="text-2xl font-bold mb-1"
              style={{ color: "var(--text-strong)" }}
            >
              Curated Guides
            </h2>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              Expert-crafted itineraries for every type of traveler
            </p>

            {loadingGuides ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-2xl" style={{ height: 200 }} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {guides.map((guide) => (
                  <Card
                    key={guide.id}
                    isPressable
                    className="rounded-2xl overflow-hidden border transition-transform active:scale-95"
                    style={{ borderColor: "var(--border)" }}
                    onPress={() => openGuideQR(guide)}
                  >
                    <div className="relative" style={{ height: 120 }}>
                      {guide.cover_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={guide.title}
                          className="w-full h-full object-cover"
                          src={guide.cover_image}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-4xl"
                          style={{ background: "var(--bg-1)" }}
                        >
                          🧭
                        </div>
                      )}
                    </div>
                    <CardBody className="gap-1 px-3 py-3">
                      <p
                        className="text-sm font-semibold leading-tight line-clamp-2"
                        style={{ color: "var(--text-strong)" }}
                      >
                        {guide.title}
                      </p>
                      <div className="flex gap-2 flex-wrap mt-1">
                        {guide.duration_days && (
                          <Chip color="default" size="sm" variant="flat">
                            {guide.duration_days}d
                          </Chip>
                        )}
                        {guide.difficulty && (
                          <Chip color="default" size="sm" variant="flat">
                            {guide.difficulty}
                          </Chip>
                        )}
                      </div>
                      <Button
                        className="mt-2 w-full"
                        color="primary"
                        size="sm"
                        variant="flat"
                        onPress={() => openGuideQR(guide)}
                      >
                        Start Journey
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── QR Modal ──────────────────────────────────────────────────────── */}
      <QRHandoffModal
        deepLink={qrTarget?.deepLink ?? ""}
        isOpen={qrTarget !== null}
        subtitle={qrTarget?.subtitle}
        title={qrTarget?.title ?? ""}
        onClose={() => setQrTarget(null)}
      />
    </KioskLayout>
  );
}
