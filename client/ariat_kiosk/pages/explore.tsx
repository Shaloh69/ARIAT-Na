import type { NextPage } from "next";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Pagination } from "@heroui/pagination";
import { Skeleton } from "@heroui/skeleton";
import { Spinner } from "@heroui/spinner";

import KioskLayout from "@/components/KioskLayout";
import QRHandoffModal from "@/components/QRHandoffModal";
import { API_BASE_URL, API_ENDPOINTS } from "@/lib/constants";
import { toast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

interface Cluster {
  id: string;
  name: string;
}

interface Destination {
  category_name?: string;
  category_id?: string;
  cluster_id?: string;
  entrance_fee_local?: number;
  id: string;
  images?: string[];
  is_featured?: boolean;
  municipality?: string;
  name: string;
  rating?: number;
}

interface QRTarget {
  deepLink: string;
  subtitle?: string;
  title: string;
}

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

function clusterColor(name: string): string {
  const n = name.toLowerCase();

  if (n.includes("metro")) return "#f43f5e";
  if (n.includes("south")) return "#10b981";
  if (n.includes("north")) return "#3b82f6";
  if (n.includes("island")) return "#f59e0b";
  if (n.includes("west")) return "#8b5cf6";

  return "#64748b";
}

const PAGE_SIZE = 12;

// ─── Component ────────────────────────────────────────────────────────────────

const KioskExplore: NextPage = () => {
  const router = useRouter();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCluster, setSelectedCluster] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingDests, setLoadingDests] = useState(false);
  const [qrTarget, setQrTarget] = useState<QRTarget | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);

    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const fetchMeta = async () => {
      setLoadingMeta(true);
      try {
        const [clRes, catRes] = await Promise.all([
          fetch(`${API_BASE_URL}${API_ENDPOINTS.CLUSTERS}`),
          fetch(`${API_BASE_URL}${API_ENDPOINTS.CATEGORIES}`),
        ]);
        const clJson = (await clRes.json()) as {
          data: Cluster[];
          success: boolean;
        };
        const catJson = (await catRes.json()) as {
          data: Category[];
          success: boolean;
        };

        if (clJson.success && clJson.data) setClusters(clJson.data);
        if (catJson.success && catJson.data) setCategories(catJson.data);
      } catch {
        toast.error("Failed to load filters");
      } finally {
        setLoadingMeta(false);
      }
    };

    void fetchMeta();
  }, []);

  const fetchDestinations = useCallback(async () => {
    setLoadingDests(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });

      if (debouncedSearch) params.set("search", debouncedSearch);
      if (selectedCluster !== "all") params.set("cluster_id", selectedCluster);
      if (selectedCategory !== "all")
        params.set("category_id", selectedCategory);

      const res = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.DESTINATIONS}?${params.toString()}`,
      );
      const json = (await res.json()) as {
        data: Destination[];
        pagination?: { total: number };
        success: boolean;
        total?: number;
      };

      if (json.success && json.data) {
        setDestinations(json.data);
        setTotal(json.pagination?.total ?? json.total ?? json.data.length);
      }
    } catch {
      toast.error("Failed to load destinations");
    } finally {
      setLoadingDests(false);
    }
  }, [page, debouncedSearch, selectedCluster, selectedCategory]);

  useEffect(() => {
    void fetchDestinations();
  }, [fetchDestinations]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCluster, selectedCategory]);

  const openQR = (dest: Destination) =>
    setQrTarget({
      deepLink: buildDeepLink(dest.id, dest.name),
      subtitle: dest.municipality ?? dest.category_name,
      title: dest.name,
    });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <KioskLayout title="Explore Destinations — AIRAT-NA Kiosk">
      <div className="px-10 pb-14 max-w-[1600px] mx-auto">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="pt-8 flex items-center gap-5 mb-8">
          <Button
            className="h-12 px-6 text-base"
            size="lg"
            variant="flat"
            onPress={() => void router.push("/")}
          >
            ← Home
          </Button>
          <div>
            <h1
              className="text-4xl font-black tracking-tight"
              style={{ color: "var(--text-strong)" }}
            >
              Explore Destinations
            </h1>
            <p
              className="text-base mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {total > 0
                ? `${total} destinations across Cebu`
                : "Search and filter below"}
            </p>
          </div>
        </div>

        {/* ── Search ────────────────────────────────────────────────── */}
        <Input
          classNames={{
            base: "mb-6",
            input: "text-lg",
            inputWrapper: "h-16 px-6 text-lg",
          }}
          placeholder="Search destinations, areas, categories…"
          size="lg"
          startContent={
            <span style={{ color: "var(--text-faint)", fontSize: 22 }}>🔍</span>
          }
          value={search}
          onValueChange={setSearch}
        />

        {/* ── Region filter ─────────────────────────────────────────── */}
        {loadingMeta ? (
          <div className="flex gap-3 mb-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="rounded-full h-11 w-32" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 mb-5">
            <FilterChip
              active={selectedCluster === "all"}
              label="All Regions"
              onClick={() => setSelectedCluster("all")}
            />
            {clusters.map((cl) => (
              <FilterChip
                key={cl.id}
                active={selectedCluster === cl.id}
                color={clusterColor(cl.name)}
                label={cl.name}
                onClick={() => setSelectedCluster(cl.id)}
              />
            ))}
          </div>
        )}

        {/* ── Category filter ───────────────────────────────────────── */}
        {!loadingMeta && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Chip
              className="explore-cat-chip cursor-pointer"
              color={selectedCategory === "all" ? "secondary" : "default"}
              size="md"
              variant={selectedCategory === "all" ? "solid" : "flat"}
              onClick={() => setSelectedCategory("all")}
            >
              All Categories
            </Chip>
            {categories.map((cat) => (
              <Chip
                key={cat.id}
                className="explore-cat-chip cursor-pointer"
                color={selectedCategory === cat.id ? "secondary" : "default"}
                size="md"
                variant={selectedCategory === cat.id ? "solid" : "flat"}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </Chip>
            ))}
          </div>
        )}

        {/* ── Destination grid ──────────────────────────────────────── */}
        {loadingDests && destinations.length === 0 ? (
          <div className="grid grid-cols-4 gap-5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <Skeleton key={i} className="rounded-3xl h-80" />
            ))}
          </div>
        ) : destinations.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-28 text-center"
            style={{ color: "var(--text-faint)" }}
          >
            <span className="text-6xl mb-5">🗺️</span>
            <p className="text-xl font-semibold">No destinations found</p>
            <p className="text-base mt-2">
              Try adjusting your filters or search
            </p>
            <Button
              className="mt-6 h-12 px-8 text-base"
              size="lg"
              variant="flat"
              onPress={() => {
                setSearch("");
                setSelectedCluster("all");
                setSelectedCategory("all");
              }}
            >
              Clear All Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-5">
            {destinations.map((dest) => (
              <Card
                key={dest.id}
                isPressable
                className="dest-card rounded-3xl overflow-hidden transition-all active:scale-[0.97]"
                style={{ borderColor: "var(--border)" }}
                onPress={() => openQR(dest)}
              >
                <div className="relative h-48">
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
                  {dest.is_featured && (
                    <div className="absolute top-3 left-3">
                      <Chip color="warning" size="sm" variant="solid">
                        ⭐ Featured
                      </Chip>
                    </div>
                  )}
                </div>
                <CardBody className="gap-2 px-4 py-4">
                  <p className="dest-card-name">{dest.name}</p>
                  <p className="dest-card-location">
                    📍 {dest.municipality ?? dest.category_name ?? "Cebu"}
                  </p>
                  {!!dest.rating && dest.rating > 0 && (
                    <p className="text-sm" style={{ color: "#f59e0b" }}>
                      {"★".repeat(Math.round(dest.rating))}
                      {"☆".repeat(5 - Math.round(dest.rating))}
                    </p>
                  )}
                  {!!dest.entrance_fee_local && dest.entrance_fee_local > 0 && (
                    <p className="dest-card-fee">
                      ₱{dest.entrance_fee_local} entrance
                    </p>
                  )}
                  <Button
                    className="mt-2 w-full h-12 text-base"
                    color="primary"
                    size="md"
                    variant="flat"
                    onPress={() => openQR(dest)}
                  >
                    Start Journey →
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────── */}
        {totalPages > 1 && !loadingDests && (
          <div className="flex justify-center mt-12">
            <Pagination
              showControls
              color="primary"
              page={page}
              size="lg"
              total={totalPages}
              onChange={setPage}
            />
          </div>
        )}

        {loadingDests && destinations.length > 0 && (
          <div className="flex justify-center mt-8">
            <Spinner color="primary" size="lg" />
          </div>
        )}
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

export default KioskExplore;

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterChip({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="filter-chip"
      data-active={active}
      style={
        !active && color ? { borderColor: color + "55", color } : undefined
      }
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
