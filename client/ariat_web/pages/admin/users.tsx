import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { Tooltip } from "@heroui/tooltip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";

import AdminLayout from "@/layouts/admin";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { apiClient } from "@/lib/api";
import { API_ENDPOINTS } from "@/lib/constants";
import { useUsersSocket } from "@/lib/hooks/useUsersSocket";
import type { AppUser, PaginatedResponse } from "@/types/api";

// ── Dynamic Leaflet map (no SSR) ─────────────────────────────────────────────
const UsersMap = dynamic(() => import("@/components/UsersMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <img src="/android-chrome-192x192.png" alt="AIRAT-NA"
            className="h-14 w-14 object-contain animate-pulse" />
          <div className="absolute inset-[-6px] rounded-full border-3 border-transparent animate-spin"
            style={{ borderTopColor: "#f43f5e", borderRightColor: "#fda4af" }} />
        </div>
        <p style={{ color: "var(--text-muted)" }}>Loading map…</p>
      </div>
    </div>
  ),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function UserAvatar({ user, size = 9 }: { user: { full_name: string; profile_image_url?: string | null }; size?: number }) {
  const cls = `h-${size} w-${size} rounded-full flex-shrink-0`;
  if (user.profile_image_url)
    return <img src={user.profile_image_url} alt={user.full_name} className={`${cls} object-cover`} />;
  return (
    <div className={`${cls} flex items-center justify-center text-xs font-bold`}
      style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>
      {user.full_name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  // REST user list
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Map selection
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Real-time active users
  const { isConnected, activeUsers, socketError, removeUser } = useUsersSocket();

  // ── Fetch users ──────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (p: number, q: string) => {
    try {
      setLoadingUsers(true);
      const res = await apiClient.get<PaginatedResponse<AppUser> & { data: AppUser[] }>(
        `${API_ENDPOINTS.ADMIN_USERS}?page=${p}&limit=30&search=${encodeURIComponent(q)}`
      );
      if (res.success && res.data) {
        const d = res.data as any;
        setUsers(d.data ?? []);
        setTotal(d.pagination?.total ?? 0);
        setTotalPages(d.pagination?.totalPages ?? 1);
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(page, search);
  }, [fetchUsers, page, search]);

  // Debounce search input
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  };

  // ── Merge online status from socket ─────────────────────────────────────────
  const onlineIds = new Set(activeUsers.map((u) => u.userId));
  const mergedUsers: AppUser[] = users.map((u) => ({
    ...u,
    is_online: onlineIds.has(u.id),
  }));

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await apiClient.delete(`${API_ENDPOINTS.ADMIN_USERS}/${deleteTarget.id}`);
      if (res.success) {
        toast.success(`${deleteTarget.full_name} deleted`);
        setDeleteTarget(null);
        removeUser(deleteTarget.id);
        fetchUsers(page, search);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  // Highlight selected user in sidebar
  const handleSelectUser = useCallback((userId: string) => {
    setSelectedUserId((prev) => (prev === userId ? null : userId));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  const usersOnMap = activeUsers.filter((u) => u.lat !== null && u.lon !== null);

  return (
    <AdminLayout>
      <Head><title>Users — AIRAT-NA Admin</title></Head>

      {/* Full-height flex: map left, sidebar right */}
      <div
        className="flex gap-0 overflow-hidden rounded-xl border border-white/10"
        style={{ height: "calc(100vh - 10rem)" }}
      >
        {/* ── Map ────────────────────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">
          <UsersMap
            activeUsers={activeUsers}
            selectedUserId={selectedUserId}
            onSelectUser={handleSelectUser}
          />

          {/* Map overlay: stats pill */}
          <div
            className="absolute top-4 left-4 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
          >
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: isConnected ? "#22c55e" : "#6b7280" }} />
            <span className="text-xs font-medium" style={{ color: "#e2e8f0" }}>
              {usersOnMap.length} user{usersOnMap.length !== 1 ? "s" : ""} on map
            </span>
            {activeUsers.length > usersOnMap.length && (
              <span className="text-xs" style={{ color: "#94a3b8" }}>
                · {activeUsers.length - usersOnMap.length} no location
              </span>
            )}
          </div>

          {/* Legend */}
          <div
            className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-1.5 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}
          >
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
              <span className="text-xs" style={{ color: "#94a3b8" }}>Active itinerary</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
              <span className="text-xs" style={{ color: "#94a3b8" }}>Browsing app</span>
            </div>
          </div>

          {/* Socket error */}
          {socketError && (
            <div className="absolute top-4 right-4 z-[1000] px-3 py-1.5 rounded-full text-xs"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", backdropFilter: "blur(8px)" }}>
              WS: {socketError}
            </div>
          )}
        </div>

        {/* ── Right Sidebar ────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: 340, borderLeft: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-sm" style={{ color: "var(--text-strong)" }}>
                  All Users
                </h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {total} registered · {activeUsers.length} online
                </p>
              </div>
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: isConnected ? "#22c55e" : "#6b7280" }}
              />
            </div>
            <Input
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search users…"
              size="sm"
              radius="lg"
              classNames={{
                inputWrapper: "bg-white/5 border border-white/10 hover:bg-white/8 focus-within:border-blue-500/50",
                input: "text-xs",
              }}
              startContent={
                <svg className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
              </div>
            ) : mergedUsers.length === 0 ? (
              <p className="text-center text-xs py-10" style={{ color: "var(--text-muted)" }}>
                {search ? "No users match your search" : "No registered users"}
              </p>
            ) : (
              <div className="space-y-px p-2">
                {mergedUsers.map((u) => {
                  const activeEntry = activeUsers.find((a) => a.userId === u.id);
                  const isSelected = selectedUserId === u.id;
                  const hasLocation = activeEntry ? activeEntry.lat !== null : false;

                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        if (hasLocation) handleSelectUser(u.id);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                      style={{
                        cursor: hasLocation ? "pointer" : "default",
                        background: isSelected
                          ? "rgba(59,130,246,0.12)"
                          : "transparent",
                        borderLeft: isSelected ? "2px solid #3b82f6" : "2px solid transparent",
                      }}
                    >
                      {/* Avatar + presence */}
                      <div className="relative">
                        <UserAvatar user={u} size={9} />
                        <span
                          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2"
                          style={{
                            backgroundColor: u.is_online ? "#22c55e" : "#4b5563",
                            borderColor: "var(--bg-card)",
                          }}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--text-strong)" }}>
                          {u.full_name}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                          {u.email}
                        </p>
                        {activeEntry?.itinerary_title ? (
                          <p className="text-[10px] truncate" style={{ color: "#22c55e" }}>
                            📍 {activeEntry.itinerary_title}
                          </p>
                        ) : u.is_online ? (
                          <p className="text-[10px]" style={{ color: "#60a5fa" }}>● Online</p>
                        ) : (
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            Joined {formatDate(u.created_at)}
                          </p>
                        )}
                      </div>

                      {/* Itinerary count badge */}
                      {u.itinerary_count > 0 && (
                        <Tooltip
                          classNames={{ content: "bg-slate-800 text-white border border-white/10 shadow-lg text-xs" }}
                          content={`${u.itinerary_count} itinerar${u.itinerary_count === 1 ? "y" : "ies"}`}
                          delay={400}
                          placement="left"
                        >
                          <Chip size="sm" variant="flat" color="primary"
                            classNames={{ base: "h-5 px-1.5", content: "text-[10px] px-0" }}>
                            {u.itinerary_count}
                          </Chip>
                        </Tooltip>
                      )}

                      {/* Delete */}
                      <Tooltip
                        classNames={{ content: "bg-slate-800 text-white border border-white/10 shadow-lg text-xs" }}
                        content="Delete user"
                        delay={500}
                        placement="left"
                      >
                        <button
                          className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/15 transition-all"
                          style={{ color: "var(--danger)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(u);
                          }}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <Button
                size="sm" variant="flat"
                isDisabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </Button>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {page} / {totalPages}
              </span>
              <Button
                size="sm" variant="flat"
                isDisabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} classNames={modalClassNames} size="sm">
        <ModalContent>
          <ModalHeader>Delete User Account</ModalHeader>
          <ModalBody>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Permanently delete{" "}
              <span className="font-semibold" style={{ color: "var(--text-strong)" }}>
                {deleteTarget?.full_name}
              </span>
              ? This will remove their account and all associated data. This cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="danger" isLoading={deleting} onPress={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
