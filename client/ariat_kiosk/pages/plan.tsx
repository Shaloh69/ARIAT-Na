import type { NextPage } from "next";

import { useCallback, useEffect, useState } from "react";
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
  id: string;
  name: string;
  region_type: string;
  description?: string;
}

interface GeneratedResult {
  token: string;
  title: string;
  days: number;
  transport_mode: string;
  total_stops: number;
  deep_link: string;
}

type Step = "interests" | "group" | "transport" | "regions" | "duration" | "result";

// ─── Config ───────────────────────────────────────────────────────────────────

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

const TRANSPORT_MODES = [
  { emoji: "🚗", label: "Private Car", value: "private_car", desc: "Flexible, comfortable" },
  { emoji: "🚌", label: "Bus / Commute", value: "bus", desc: "Budget-friendly" },
  { emoji: "🚕", label: "Taxi / Grab", value: "taxi", desc: "Convenient, metered" },
  { emoji: "⛴️", label: "Ferry + Land", value: "ferry", desc: "For island trips" },
];

const CEBU_CENTER = { lat: 10.3157, lon: 123.8854 };

// ─── Component ────────────────────────────────────────────────────────────────

const KioskPlanPage: NextPage = () => {
  const [step, setStep] = useState<Step>("interests");
  const [interests, setInterests] = useState<string[]>([]);
  const [groupType, setGroupType] = useState<string>("couple");
  const [transportMode, setTransportMode] = useState<string>("private_car");
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [days, setDays] = useState<number>(1);
  const [hoursPerDay, setHoursPerDay] = useState<number>(8);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  // Fetch clusters for region step
  useEffect(() => {
    const fetchClusters = async () => {
      setLoadingClusters(true);
      try {
        const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.CLUSTERS}`);
        const json = await res.json() as { success: boolean; data: Cluster[] };
        if (json.success && json.data) setClusters(json.data);
      } catch {
        toast.error("Failed to load regions");
      } finally {
        setLoadingClusters(false);
      }
    };
    void fetchClusters();
  }, []);

  const toggleInterest = (v: string) =>
    setInterests((prev) =>
      prev.includes(v) ? prev.filter((i) => i !== v) : [...prev, v],
    );

  const toggleCluster = (id: string) =>
    setSelectedClusters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const STEPS: Step[] = ["interests", "group", "transport", "regions", "duration", "result"];
  const stepIdx = STEPS.indexOf(step);
  const progress = ((stepIdx) / (STEPS.length - 1)) * 100;

  const nextStep = () => {
    const next = STEPS[stepIdx + 1];
    if (next) setStep(next);
  };
  const prevStep = () => {
    const prev = STEPS[stepIdx - 1];
    if (prev) setStep(prev);
  };

  const generate = useCallback(async () => {
    setGenerating(true);
    setStep("result");
    try {
      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.KIOSK_GENERATE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_lat: CEBU_CENTER.lat,
          start_lon: CEBU_CENTER.lon,
          interests,
          group_type: groupType,
          transport_mode: transportMode,
          days,
          hours_per_day: hoursPerDay,
          cluster_ids: selectedClusters,
          max_stops: days > 1 ? 4 : 5,
        }),
      });
      const json = await res.json() as { success: boolean; data: GeneratedResult; message?: string };
      if (!json.success) throw new Error(json.message ?? "Generation failed");
      setResult(json.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate itinerary";
      toast.error(message);
      setStep("duration");
    } finally {
      setGenerating(false);
    }
  }, [interests, groupType, transportMode, days, hoursPerDay, selectedClusters]);

  const clusterMeta = (name: string): { color: string; icon: string } => {
    const n = name.toLowerCase();
    if (n.includes("metro")) return { color: "#f43f5e", icon: "🏙️" };
    if (n.includes("south")) return { color: "#10b981", icon: "🌿" };
    if (n.includes("north")) return { color: "#3b82f6", icon: "⛰️" };
    if (n.includes("island")) return { color: "#f59e0b", icon: "🏝️" };
    if (n.includes("west")) return { color: "#8b5cf6", icon: "🌊" };
    return { color: "#64748b", icon: "📍" };
  };

  return (
    <KioskLayout title="Plan My Trip — AIRAT-NA">
      <div className="plan-page">
        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="plan-header">
          <h1 className="plan-title">Plan My Trip</h1>
          <p className="plan-sub">
            {step === "interests" && "What kind of experiences are you looking for?"}
            {step === "group" && "Who are you travelling with?"}
            {step === "transport" && "How will you get around?"}
            {step === "regions" && "Which parts of Cebu do you want to explore?"}
            {step === "duration" && "How long is your trip?"}
            {step === "result" && (generating ? "Crafting your perfect itinerary…" : "Your itinerary is ready!")}
          </p>

          {/* Progress bar */}
          {step !== "result" && (
            <div className="plan-progress-wrap">
              <div className="plan-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* ─── Step: Interests ──────────────────────────────────────────── */}
        {step === "interests" && (
          <div className="plan-step">
            <div className="plan-chip-grid">
              {INTERESTS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`plan-interest-chip ${interests.includes(item.value) ? "plan-chip-active" : ""}`}
                  onClick={() => toggleInterest(item.value)}
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

        {/* ─── Step: Group Type ─────────────────────────────────────────── */}
        {step === "group" && (
          <div className="plan-step">
            <div className="plan-group-grid">
              {GROUP_TYPES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  className={`plan-group-card ${groupType === g.value ? "plan-group-active" : ""}`}
                  onClick={() => setGroupType(g.value)}
                >
                  <span className="plan-group-emoji">{g.emoji}</span>
                  <span className="plan-group-label">{g.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step: Transport ──────────────────────────────────────────── */}
        {step === "transport" && (
          <div className="plan-step">
            <div className="plan-transport-grid">
              {TRANSPORT_MODES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`plan-transport-card ${transportMode === t.value ? "plan-transport-active" : ""}`}
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

        {/* ─── Step: Regions ────────────────────────────────────────────── */}
        {step === "regions" && (
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
                      type="button"
                      className={`plan-cluster-card ${active ? "plan-cluster-active" : ""}`}
                      style={{
                        background: active ? color + "30" : color + "10",
                        borderColor: active ? color : color + "40",
                        boxShadow: active ? `0 0 0 2px ${color}` : "none",
                      }}
                      onClick={() => toggleCluster(cluster.id)}
                    >
                      <span className="text-3xl">{icon}</span>
                      <p className="plan-cluster-name" style={{ color }}>{cluster.name}</p>
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

        {/* ─── Step: Duration ───────────────────────────────────────────── */}
        {step === "duration" && (
          <div className="plan-step plan-duration-step">
            {/* Days */}
            <div className="plan-duration-row">
              <p className="plan-duration-label">Number of days</p>
              <div className="plan-day-picker">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`plan-day-btn ${days === d ? "plan-day-active" : ""}`}
                    onClick={() => setDays(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours per day */}
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

            {/* Summary */}
            <Card className="plan-summary-card">
              <CardBody className="gap-2 p-5">
                <p className="plan-summary-title">Your Trip Summary</p>
                <div className="plan-summary-grid">
                  <SummaryItem icon="🗺️" label="Regions" value={selectedClusters.length === 0 ? "All of Cebu" : `${selectedClusters.length} region${selectedClusters.length > 1 ? "s" : ""}`} />
                  <SummaryItem icon="🎯" label="Interests" value={interests.length === 0 ? "Everything" : interests.slice(0, 3).join(", ") + (interests.length > 3 ? "…" : "")} />
                  <SummaryItem icon={GROUP_TYPES.find(g => g.value === groupType)?.emoji ?? "👥"} label="Group" value={GROUP_TYPES.find(g => g.value === groupType)?.label ?? groupType} />
                  <SummaryItem icon={TRANSPORT_MODES.find(t => t.value === transportMode)?.emoji ?? "🚗"} label="Transport" value={TRANSPORT_MODES.find(t => t.value === transportMode)?.label ?? transportMode} />
                  <SummaryItem icon="📅" label="Duration" value={`${days} day${days > 1 ? "s" : ""}, ${hoursPerDay}h/day`} />
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* ─── Step: Result ─────────────────────────────────────────────── */}
        {step === "result" && (
          <div className="plan-step plan-result-step">
            {generating ? (
              <div className="plan-generating">
                <div className="plan-gen-spinner" />
                <p className="plan-gen-title">Building your itinerary…</p>
                <p className="plan-gen-sub">Finding the best spots and routes for you</p>
                <div className="plan-gen-dots">
                  {["Scoring destinations", "Planning your route", "Calculating travel times"].map((label, i) => (
                    <div key={i} className="plan-gen-dot-row">
                      <div className="plan-gen-dot" style={{ animationDelay: `${i * 0.4}s` }} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : result ? (
              <div className="plan-result-content">
                {/* Confetti-ish success header */}
                <div className="plan-result-header">
                  <div className="plan-result-icon">🗺️</div>
                  <h2 className="plan-result-title">{result.title}</h2>
                  <p className="plan-result-sub">
                    {result.days} day{result.days > 1 ? "s" : ""} · {result.total_stops} stop{result.total_stops !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Stats */}
                <div className="plan-result-stats">
                  <Chip color="primary" size="lg" variant="flat">
                    {TRANSPORT_MODES.find(t => t.value === result.transport_mode)?.emoji} {TRANSPORT_MODES.find(t => t.value === result.transport_mode)?.label ?? result.transport_mode}
                  </Chip>
                  <Chip color="success" size="lg" variant="flat">
                    📅 {result.days} Day{result.days > 1 ? "s" : ""}
                  </Chip>
                  <Chip color="warning" size="lg" variant="flat">
                    📍 {result.total_stops} Stops
                  </Chip>
                </div>

                {/* CTA */}
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
                    onPress={() => {
                      setResult(null);
                      setStep("interests");
                      setInterests([]);
                      setSelectedClusters([]);
                    }}
                  >
                    Plan Another Trip
                  </Button>
                </div>

                <p className="plan-result-note">
                  Scan the QR code with your phone camera to claim this itinerary in the AIRAT-NA app.
                  <br />
                  No account? You can sign up right from the app.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* ─── Navigation ───────────────────────────────────────────────── */}
        {step !== "result" && (
          <div className="plan-nav">
            <Button
              className="plan-nav-back"
              isDisabled={stepIdx === 0}
              size="lg"
              variant="flat"
              onPress={prevStep}
            >
              ← Back
            </Button>

            {step === "duration" ? (
              <Button
                className="plan-nav-generate"
                color="primary"
                size="lg"
                onPress={() => void generate()}
              >
                ✨ Generate Itinerary
              </Button>
            ) : (
              <Button
                className="plan-nav-next"
                color="primary"
                size="lg"
                onPress={nextStep}
              >
                {step === "interests" && interests.length === 0 ? "Skip →" : "Next →"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* QR Modal */}
      {result && (
        <QRHandoffModal
          deepLink={result.deep_link}
          isOpen={qrOpen}
          subtitle={`${result.days} day${result.days > 1 ? "s" : ""} · ${result.total_stops} stops · Scan to claim in the app`}
          title={result.title}
          onClose={() => setQrOpen(false)}
        />
      )}
    </KioskLayout>
  );
};

export default KioskPlanPage;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="plan-summary-item">
      <span className="plan-summary-icon">{icon}</span>
      <div>
        <p className="plan-summary-label">{label}</p>
        <p className="plan-summary-value">{value}</p>
      </div>
    </div>
  );
}
