import type { NextPage } from "next";

import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Skeleton } from "@heroui/skeleton";

import KioskLayout from "@/components/KioskLayout";
import KioskAuthModal, {
  type KioskAuthUser,
} from "@/components/KioskAuthModal";
import QRHandoffModal from "@/components/QRHandoffModal";
import { API_BASE_URL, API_ENDPOINTS, OPEN_PAGE_URL } from "@/lib/constants";
import { toast } from "@/lib/toast";

// Leaflet requires window — dynamic import with no SSR
const ItineraryMap = dynamic(() => import("@/components/ItineraryMap"), {
  ssr: false,
  loading: () => <div className="plan-map-skeleton" />,
});

const PickerMap = dynamic(() => import("@/components/PickerMap"), {
  ssr: false,
  loading: () => (
    <div className="picker-map-loading">
      <div className="picker-map-spinner" />
    </div>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface Destination {
  budget_level?: string;
  category_name?: string;
  entrance_fee_local?: number;
  id: string;
  images?: string[];
  latitude: number;
  longitude: number;
  municipality?: string;
  name: string;
  rating?: number;
}

interface Category {
  id: string;
  name: string;
  icon_url?: string;
}

interface GeneratedResult {
  deep_link: string;
  days: number;

  itinerary: Record<string, any>;
  title: string;
  token: string;
  total_stops: number;
  transport_mode: string;
}

// "pick" = manual destination selection, "ai" = interest-based wizard
type PlanMode = "pick" | "ai";
// Steps for Pick mode
type PickStep = "select" | "transport" | "result";
// Steps for AI mode
type AiStep =
  | "interests"
  | "group"
  | "transport"
  | "regions"
  | "duration"
  | "result";

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSPORT_MODES = [
  {
    desc: "Flexible, comfortable",
    emoji: "🚗",
    label: "Private Car",
    value: "private_car",
  },
  {
    desc: "Budget-friendly",
    emoji: "🚌",
    label: "Bus / Commute",
    value: "bus",
  },
  {
    desc: "Convenient, metered",
    emoji: "🚕",
    label: "Taxi / Grab",
    value: "taxi",
  },
  {
    desc: "For island trips",
    emoji: "⛴️",
    label: "Ferry + Land",
    value: "ferry",
  },
];

const INTERESTS = [
  { emoji: "🏖️", label: "Beaches", value: "beach" },
  { emoji: "⛰️", label: "Mountains", value: "nature" },
  { emoji: "🏛️", label: "Heritage", value: "heritage" },
  { emoji: "🍜", label: "Food", value: "food" },
  { emoji: "🏄", label: "Adventure", value: "adventure" },
  { emoji: "🛍️", label: "Shopping", value: "shopping" },
  { emoji: "⛪", label: "Culture", value: "culture" },
  { emoji: "🙏", label: "Religion", value: "religion" },
  { emoji: "🐋", label: "Wildlife", value: "wildlife" },
  { emoji: "💧", label: "Waterfalls", value: "waterfall" },
  { emoji: "🌅", label: "Scenic Views", value: "scenic" },
  { emoji: "🎭", label: "Entertainment", value: "entertainment" },
];

const GROUP_TYPES = [
  { emoji: "🧍", label: "Solo", value: "solo" },
  { emoji: "💑", label: "Couple", value: "couple" },
  { emoji: "👨‍👩‍👧", label: "Family", value: "family" },
  { emoji: "👫", label: "Friends", value: "friends" },
  { emoji: "🏢", label: "Group", value: "group" },
];

const CEBU_CENTER = { lat: 10.3157, lon: 123.8854 };

// ─── Main Component ───────────────────────────────────────────────────────────

const KioskPlanPage: NextPage = () => {
  const router = useRouter();
  const [planMode, setPlanMode] = useState<PlanMode | null>(null);

  // ── Pick-mode state ────────────────────────────────────────────────
  const [pickStep, setPickStep] = useState<PickStep>("select");
  const [allDestinations, setAllDestinations] = useState<Destination[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loadingDests, setLoadingDests] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ── AI-mode state ──────────────────────────────────────────────────
  const [aiStep, setAiStep] = useState<AiStep>("interests");
  const [interests, setInterests] = useState<string[]>([]);
  const [groupType, setGroupType] = useState<string>("couple");
  const [clusters, setClusters] = useState<
    Array<{
      description?: string;
      destination_count?: number;
      id: string;
      name: string;
    }>
  >([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [days, setDays] = useState<number>(1);
  const [hoursPerDay, setHoursPerDay] = useState<number>(8);
  const [loadingClusters, setLoadingClusters] = useState(false);

  // ── Shared state ──────────────────────────────────────────────────
  const [transportMode, setTransportMode] = useState<string>("private_car");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  // ── Auth state — kiosk registers/logs in before QR is shown ───────
  const [kioskUser, setKioskUser] = useState<KioskAuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Auto-enter pick mode when coming from map page with ?dest=ID
  useEffect(() => {
    const destId = router.query.dest as string | undefined;
    if (destId && planMode === null) {
      setSelectedIds([destId]);
      setPlanMode("pick");
    }
  }, [router.query.dest, planMode]);

  // Fetch all destinations + categories for pick mode
  useEffect(() => {
    if (planMode !== "pick") return;
    const load = async () => {
      setLoadingDests(true);
      try {
        const [destRes, catRes] = await Promise.all([
          fetch(`${API_BASE_URL}${API_ENDPOINTS.DESTINATIONS}?limit=200`),
          fetch(`${API_BASE_URL}${API_ENDPOINTS.CATEGORIES}`),
        ]);
        const destJson = (await destRes.json()) as {
          data: Destination[];
          success: boolean;
        };
        const catJson = (await catRes.json()) as {
          data: Category[];
          success: boolean;
        };

        if (destJson.success && destJson.data)
          setAllDestinations(destJson.data);
        if (catJson.success && catJson.data) setAllCategories(catJson.data);
      } catch {
        toast.error("Failed to load destinations");
      } finally {
        setLoadingDests(false);
      }
    };

    void load();
  }, [planMode]);

  // Fetch clusters for AI mode
  useEffect(() => {
    if (planMode !== "ai") return;
    const load = async () => {
      setLoadingClusters(true);
      try {
        const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.CLUSTERS}`);
        const json = (await res.json()) as {
          data: typeof clusters;
          success: boolean;
        };

        if (json.success && json.data) setClusters(json.data);
      } catch {
        toast.error("Failed to load regions");
      } finally {
        setLoadingClusters(false);
      }
    };

    void load();
  }, [planMode]);

  // ── Filtered destinations ─────────────────────────────────────────
  const filtered = allDestinations.filter((d) => {
    const matchesSearch =
      searchQuery === "" ||
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.municipality ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      filterCategory === "all" || d.category_name === filterCategory;

    return matchesSearch && matchesCat;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ── Generate ──────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    setGenerating(true);
    const isPick = planMode === "pick";

    if (isPick) setPickStep("result");
    else setAiStep("result");

    try {
      const body: Record<string, unknown> = {
        start_lat: CEBU_CENTER.lat,
        start_lon: CEBU_CENTER.lon,
        transport_mode: transportMode,
        days,
        hours_per_day: hoursPerDay,
      };

      if (isPick) {
        body.pinned_destination_ids = selectedIds;
        body.max_stops = selectedIds.length;
      } else {
        body.interests = interests;
        body.group_type = groupType;
        body.cluster_ids = selectedClusters;
        body.max_stops = days > 1 ? 4 : 5;
      }

      const res = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.KIOSK_GENERATE}`,
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const json = (await res.json()) as {
        data: GeneratedResult;
        message?: string;
        success: boolean;
      };

      if (!json.success) throw new Error(json.message ?? "Generation failed");
      setResult(json.data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to generate itinerary";

      toast.error(message);
      if (isPick) setPickStep("transport");
      else setAiStep("transport");
    } finally {
      setGenerating(false);
    }
  }, [
    planMode,
    transportMode,
    days,
    hoursPerDay,
    selectedIds,
    interests,
    groupType,
    selectedClusters,
  ]);

  const resetAll = () => {
    setPlanMode(null);
    setPickStep("select");
    setAiStep("interests");
    setSelectedIds([]);
    setInterests([]);
    setSelectedClusters([]);
    setDays(1);
    setHoursPerDay(8);
    setTransportMode("private_car");
    setResult(null);
    setKioskUser(null);
  };

  /**
   * Called when "Start Journey — Scan QR" is pressed.
   * Opens the auth modal if the user hasn't registered/logged in yet.
   * After auth, auto-claims the session so the itinerary is saved to their account.
   */
  const handleStartJourney = () => {
    if (!result) return;
    if (!kioskUser) {
      setAuthModalOpen(true);
    } else {
      setQrOpen(true);
    }
  };

  /**
   * Called after KioskAuthModal succeeds.
   * Claims the kiosk session (saves itinerary to the user's account), then shows QR.
   */
  const handleAuthSuccess = async (user: KioskAuthUser) => {
    setKioskUser(user);
    setAuthModalOpen(false);

    if (!result) return;

    setClaiming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/kiosk/claim/${result.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { success: boolean; message?: string };

      if (!json.success) {
        // Already claimed by this user is fine — still show QR
        if (!json.message?.includes("already been claimed")) {
          toast.error(json.message ?? "Could not save itinerary");
        }
      } else {
        toast.success(`Saved to ${user.name}'s account!`);
      }
    } catch {
      // Non-fatal — QR still works even if claim fails
      toast.error("Could not save to account — QR still works");
    } finally {
      setClaiming(false);
      setQrOpen(true);
    }
  };

  const clusterMeta = (name: string): { color: string; icon: string } => {
    const n = name.toLowerCase();

    if (n.includes("metro")) return { color: "#f43f5e", icon: "🏙️" };
    if (n.includes("south")) return { color: "#10b981", icon: "🌿" };
    if (n.includes("north")) return { color: "#3b82f6", icon: "⛰️" };
    if (n.includes("island")) return { color: "#f59e0b", icon: "🏝️" };
    if (n.includes("west")) return { color: "#8b5cf6", icon: "🌊" };

    return { color: "#64748b", icon: "📍" };
  };

  // ── Step subtitle text ────────────────────────────────────────────
  const subtitle = () => {
    if (!planMode) return "How would you like to plan your trip?";
    if (planMode === "pick") {
      if (pickStep === "select")
        return "Tap destinations to add them to your trip";
      if (pickStep === "transport") return "How will you get around?";

      return generating
        ? "Building your itinerary…"
        : "Your itinerary is ready!";
    }
    if (aiStep === "interests")
      return "What kind of experiences are you looking for?";
    if (aiStep === "group") return "Who are you travelling with?";
    if (aiStep === "transport") return "How will you get around?";
    if (aiStep === "regions")
      return "Which parts of Cebu do you want to explore?";
    if (aiStep === "duration") return "How long is your trip?";

    return generating
      ? "Crafting your perfect itinerary…"
      : "Your itinerary is ready!";
  };

  const showProgress =
    planMode !== null &&
    !(planMode === "pick" && pickStep === "result") &&
    !(planMode === "ai" && aiStep === "result");

  const progressPct = () => {
    if (!planMode) return 0;
    if (planMode === "pick") {
      const steps: PickStep[] = ["select", "transport", "result"];

      return (steps.indexOf(pickStep) / (steps.length - 1)) * 100;
    }
    const steps: AiStep[] = [
      "interests",
      "group",
      "transport",
      "regions",
      "duration",
      "result",
    ];

    return (steps.indexOf(aiStep) / (steps.length - 1)) * 100;
  };

  // ── Shared back handler ───────────────────────────────────────────
  const handleBack = () => {
    if (planMode === "pick") {
      if (pickStep === "select") {
        setPlanMode(null);

        return;
      }
      if (pickStep === "transport") {
        setPickStep("select");

        return;
      }
      if (pickStep === "result") {
        setPickStep("transport");
        setResult(null);

        return;
      }
    } else {
      const steps: AiStep[] = [
        "interests",
        "group",
        "transport",
        "regions",
        "duration",
        "result",
      ];
      const idx = steps.indexOf(aiStep);

      if (idx === 0) {
        setPlanMode(null);

        return;
      }
      setAiStep(steps[idx - 1]);
      if (aiStep === "result") setResult(null);
    }
  };

  // ── Full-screen picker ────────────────────────────────────────────
  if (planMode === "pick" && pickStep === "select") {
    return (
      <KioskLayout title="Plan My Trip — AIRAT-NA">
        <div className="picker-fullscreen">
          {/* Map fills everything */}
          {loadingDests ? (
            <div className="picker-fs-loading">
              <div className="picker-fs-spinner" />
              <p>Loading destinations…</p>
            </div>
          ) : (
            <PickerMap
              destinations={filtered}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
            />
          )}

          {/* ── Top-left title pill ── */}
          <div className="picker-fs-title-pill">
            <span className="picker-fs-title-icon">🗺️</span>
            <div>
              <p className="picker-fs-title-text">Pick Destinations</p>
              <p className="picker-fs-title-sub">
                Tap pins on the map to select
              </p>
            </div>
          </div>

          {/* ── Top-right search + filter + list ── */}
          <div className="picker-fs-search-panel">
            <div className="picker-search-wrap">
              <span className="picker-search-icon">🔍</span>
              <input
                className="picker-search"
                placeholder="Search destinations…"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="picker-search-clear"
                  type="button"
                  onClick={() => setSearchQuery("")}
                >
                  ×
                </button>
              )}
            </div>
            <div className="picker-cat-scroll">
              <button
                className={`picker-cat-chip ${filterCategory === "all" ? "picker-cat-active" : ""}`}
                type="button"
                onClick={() => setFilterCategory("all")}
              >
                All
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat.id}
                  className={`picker-cat-chip ${filterCategory === cat.name ? "picker-cat-active" : ""}`}
                  type="button"
                  onClick={() => setFilterCategory(cat.name)}
                >
                  {cat.icon_url && (
                    <img
                      alt=""
                      className="picker-cat-icon"
                      src={cat.icon_url}
                    />
                  )}
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Destination list */}
            <div className="picker-dest-list">
              {filtered.length === 0 ? (
                <p className="picker-dest-empty">No destinations found</p>
              ) : (
                filtered.map((dest) => {
                  const selIdx = selectedIds.indexOf(dest.id);
                  const isSel = selIdx !== -1;

                  return (
                    <button
                      key={dest.id}
                      className={`picker-dest-item ${isSel ? "picker-dest-item-sel" : ""}`}
                      type="button"
                      onClick={() => toggleSelect(dest.id)}
                    >
                      <div className="picker-dest-thumb">
                        {dest.images?.[0] ? (
                          <img
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }}
                            src={dest.images[0]}
                          />
                        ) : (
                          <span style={{ fontSize: 16 }}>🗺️</span>
                        )}
                        {isSel && (
                          <div className="picker-dest-thumb-badge">{selIdx + 1}</div>
                        )}
                      </div>
                      <div className="picker-dest-info">
                        <span className="picker-dest-name">{dest.name}</span>
                        {(dest.municipality ?? dest.category_name) && (
                          <span className="picker-dest-meta">
                            {dest.municipality ?? dest.category_name}
                          </span>
                        )}
                      </div>
                      {isSel && <span className="picker-dest-check">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Destination count badge ── */}
          <div className="picker-fs-count">
            <span>{filtered.length} destinations</span>
          </div>

          {/* ── Bottom bar: selected chips + nav buttons ── */}
          <div className="picker-fs-bottom">
            <button
              className="picker-fs-back"
              type="button"
              onClick={handleBack}
            >
              ← Back
            </button>

            <div className="picker-fs-chips-area">
              {selectedIds.length === 0 ? (
                <p className="picker-fs-hint">
                  Tap pins to add destinations to your trip
                </p>
              ) : (
                <>
                  <span className="picker-fs-sel-count">
                    {selectedIds.length} selected
                  </span>
                  <div className="picker-fs-sel-chips">
                    {selectedIds.map((id, idx) => {
                      const dest = allDestinations.find((d) => d.id === id);

                      return dest ? (
                        <button
                          key={id}
                          className="picker-sel-chip"
                          type="button"
                          onClick={() => toggleSelect(id)}
                        >
                          <span className="picker-sel-num">{idx + 1}</span>
                          {dest.name}
                          <span className="picker-sel-remove">×</span>
                        </button>
                      ) : null;
                    })}
                  </div>
                </>
              )}
            </div>

            <button
              className={`picker-fs-next ${selectedIds.length === 0 ? "picker-fs-next-disabled" : ""}`}
              disabled={selectedIds.length === 0}
              type="button"
              onClick={() => setPickStep("transport")}
            >
              Next →{" "}
              <span className="picker-fs-next-count">
                ({selectedIds.length})
              </span>
            </button>
          </div>
        </div>
      </KioskLayout>
    );
  }

  // ── Normal wizard layout ──────────────────────────────────────────
  return (
    <KioskLayout title="Plan My Trip — AIRAT-NA">
      <div className="plan-page">
        {/* ─── Header ──────────────────────────────────────────────── */}
        <div className="plan-header">
          <h1 className="plan-title">Plan My Trip</h1>
          <p className="plan-sub">{subtitle()}</p>
          {showProgress && (
            <div className="plan-progress-wrap">
              <div
                className="plan-progress-bar"
                style={{ width: `${progressPct()}%` }}
              />
            </div>
          )}
        </div>

        {/* ─── Mode selector ───────────────────────────────────────── */}
        {planMode === null && (
          <div className="plan-mode-selector">
            <button
              className="plan-mode-card plan-mode-pick"
              type="button"
              onClick={() => setPlanMode("pick")}
            >
              <span className="plan-mode-emoji">🗺️</span>
              <p className="plan-mode-title">Pick Destinations</p>
              <p className="plan-mode-desc">
                Browse and choose the exact places you want to visit
              </p>
              <span className="plan-mode-badge">Recommended</span>
            </button>
            <button
              className="plan-mode-card plan-mode-ai"
              type="button"
              onClick={() => setPlanMode("ai")}
            >
              <span className="plan-mode-emoji">✨</span>
              <p className="plan-mode-title">AI Suggest</p>
              <p className="plan-mode-desc">
                Tell us your interests and let AI build the perfect itinerary
              </p>
            </button>
          </div>
        )}

        {/* ── Transport step (shared) ── */}
        {((planMode === "pick" && pickStep === "transport") ||
          (planMode === "ai" && aiStep === "transport")) && (
          <div className="plan-step">
            <div className="plan-transport-grid">
              {TRANSPORT_MODES.map((t) => (
                <button
                  key={t.value}
                  className={`plan-transport-card ${transportMode === t.value ? "plan-transport-active" : ""}`}
                  type="button"
                  onClick={() => setTransportMode(t.value)}
                >
                  <span className="plan-transport-emoji">{t.emoji}</span>
                  <p className="plan-transport-label">{t.label}</p>
                  <p className="plan-transport-desc">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── AI: Interests ── */}
        {planMode === "ai" && aiStep === "interests" && (
          <div className="plan-step">
            <div className="plan-chip-grid">
              {INTERESTS.map((item) => (
                <button
                  key={item.value}
                  className={`plan-interest-chip ${interests.includes(item.value) ? "plan-chip-active" : ""}`}
                  type="button"
                  onClick={() =>
                    setInterests((prev) =>
                      prev.includes(item.value)
                        ? prev.filter((i) => i !== item.value)
                        : [...prev, item.value],
                    )
                  }
                >
                  <span className="plan-chip-emoji">{item.emoji}</span>
                  <span className="plan-chip-label">{item.label}</span>
                  {interests.includes(item.value) && (
                    <span className="plan-chip-check">✓</span>
                  )}
                </button>
              ))}
            </div>
            <p className="plan-hint">
              {interests.length === 0
                ? "Tap any interest to select (or skip for a mix of everything)"
                : `${interests.length} selected`}
            </p>
          </div>
        )}

        {/* ── AI: Group ── */}
        {planMode === "ai" && aiStep === "group" && (
          <div className="plan-step">
            <div className="plan-group-grid">
              {GROUP_TYPES.map((g) => (
                <button
                  key={g.value}
                  className={`plan-group-card ${groupType === g.value ? "plan-group-active" : ""}`}
                  type="button"
                  onClick={() => setGroupType(g.value)}
                >
                  <span className="plan-group-emoji">{g.emoji}</span>
                  <span className="plan-group-label">{g.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── AI: Regions ── */}
        {planMode === "ai" && aiStep === "regions" && (
          <div className="plan-step">
            {loadingClusters ? (
              <div className="plan-cluster-grid">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-3xl h-36" />
                ))}
              </div>
            ) : clusters.length === 0 ? (
              <div className="plan-cluster-empty">
                <p>⚠️ Could not load regions.</p>
                <button
                  className="plan-cluster-retry"
                  type="button"
                  onClick={() => {
                    setLoadingClusters(true);
                    fetch(`${API_BASE_URL}${API_ENDPOINTS.CLUSTERS}`)
                      .then((r) => r.json())
                      .then(
                        (json: { data: typeof clusters; success: boolean }) => {
                          if (json.success && json.data) setClusters(json.data);
                        },
                      )
                      .catch(() => toast.error("Failed to load regions"))
                      .finally(() => setLoadingClusters(false));
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="plan-cluster-grid">
                {clusters.map((cluster) => {
                  const { color, icon } = clusterMeta(cluster.name);
                  const active = selectedClusters.includes(cluster.id);
                  const count = Number(cluster.destination_count ?? 0);
                  const isEmpty = count === 0;

                  return (
                    <button
                      key={cluster.id}
                      className={`plan-cluster-card ${active ? "plan-cluster-active" : ""} ${isEmpty ? "plan-cluster-empty-card" : ""}`}
                      style={{
                        background: active ? color + "30" : color + "10",
                        borderColor: active ? color : color + "40",
                        boxShadow: active ? `0 0 0 2px ${color}` : "none",
                        opacity: isEmpty ? 0.45 : 1,
                      }}
                      type="button"
                      onClick={() => {
                        if (isEmpty) return;
                        setSelectedClusters((prev) =>
                          prev.includes(cluster.id)
                            ? prev.filter((c) => c !== cluster.id)
                            : [...prev, cluster.id],
                        );
                      }}
                    >
                      <span className="text-3xl">{icon}</span>
                      <p className="plan-cluster-name" style={{ color }}>
                        {cluster.name}
                      </p>
                      <p
                        className="plan-cluster-count"
                        style={{
                          color: isEmpty
                            ? "rgba(255,255,255,0.3)"
                            : color + "cc",
                        }}
                      >
                        {isEmpty
                          ? "No destinations"
                          : `${count} place${count !== 1 ? "s" : ""}`}
                      </p>
                      {active && <span className="plan-cluster-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="plan-hint">
              {selectedClusters.length === 0
                ? "Select regions to focus on, or skip to explore all of Cebu"
                : `${selectedClusters.length} region${selectedClusters.length > 1 ? "s" : ""} selected`}
            </p>
          </div>
        )}

        {/* ── AI: Duration ── */}
        {planMode === "ai" && aiStep === "duration" && (
          <div className="plan-step plan-duration-step">
            <div className="plan-duration-row">
              <p className="plan-duration-label">Number of days</p>
              <div className="plan-day-picker">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    className={`plan-day-btn ${days === d ? "plan-day-active" : ""}`}
                    type="button"
                    onClick={() => setDays(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="plan-duration-row">
              <p className="plan-duration-label">
                Hours per day — <strong>{hoursPerDay}h</strong>
              </p>
              <input
                className="plan-slider"
                max={14}
                min={3}
                step={1}
                type="range"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
              />
              <div className="plan-slider-labels">
                <span>3h</span>
                <span>14h</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Result step ── */}
        {((planMode === "pick" && pickStep === "result") ||
          (planMode === "ai" && aiStep === "result")) && (
          <div className="plan-step plan-result-step">
            {generating ? (
              <div className="plan-generating">
                <div className="plan-gen-spinner" />
                <p className="plan-gen-title">Building your itinerary…</p>
                <p className="plan-gen-sub">
                  Finding the best route between your stops
                </p>
                <div className="plan-gen-dots">
                  {[
                    "Fetching destinations",
                    "Planning your route",
                    "Calculating travel times",
                  ].map((label, i) => (
                    <div key={i} className="plan-gen-dot-row">
                      <div
                        className="plan-gen-dot"
                        style={{ animationDelay: `${i * 0.4}s` }}
                      />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : result ? (
              <div className="plan-result-content">
                <div className="plan-result-map-wrap">
                  <ItineraryMap
                    days={result.days}
                    height={380}
                    itinerary={result.itinerary}
                  />
                </div>
                <div className="plan-result-header">
                  <h2 className="plan-result-title">{result.title}</h2>
                  <div className="plan-result-stats">
                    <Chip color="primary" size="md" variant="flat">
                      {
                        TRANSPORT_MODES.find(
                          (t) => t.value === result.transport_mode,
                        )?.emoji
                      }{" "}
                      {TRANSPORT_MODES.find(
                        (t) => t.value === result.transport_mode,
                      )?.label ?? result.transport_mode}
                    </Chip>
                    <Chip color="success" size="md" variant="flat">
                      📅 {result.days} Day{result.days > 1 ? "s" : ""}
                    </Chip>
                    <Chip color="warning" size="md" variant="flat">
                      📍 {result.total_stops} Stop
                      {result.total_stops !== 1 ? "s" : ""}
                    </Chip>
                  </div>
                </div>
                <div className="plan-result-cta">
                  <Button
                    className="plan-start-btn"
                    color="primary"
                    isLoading={claiming}
                    size="lg"
                    onPress={handleStartJourney}
                  >
                    🚀 Start Journey — Scan QR
                  </Button>
                  <Button
                    className="mt-3"
                    size="md"
                    variant="flat"
                    onPress={resetAll}
                  >
                    Plan Another Trip
                  </Button>
                </div>
                <p className="plan-result-note">
                  {kioskUser
                    ? `Saved to ${kioskUser.name}'s account — scan QR to open in the app`
                    : "Register first so your itinerary is waiting in the app after install"}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* ─── Navigation ── */}
        {planMode !== null && !generating && (
          <div className="plan-nav">
            <Button
              className="plan-nav-back"
              size="lg"
              variant="flat"
              onPress={handleBack}
            >
              ← Back
            </Button>

            {planMode === "pick" && pickStep === "transport" && (
              <Button
                className="plan-nav-generate"
                color="primary"
                size="lg"
                onPress={() => void generate()}
              >
                ✨ Generate Itinerary
              </Button>
            )}

            {planMode === "ai" &&
              aiStep !== "result" &&
              (() => {
                const steps: AiStep[] = [
                  "interests",
                  "group",
                  "transport",
                  "regions",
                  "duration",
                  "result",
                ];
                const idx = steps.indexOf(aiStep);
                const isLast = aiStep === "duration";

                return (
                  <Button
                    className={isLast ? "plan-nav-generate" : "plan-nav-next"}
                    color="primary"
                    size="lg"
                    onPress={() => {
                      if (isLast) {
                        void generate();

                        return;
                      }
                      setAiStep(steps[idx + 1]);
                    }}
                  >
                    {isLast
                      ? "✨ Generate Itinerary"
                      : aiStep === "interests" && interests.length === 0
                        ? "Skip →"
                        : "Next →"}
                  </Button>
                );
              })()}
          </div>
        )}
      </div>

      {result && (
        <QRHandoffModal
          deepLink={`${OPEN_PAGE_URL}?token=${result.token}`}
          isOpen={qrOpen}
          subtitle={
            kioskUser
              ? `${result.days} day${result.days > 1 ? "s" : ""} · ${result.total_stops} stops · Saved to ${kioskUser.name}'s account`
              : `${result.days} day${result.days > 1 ? "s" : ""} · ${result.total_stops} stops`
          }
          title={result.title}
          onClose={() => setQrOpen(false)}
        />
      )}

      <KioskAuthModal
        isOpen={authModalOpen}
        onAuth={(user) => void handleAuthSuccess(user)}
        onClose={() => setAuthModalOpen(false)}
        onSkip={() => {
          setAuthModalOpen(false);
          setQrOpen(true);
        }}
      />
    </KioskLayout>
  );
};

export default KioskPlanPage;
