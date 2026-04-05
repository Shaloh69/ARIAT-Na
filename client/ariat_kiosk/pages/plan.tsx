import type { NextPage } from "next";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Skeleton } from "@heroui/skeleton";

import KioskLayout from "@/components/KioskLayout";
import QRHandoffModal from "@/components/QRHandoffModal";
import { API_BASE_URL, API_ENDPOINTS } from "@/lib/constants";
import { toast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Destination {
  budget_level?: string;
  category_name?: string;
  entrance_fee_local?: number;
  id: string;
  images?: string[];
  municipality?: string;
  name: string;
  rating?: number;
}

interface Category {
  id: string;
  name: string;
}

interface GeneratedResult {
  deep_link: string;
  days: number;
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
type AiStep = "interests" | "group" | "transport" | "regions" | "duration" | "result";

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSPORT_MODES = [
  { desc: "Flexible, comfortable", emoji: "🚗", label: "Private Car", value: "private_car" },
  { desc: "Budget-friendly", emoji: "🚌", label: "Bus / Commute", value: "bus" },
  { desc: "Convenient, metered", emoji: "🚕", label: "Taxi / Grab", value: "taxi" },
  { desc: "For island trips", emoji: "⛴️", label: "Ferry + Land", value: "ferry" },
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
  const [clusters, setClusters] = useState<Array<{ description?: string; id: string; name: string }>>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [days, setDays] = useState<number>(1);
  const [hoursPerDay, setHoursPerDay] = useState<number>(8);
  const [loadingClusters, setLoadingClusters] = useState(false);

  // ── Shared state ──────────────────────────────────────────────────
  const [transportMode, setTransportMode] = useState<string>("private_car");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

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
        const destJson = (await destRes.json()) as { data: Destination[]; success: boolean };
        const catJson = (await catRes.json()) as { data: Category[]; success: boolean };
        if (destJson.success && destJson.data) setAllDestinations(destJson.data);
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
        const json = (await res.json()) as { data: typeof clusters; success: boolean };
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

      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.KIOSK_GENERATE}`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
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
      if (pickStep === "select") return "Tap destinations to add them to your trip";
      if (pickStep === "transport") return "How will you get around?";
      return generating ? "Building your itinerary…" : "Your itinerary is ready!";
    }
    if (aiStep === "interests") return "What kind of experiences are you looking for?";
    if (aiStep === "group") return "Who are you travelling with?";
    if (aiStep === "transport") return "How will you get around?";
    if (aiStep === "regions") return "Which parts of Cebu do you want to explore?";
    if (aiStep === "duration") return "How long is your trip?";
    return generating ? "Crafting your perfect itinerary…" : "Your itinerary is ready!";
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
    const steps: AiStep[] = ["interests", "group", "transport", "regions", "duration", "result"];
    return (steps.indexOf(aiStep) / (steps.length - 1)) * 100;
  };

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

        {/* ══════════════════════════════════════════════════════════
            PICK MODE
        ══════════════════════════════════════════════════════════ */}

        {/* Step: Destination Selection */}
        {planMode === "pick" && pickStep === "select" && (
          <DestinationPicker
            allCategories={allCategories}
            allDestinations={filtered}
            filterCategory={filterCategory}
            loading={loadingDests}
            searchQuery={searchQuery}
            selectedIds={selectedIds}
            onFilterCategory={setFilterCategory}
            onSearch={setSearchQuery}
            onToggle={toggleSelect}
          />
        )}

        {/* Step: Transport (shared) */}
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

        {/* ══════════════════════════════════════════════════════════
            AI MODE STEPS
        ══════════════════════════════════════════════════════════ */}

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

        {planMode === "ai" && aiStep === "regions" && (
          <div className="plan-step">
            {loadingClusters ? (
              <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="rounded-3xl h-28" />
                ))}
              </div>
            ) : (
              <div className="plan-cluster-grid">
                {clusters.map((cluster) => {
                  const { color, icon } = clusterMeta(cluster.name);
                  const active = selectedClusters.includes(cluster.id);
                  return (
                    <button
                      key={cluster.id}
                      className={`plan-cluster-card ${active ? "plan-cluster-active" : ""}`}
                      style={{
                        background: active ? color + "30" : color + "10",
                        borderColor: active ? color : color + "40",
                        boxShadow: active ? `0 0 0 2px ${color}` : "none",
                      }}
                      type="button"
                      onClick={() =>
                        setSelectedClusters((prev) =>
                          prev.includes(cluster.id)
                            ? prev.filter((c) => c !== cluster.id)
                            : [...prev, cluster.id],
                        )
                      }
                    >
                      <span className="text-3xl">{icon}</span>
                      <p className="plan-cluster-name" style={{ color }}>
                        {cluster.name}
                      </p>
                      {active && <span className="plan-cluster-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="plan-hint">
              {selectedClusters.length === 0
                ? "Skip to include all regions"
                : `${selectedClusters.length} region${selectedClusters.length > 1 ? "s" : ""} selected`}
            </p>
          </div>
        )}

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

        {/* ══════════════════════════════════════════════════════════
            RESULT STEP (shared)
        ══════════════════════════════════════════════════════════ */}

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
                <div className="plan-result-header">
                  <div className="plan-result-icon">🗺️</div>
                  <h2 className="plan-result-title">{result.title}</h2>
                  <p className="plan-result-sub">
                    {result.days} day{result.days > 1 ? "s" : ""} ·{" "}
                    {result.total_stops} stop
                    {result.total_stops !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="plan-result-stats">
                  <Chip color="primary" size="lg" variant="flat">
                    {
                      TRANSPORT_MODES.find(
                        (t) => t.value === result.transport_mode,
                      )?.emoji
                    }{" "}
                    {TRANSPORT_MODES.find(
                      (t) => t.value === result.transport_mode,
                    )?.label ?? result.transport_mode}
                  </Chip>
                  <Chip color="success" size="lg" variant="flat">
                    📅 {result.days} Day{result.days > 1 ? "s" : ""}
                  </Chip>
                  <Chip color="warning" size="lg" variant="flat">
                    📍 {result.total_stops} Stop{result.total_stops !== 1 ? "s" : ""}
                  </Chip>
                </div>

                <div className="plan-result-cta">
                  <Button
                    className="plan-start-btn"
                    color="primary"
                    size="lg"
                    onPress={() => setQrOpen(true)}
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
                  Scan the QR code with your phone to open this itinerary in
                  the AIRAT-NA app — no account needed.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* ─── Navigation ───────────────────────────────────────────── */}
        {planMode !== null && !generating && (
          <div className="plan-nav">
            {/* Back */}
            <Button
              className="plan-nav-back"
              size="lg"
              variant="flat"
              onPress={() => {
                if (planMode === "pick") {
                  if (pickStep === "select") { setPlanMode(null); return; }
                  if (pickStep === "transport") { setPickStep("select"); return; }
                  if (pickStep === "result") { setPickStep("transport"); setResult(null); return; }
                } else {
                  const steps: AiStep[] = ["interests", "group", "transport", "regions", "duration", "result"];
                  const idx = steps.indexOf(aiStep);
                  if (idx === 0) { setPlanMode(null); return; }
                  setAiStep(steps[idx - 1]);
                  if (aiStep === "result") setResult(null);
                }
              }}
            >
              ← Back
            </Button>

            {/* Forward / Generate */}
            {planMode === "pick" && pickStep === "select" && (
              <Button
                className="plan-nav-generate"
                color="primary"
                isDisabled={selectedIds.length === 0}
                size="lg"
                onPress={() => setPickStep("transport")}
              >
                Next → ({selectedIds.length} selected)
              </Button>
            )}

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

            {planMode === "ai" && aiStep !== "result" && (() => {
              const steps: AiStep[] = ["interests", "group", "transport", "regions", "duration", "result"];
              const idx = steps.indexOf(aiStep);
              const isLast = aiStep === "duration";
              return (
                <Button
                  className={isLast ? "plan-nav-generate" : "plan-nav-next"}
                  color="primary"
                  size="lg"
                  onPress={() => {
                    if (isLast) { void generate(); return; }
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

      {/* QR Modal */}
      {result && (
        <QRHandoffModal
          deepLink={result.deep_link}
          isOpen={qrOpen}
          subtitle={`${result.days} day${result.days > 1 ? "s" : ""} · ${result.total_stops} stops · Scan to open in the app — no account needed`}
          title={result.title}
          onClose={() => setQrOpen(false)}
        />
      )}
    </KioskLayout>
  );
};

export default KioskPlanPage;

// ─── Destination Picker ───────────────────────────────────────────────────────

interface PickerProps {
  allCategories: Category[];
  allDestinations: Destination[];
  filterCategory: string;
  loading: boolean;
  searchQuery: string;
  selectedIds: string[];
  onFilterCategory: (c: string) => void;
  onSearch: (q: string) => void;
  onToggle: (id: string) => void;
}

function DestinationPicker({
  allCategories,
  allDestinations,
  filterCategory,
  loading,
  searchQuery,
  selectedIds,
  onFilterCategory,
  onSearch,
  onToggle,
}: PickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="picker-wrap">
      {/* Search + category filter bar */}
      <div className="picker-toolbar">
        <div className="picker-search-wrap">
          <span className="picker-search-icon">🔍</span>
          <input
            ref={inputRef}
            className="picker-search"
            placeholder="Search destinations…"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
          {searchQuery && (
            <button
              className="picker-search-clear"
              type="button"
              onClick={() => { onSearch(""); inputRef.current?.focus(); }}
            >
              ×
            </button>
          )}
        </div>

        <div className="picker-cat-scroll">
          <button
            className={`picker-cat-chip ${filterCategory === "all" ? "picker-cat-active" : ""}`}
            type="button"
            onClick={() => onFilterCategory("all")}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat.id}
              className={`picker-cat-chip ${filterCategory === cat.name ? "picker-cat-active" : ""}`}
              type="button"
              onClick={() => onFilterCategory(cat.name)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Selected strip */}
      {selectedIds.length > 0 && (
        <div className="picker-selected-bar">
          <span className="picker-sel-count">
            {selectedIds.length} selected
          </span>
          <span className="picker-sel-hint">Tap a destination to remove it</span>
        </div>
      )}

      {/* Destination grid */}
      {loading ? (
        <div className="picker-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="rounded-2xl h-44" />
          ))}
        </div>
      ) : allDestinations.length === 0 ? (
        <div className="picker-empty">
          <p>No destinations found</p>
          <button
            className="picker-empty-reset"
            type="button"
            onClick={() => { onSearch(""); onFilterCategory("all"); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="picker-grid">
          {allDestinations.map((dest) => {
            const isSelected = selectedIds.includes(dest.id);
            const selIdx = selectedIds.indexOf(dest.id);
            const img = dest.images?.[0];
            return (
              <button
                key={dest.id}
                className={`picker-card ${isSelected ? "picker-card-selected" : ""}`}
                type="button"
                onClick={() => onToggle(dest.id)}
              >
                {/* Image */}
                <div className="picker-card-img-wrap">
                  {img ? (
                    <img
                      alt={dest.name}
                      className="picker-card-img"
                      src={img}
                    />
                  ) : (
                    <div className="picker-card-img-fallback">📍</div>
                  )}
                  {/* Selection badge */}
                  {isSelected ? (
                    <div className="picker-badge-selected">{selIdx + 1}</div>
                  ) : (
                    <div className="picker-badge-add">+</div>
                  )}
                </div>
                {/* Info */}
                <div className="picker-card-body">
                  <p className="picker-card-name">{dest.name}</p>
                  <p className="picker-card-meta">
                    {dest.municipality ?? dest.category_name ?? ""}
                  </p>
                  {dest.entrance_fee_local != null &&
                    dest.entrance_fee_local > 0 && (
                      <p className="picker-card-fee">
                        ₱{dest.entrance_fee_local}
                      </p>
                    )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
