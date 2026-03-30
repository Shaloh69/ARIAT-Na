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

interface Cluster {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Destination {
  id: string;
  name: string;
  category_name?: string;
  category_id?: string;
  cluster_id?: string;
  municipality?: string;
  images?: string[];
  rating?: number;
  entrance_fee_local?: number;
  is_featured?: boolean;
}

interface QRTarget {
  deepLink: string;
  subtitle?: string;
  title: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDeepLink(id: string, name?: string): string {
  const params = new URLSearchParams({ id, source: "kiosk", type: "destination" });

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

export default function KioskExplore() {
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
    const base = API_BASE_URL;

    const fetchMeta = async () => {
      setLoadingMeta(true);
      try {
        const [clRes, catRes] = await Promise.all([
          fetch(`${base}${API_ENDPOINTS.CLUSTERS}`),
          fetch(`${base}${API_ENDPOINTS.CATEGORIES}`),
        ]);
        const clJson = (await clRes.json()) as { success: boolean; data: Cluster[] };
        const catJson = (await catRes.json()) as { success: boolean; data: Category[] };

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
    const base = API_BASE_URL;

    setLoadingDests(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });

      if (debouncedSearch) params.set("search", debouncedSearch);
      if (selectedCluster !== "all") params.set("cluster_id", selectedCluster);
      if (selectedCategory !== "all") params.set("category_id", selectedCategory);

      const res = await fetch(`${base}${API_ENDPOINTS.DESTINATIONS}?${params.toString()}`);
      const json = (await res.json()) as {
        success: boolean;
        data: Destination[];
        total?: number;
        pagination?: { total: number };
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

  const openQR = (dest: Destination) => {
    setQrTarget({
      deepLink: buildDeepLink(dest.id, dest.name),
      subtitle: dest.municipality ?? dest.category_name,
      title: dest.name,
    });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <KioskLayout title="Explore Destinations — AIRAT-NA Kiosk">
      <div className="px-8 pb-12 max-w-7xl mx-auto">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="pt-8 flex items-center gap-4 mb-8">
          <Button
            size="md"
            variant="flat"
            onPress={() => void router.push("/")}
          >
            ← Home
          </Button>
          <div>
            <h1
              className="text-3xl font-black tracking-tight"
              style={{ color: "var(--text-strong)" }}
            >
              Explore Destinations
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {total > 0 ? `${total} destinations found` : "Search and filter below"}
            </p>
          </div>
        </div>

        {/* ── Search ────────────────────────────────────────────────────── */}
        <Input
          classNames={{
            base: "mb-6",
            input: "text-lg",
            inputWrapper: "h-14 px-5",
          }}
          placeholder="Search destinations, municipalities, categories..."
          size="lg"
          startContent={
            <span style={{ color: "var(--text-faint)", fontSize: 20 }}>🔍</span>
          }
          value={search}
          onValueChange={setSearch}
        />

        {/* ── Cluster Filter ────────────────────────────────────────────── */}
        {loadingMeta ? (
          <div className="flex gap-3 mb-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="rounded-full h-9 w-28" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-5">
            <Chip
              className="cursor-pointer h-auto px-4 py-2 text-sm"
              color={selectedCluster === "all" ? "primary" : "default"}
              size="lg"
              variant={selectedCluster === "all" ? "solid" : "flat"}
              onClick={() => setSelectedCluster("all")}
            >
              All Regions
            </Chip>
            {clusters.map((cl) => (
              <Chip
                key={cl.id}
                className="cursor-pointer h-auto px-4 py-2 text-sm"
                color={selectedCluster === cl.id ? "primary" : "default"}
                size="lg"
                style={
                  selectedCluster !== cl.id
                    ? { borderColor: clusterColor(cl.name) + "60" }
                    : undefined
                }
                variant={selectedCluster === cl.id ? "solid" : "flat"}
                onClick={() => setSelectedCluster(cl.id)}
              >
                {cl.name}
              </Chip>
            ))}
          </div>
        )}

        {/* ── Category Filter ───────────────────────────────────────────── */}
        {!loadingMeta && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Chip
              className="cursor-pointer h-auto px-3 text-sm"
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
                className="cursor-pointer h-auto px-3 text-sm"
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

        {/* ── Destination Grid ──────────────────────────────────────────── */}
        {loadingDests && destinations.length === 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <Skeleton key={i} className="rounded-2xl" style={{ height: 240 }} />
            ))}
          </div>
        ) : destinations.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 text-center"
            style={{ color: "var(--text-faint)" }}
          >
            <span className="text-5xl mb-4">🗺️</span>
            <p className="text-lg font-medium">No destinations found</p>
            <p className="text-sm mt-1">Try adjusting your filters or search</p>
            <Button
              className="mt-4"
              variant="flat"
              onPress={() => {
                setSearch("");
                setSelectedCluster("all");
                setSelectedCategory("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {destinations.map((dest) => (
              <Card
                key={dest.id}
                isPressable
                className="rounded-2xl overflow-hidden border transition-transform active:scale-95"
                style={{ borderColor: "var(--border)" }}
                onPress={() => openQR(dest)}
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
                  {dest.is_featured && (
                    <div className="absolute top-2 left-2">
                      <Chip color="warning" size="sm" variant="solid">
                        Featured
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
                  {!!dest.rating && dest.rating > 0 && (
                    <p className="text-xs" style={{ color: "#f59e0b" }}>
                      {"★".repeat(Math.round(dest.rating))}
                      {"☆".repeat(5 - Math.round(dest.rating))}
                    </p>
                  )}
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
                    onPress={() => openQR(dest)}
                  >
                    Start Journey
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {totalPages > 1 && !loadingDests && (
          <div className="flex justify-center mt-10">
            <Pagination
              showControls
              color="primary"
              page={page}
              total={totalPages}
              onChange={setPage}
            />
          </div>
        )}

        {loadingDests && destinations.length > 0 && (
          <div className="flex justify-center mt-8">
            <Spinner color="primary" />
          </div>
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
