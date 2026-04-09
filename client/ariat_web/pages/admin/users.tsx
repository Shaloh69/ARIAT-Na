import type { AppUser } from "@/types/api";

import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Tooltip } from "@heroui/tooltip";

import AdminLayout from "@/layouts/admin";
import { apiClient } from "@/lib/api";
import { API_ENDPOINTS } from "@/lib/constants";
import { useUsersSocket } from "@/lib/hooks/useUsersSocket";
import { modalClassNames } from "@/lib/modal-styles";
import { toast } from "@/lib/toast";

// ── Dynamic Leaflet map (no SSR) ─────────────────────────────────────────────
const UsersMap = dynamic(() => import("@/components/UsersMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <img
            alt="AIRAT-NA"
            className="h-14 w-14 animate-pulse object-contain"
            src="/android-chrome-192x192.png"
          />
          <div
            className="absolute inset-[-6px] animate-spin rounded-full border-3 border-transparent"
            style={{ borderTopColor: "#f43f5e", borderRightColor: "#fda4af" }}
          />
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
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UserAvatar({
  user,
  size = 9,
}: {
  user: { full_name: string; profile_image_url?: string | null };
  size?: number;
}) {
  const cls = `h-${size} w-${size} rounded-full flex-shrink-0`;

  if (user.profile_image_url) {
    return (
      <img
        alt={user.full_name}
        className={`${cls} object-cover`}
        src={user.profile_image_url}
      />
    );
  }

  return (
    <div
      className={`${cls} flex items-center justify-center text-xs font-bold`}
      style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" }}
    >
      {user.full_name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { isConnected, activeUsers, socketError, removeUser } =
    useUsersSocket();

  // ── Fetch users ──────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (p: number, q: string) => {
    try {
      setLoadingUsers(true);

      const res = await apiClient.get<any>(
        `${API_ENDPOINTS.ADMIN_USERS}?page=${p}&limit=30&search=${encodeURIComponent(q)}`,
      );

      if (res.success) {
        const r = res as any;

        setUsers(r.data ?? []);
        setTotal(r.pagination?.total ?? 0);
        setTotalPages(r.pagination?.totalPages ?? 1);
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

  const handleSearchChange = (val: string) => {
    setSearchInput(val);

    if (searchTimer.current) clearTimeout(searchTimer.current);

    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  };

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

      const res = await apiClient.delete(
        `${API_ENDPOINTS.ADMIN_USERS}/${deleteTarget.id}`,
      );

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

  const handleSelectUser = useCallback((userId: string) => {
    setSelectedUserId((prev) => (prev === userId ? null : userId));
  }, []);

  const usersOnMap = activeUsers.filter(
    (u) => u.lat !== null && u.lon !== null,
  );

  return (
    <AdminLayout>
      <Head>
        <title>Users — AIRAT-NA Admin</title>
      </Head>

      <div
        className="flex gap-0 overflow-hidden rounded-xl border border-white/10"
        style={{ height: "calc(100vh - 10rem)" }}
      >
        {/* ── Map ──────────────────────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-hidden">
          <UsersMap
            activeUsers={activeUsers}
            selectedUserId={selectedUserId}
            onSelectUser={handleSelectUser}
          />

          {/* Stats pill */}
          <div
            className="absolute left-4 top-4 z-[1000] flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: "rgba(15,23,42,0.85)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span
              className="h-2 w-2 animate-pulse rounded-full"
              style={{
                backgroundColor: isConnected ? "#22c55e" : "#6b7280",
              }}
            />
            <span className="text-xs font-medium" style={{ color: "#e2e8f0" }}>
              {usersOnMap.length} user{usersOnMap.length !== 1 ? "s" : ""} on
              map
            </span>
            {activeUsers.length > usersOnMap.length && (
              <span className="text-xs" style={{ color: "#94a3b8" }}>
                · {activeUsers.length - usersOnMap.length} no location
              </span>
            )}
          </div>

          {/* Legend */}
          <div
            className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
            style={{
              background: "rgba(15,23,42,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: "#22c55e" }}
              />
              <span className="text-xs" style={{ color: "#94a3b8" }}>
                Active itinerary
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: "#3b82f6" }}
              />
              <span className="text-xs" style={{ color: "#94a3b8" }}>
                Browsing app
              </span>
            </div>
          </div>

          {socketError && (
            <div
              className="absolute right-4 top-4 z-[1000] rounded-full px-3 py-1.5 text-xs"
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5",
                backdropFilter: "blur(8px)",
              }}
            >
              WS: {socketError}
            </div>
          )}
        </div>

        {/* ── Right Sidebar ─────────────────────────────────────────────────── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            width: 340,
            borderLeft: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}
        >
          {/* Header */}
          <div
            className="px-4 pb-3 pt-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-strong)" }}
                >
                  All Users
                </h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {total} registered · {activeUsers.length} online
                </p>
              </div>
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: isConnected ? "#22c55e" : "#6b7280",
                }}
              />
            </div>
            <Input
              classNames={{
                inputWrapper:
                  "bg-white/5 border border-white/10 hover:bg-white/8 focus-within:border-blue-500/50",
                input: "text-xs",
              }}
              placeholder="Search users…"
              radius="lg"
              size="sm"
              startContent={
                <svg
                  className="h-3.5 w-3.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  style={{ color: "var(--text-muted)" }}
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
              }
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
              </div>
            ) : mergedUsers.length === 0 ? (
              <p
                className="py-10 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {search ? "No users match your search" : "No registered users"}
              </p>
            ) : (
              <div className="space-y-px p-2">
                {mergedUsers.map((u) => {
                  const activeEntry = activeUsers.find(
                    (a) => a.userId === u.id,
                  );
                  const isSelected = selectedUserId === u.id;
                  const hasLocation = activeEntry
                    ? activeEntry.lat !== null
                    : false;

                  return (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                      role={hasLocation ? "button" : undefined}
                      style={{
                        cursor: hasLocation ? "pointer" : "default",
                        background: isSelected
                          ? "rgba(59,130,246,0.12)"
                          : "transparent",
                        borderLeft: isSelected
                          ? "2px solid #3b82f6"
                          : "2px solid transparent",
                      }}
                      tabIndex={hasLocation ? 0 : undefined}
                      onClick={
                        hasLocation ? () => handleSelectUser(u.id) : undefined
                      }
                      onKeyDown={
                        hasLocation
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ")
                                handleSelectUser(u.id);
                            }
                          : undefined
                      }
                    >
                      {/* Avatar + presence */}
                      <div className="relative">
                        <UserAvatar size={9} user={u} />
                        <span
                          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2"
                          style={{
                            backgroundColor: u.is_online
                              ? "#22c55e"
                              : "#4b5563",
                            borderColor: "var(--bg-card)",
                          }}
                        />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium"
                          style={{ color: "var(--text-strong)" }}
                        >
                          {u.full_name}
                        </p>
                        <p
                          className="truncate text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {u.email}
                        </p>
                        {activeEntry?.itinerary_title ? (
                          <p
                            className="truncate text-[10px]"
                            style={{ color: "#22c55e" }}
                          >
                            📍 {activeEntry.itinerary_title}
                          </p>
                        ) : u.is_online ? (
                          <p
                            className="text-[10px]"
                            style={{ color: "#60a5fa" }}
                          >
                            ● Online
                          </p>
                        ) : (
                          <p
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Joined {formatDate(u.created_at)}
                          </p>
                        )}
                      </div>

                      {/* Itinerary count badge */}
                      {u.itinerary_count > 0 && (
                        <Tooltip
                          classNames={{
                            content:
                              "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                          }}
                          content={`${u.itinerary_count} itinerar${u.itinerary_count === 1 ? "y" : "ies"}`}
                          delay={400}
                          placement="left"
                        >
                          <Chip
                            classNames={{
                              base: "h-5 px-1.5",
                              content: "text-[10px] px-0",
                            }}
                            color="primary"
                            size="sm"
                            variant="flat"
                          >
                            {u.itinerary_count}
                          </Chip>
                        </Tooltip>
                      )}

                      {/* Delete */}
                      <Tooltip
                        classNames={{
                          content:
                            "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                        }}
                        content="Delete user"
                        delay={500}
                        placement="left"
                      >
                        <button
                          className="rounded-lg p-1 transition-all hover:bg-red-500/15"
                          style={{ color: "var(--danger)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(u);
                          }}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                            />
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
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Button
                isDisabled={page <= 1}
                size="sm"
                variant="flat"
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </Button>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {page} / {totalPages}
              </span>
              <Button
                isDisabled={page >= totalPages}
                size="sm"
                variant="flat"
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      <Modal
        classNames={modalClassNames}
        isOpen={!!deleteTarget}
        size="sm"
        onClose={() => setDeleteTarget(null)}
      >
        <ModalContent>
          <ModalHeader>Delete User Account</ModalHeader>
          <ModalBody>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Permanently delete{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-strong)" }}
              >
                {deleteTarget?.full_name}
              </span>
              ? This will remove their account and all associated data. This
              cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button color="danger" isLoading={deleting} onPress={handleDelete}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
