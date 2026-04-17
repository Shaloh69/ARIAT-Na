import type { NextPage } from "next";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Skeleton } from "@heroui/skeleton";

import KioskLayout from "@/components/KioskLayout";
import QRHandoffModal from "@/components/QRHandoffModal";
import { API_BASE_URL, API_ENDPOINTS } from "@/lib/constants";
import { toast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cluster {
  description?: string;
  id: string;
  name: string;
}

interface Destination {
  budget_level?: string;
  category_name?: string;
  entrance_fee_local?: number;
  id: string;
  images?: string[];
  municipality?: string;
  name: string;
}

interface Guide {
  cover_image?: string;
  description?: string;
  difficulty?: string;
  duration_days?: number;
  id: string;
  title: string;
}

interface QRTarget {
  deepLink: string;
  mode?: "default" | "download";
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

function clusterMeta(name: string): { color: string; icon: string } {
  const n = name.toLowerCase();

  if (n.includes("metro")) return { color: "#f43f5e", icon: "🏙️" };
  if (n.includes("south")) return { color: "#10b981", icon: "🌿" };
  if (n.includes("north")) return { color: "#3b82f6", icon: "⛰️" };
  if (n.includes("island")) return { color: "#f59e0b", icon: "🏝️" };
  if (n.includes("west")) return { color: "#8b5cf6", icon: "🌊" };

  return { color: "#64748b", icon: "📍" };
}

function budgetLabel(level?: string): string {
  if (level === "budget") return "₱";
  if (level === "mid_range") return "₱₱";
  if (level === "luxury") return "₱₱₱";

  return "";
}

// ─── Component ────────────────────────────────────────────────────────────────

const KioskHome: NextPage = () => {
  const router = useRouter();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [featuredDests, setFeaturedDests] = useState<Destination[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingDests, setLoadingDests] = useState(true);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [qrTarget, setQrTarget] = useState<QRTarget | null>(null);
  const [heroImageIdx, setHeroImageIdx] = useState(0);

  const fetchData = useCallback(async () => {
    const base = API_BASE_URL;

    setLoadingClusters(true);
    try {
      const res = await fetch(`${base}${API_ENDPOINTS.CLUSTERS}`);
      const json = (await res.json()) as { data: Cluster[]; success: boolean };

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
        data: Destination[];
        success: boolean;
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
      const json = (await res.json()) as { data: Guide[]; success: boolean };

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

  // Rotate hero background image every 5s
  const heroImages = featuredDests
    .flatMap((d) => d.images ?? [])
    .filter(Boolean)
    .slice(0, 6);

  useEffect(() => {
    if (heroImages.length < 2) return;
    const t = setInterval(
      () => setHeroImageIdx((i) => (i + 1) % heroImages.length),
      5000,
    );

    return () => clearInterval(t);
  }, [heroImages.length]);

  const openClusterQR = (cluster: Cluster) =>
    setQrTarget({
      deepLink: buildDeepLink("cluster", cluster.id, cluster.name),
      subtitle: cluster.description,
      title: `Explore ${cluster.name}`,
    });

  const openDestQR = (dest: Destination) =>
    setQrTarget({
      deepLink: buildDeepLink("destination", dest.id, dest.name),
      subtitle: dest.municipality ?? dest.category_name,
      title: dest.name,
    });

  const openGuideQR = (guide: Guide) =>
    setQrTarget({
      deepLink: buildDeepLink("guide", guide.id, guide.title),
      subtitle: guide.description,
      title: guide.title,
    });

  return (
    <KioskLayout title="AIRAT-NA — Explore Cebu">
      {/* ═══════════════════════════════════════════════════════════════
          HERO SECTION
      ═══════════════════════════════════════════════════════════════ */}
      <section className="home-hero" style={{ height: 220 }}>
        {/* Background image */}
        {heroImages[heroImageIdx] && (
          <img
            key={heroImageIdx}
            alt=""
            className="home-hero-bg"
            src={heroImages[heroImageIdx]}
          />
        )}
        <div className="home-hero-overlay" />

        <div className="home-hero-content">
          {/* Left — text & CTAs */}
          <div className="home-hero-left">
            <Chip className="mb-3" color="primary" size="sm" variant="flat">
              🇵🇭 Cebu, Philippines
            </Chip>
            <h1 className="home-hero-title">
              Discover
              <br />
              Cebu
            </h1>
            <p className="home-hero-sub">
              Explore beaches, mountains, heritage sites, and hidden gems across
              5 regions. Scan any card to continue on your phone.
            </p>
            <div className="home-hero-btns">
              <Button
                className="home-cta-plan"
                color="primary"
                size="lg"
                onPress={() => void router.push("/plan")}
              >
                ✨ Plan My Trip
              </Button>
              <Button
                className="home-cta-primary"
                size="lg"
                variant="bordered"
                onPress={() => void router.push("/explore")}
              >
                Browse Destinations
              </Button>
              <Button
                className="home-cta-secondary"
                size="lg"
                variant="flat"
                onPress={() => void router.push("/map")}
              >
                🗺️ View on Map
              </Button>
              <Button
                className="home-cta-secondary"
                size="lg"
                variant="flat"
                onPress={() =>
                  setQrTarget({
                    deepLink: "",
                    title: "Get the AIRAT-NA App",
                    subtitle: "Download free for Android",
                    mode: "download",
                  })
                }
              >
                📲 Download the App
              </Button>
            </div>
          </div>

          {/* Right — 3D stat cube rotator */}
          <div className="home-hero-right">
            <StatRotator />
          </div>
        </div>
      </section>

      <div className="home-body px-4 pb-6 space-y-5 max-w-[1400px] mx-auto">
        {/* ═══════════════════════════════════════════════════════════════
            REGIONS
        ═══════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader
            subtitle="Tap a region to scan its QR and explore on the AIRAT-NA app"
            title="Explore by Region"
          />
          {loadingClusters ? (
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="rounded-xl h-16" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {clusters.map((cluster) => {
                const { color, icon } = clusterMeta(cluster.name);

                return (
                  <Card
                    key={cluster.id}
                    isPressable
                    className="region-card rounded-xl transition-all active:scale-95"
                    style={{
                      background: color + "15",
                      borderColor: color + "45",
                    }}
                    onPress={() => openClusterQR(cluster)}
                  >
                    <CardBody className="flex flex-col items-center justify-center gap-1 h-16 text-center px-2">
                      <span className="text-xl">{icon}</span>
                      <div>
                        <p
                          className="text-sm font-bold leading-tight"
                          style={{ color }}
                        >
                          {cluster.name}
                        </p>
                        {cluster.description && (
                          <p
                            className="text-xs mt-0.5 line-clamp-1"
                            style={{ color: "var(--text-faint)" }}
                          >
                            {cluster.description}
                          </p>
                        )}
                      </div>
                      <div className="region-qr-hint" style={{ color }}>
                        Tap to scan QR
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            FEATURED DESTINATIONS
        ═══════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader
            action={{
              label: "See All →",
              onClick: () => void router.push("/explore"),
            }}
            subtitle="Top-rated spots across the Cebu Region"
            title="Featured Destinations"
          />
          {loadingDests ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="rounded-xl h-40" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {featuredDests.slice(0, 8).map((dest) => (
                <Card
                  key={dest.id}
                  isPressable
                  className="dest-card rounded-xl overflow-hidden transition-all active:scale-[0.97]"
                  style={{ borderColor: "var(--border)" }}
                  onPress={() => openDestQR(dest)}
                >
                  <div className="relative h-24">
                    {dest.images?.[0] ? (
                      <img
                        alt={dest.name}
                        className="w-full h-full object-cover"
                        src={dest.images[0]}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-5xl"
                        style={{ background: "var(--bg-1)" }}
                      >
                        🗺️
                      </div>
                    )}
                    <div className="dest-card-gradient" />
                    {budgetLabel(dest.budget_level) && (
                      <div className="absolute top-3 right-3">
                        <Chip color="default" size="sm" variant="flat">
                          {budgetLabel(dest.budget_level)}
                        </Chip>
                      </div>
                    )}
                  </div>
                  <CardBody className="gap-0.5 px-2 py-2">
                    <p className="dest-card-name">{dest.name}</p>
                    <p className="dest-card-location">
                      📍 {dest.municipality ?? dest.category_name ?? "Cebu"}
                    </p>
                    <Button
                      className="mt-1.5 w-full h-7 text-xs"
                      color="primary"
                      size="sm"
                      variant="flat"
                      onPress={() => openDestQR(dest)}
                    >
                      Scan QR →
                    </Button>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            CURATED GUIDES
        ═══════════════════════════════════════════════════════════════ */}
        {(loadingGuides || guides.length > 0) && (
          <section>
            <SectionHeader
              subtitle="Expert-crafted itineraries for every type of traveler"
              title="Curated Guides"
            />
            {loadingGuides ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-xl h-32" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {guides.map((guide) => (
                  <Card
                    key={guide.id}
                    isPressable
                    className="rounded-xl overflow-hidden transition-all active:scale-[0.97]"
                    style={{ borderColor: "var(--border)" }}
                    onPress={() => openGuideQR(guide)}
                  >
                    <div className="relative h-20">
                      {guide.cover_image ? (
                        <img
                          alt={guide.title}
                          className="w-full h-full object-cover"
                          src={guide.cover_image}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-5xl"
                          style={{ background: "var(--bg-1)" }}
                        >
                          🧭
                        </div>
                      )}
                      <div className="dest-card-gradient" />
                    </div>
                    <CardBody className="gap-1 px-2 py-2">
                      <p className="dest-card-name line-clamp-2">
                        {guide.title}
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {guide.duration_days && (
                          <Chip color="default" size="sm" variant="flat">
                            {guide.duration_days} day
                            {guide.duration_days > 1 ? "s" : ""}
                          </Chip>
                        )}
                        {guide.difficulty && (
                          <Chip color="default" size="sm" variant="flat">
                            {guide.difficulty}
                          </Chip>
                        )}
                      </div>
                      <Button
                        className="mt-1 w-full h-7 text-xs"
                        color="primary"
                        size="sm"
                        variant="flat"
                        onPress={() => openGuideQR(guide)}
                      >
                        Scan QR →
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
        mode={qrTarget?.mode ?? "default"}
        subtitle={qrTarget?.subtitle}
        title={qrTarget?.title ?? ""}
        onClose={() => setQrTarget(null)}
      />
    </KioskLayout>
  );
};

export default KioskHome;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  action,
  subtitle,
  title,
}: {
  action?: { label: string; onClick: () => void };
  subtitle?: string;
  title: string;
}) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-sub">{subtitle}</p>}
      </div>
      {action && (
        <button
          className="section-action"
          type="button"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

const STAT_ITEMS = [
  { icon: "🏖️", label: "Beaches", value: "30+" },
  { icon: "⛰️", label: "Mountains", value: "12+" },
  { icon: "🏛️", label: "Heritage", value: "20+" },
  { icon: "🏝️", label: "Islands", value: "167" },
  { icon: "🗺️", label: "Regions", value: "5" },
  { icon: "⭐", label: "Featured", value: "50+" },
];

function StatRotator() {
  const [idx, setIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % STAT_ITEMS.length);
      setAnimKey((k) => k + 1);
    }, 2400);

    return () => clearInterval(t);
  }, []);

  const stat = STAT_ITEMS[idx];

  return (
    <div className="stat-rotator-wrap">
      <div key={animKey} className="stat-rotator-face">
        <span className="stat-r-icon">{stat.icon}</span>
        <span className="stat-r-value">{stat.value}</span>
        <span className="stat-r-label">{stat.label}</span>
      </div>
      {/* Dot indicators */}
      <div className="stat-rotator-dots">
        {STAT_ITEMS.map((_, i) => (
          <span
            key={i}
            className="stat-rotator-dot"
            style={{ opacity: i === idx ? 1 : 0.25 }}
          />
        ))}
      </div>
    </div>
  );
}
