import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Tooltip } from "@heroui/tooltip";
import { Divider } from "@heroui/divider";

import AdminLayout from "@/layouts/admin";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { apiClient } from "@/lib/api";
import { API_ENDPOINTS } from "@/lib/constants";
import { useAdminSocket } from "@/lib/hooks/useAdminSocket";
import { useAuthStore } from "@/lib/store/auth-store";
import type { AdminTeamMember } from "@/types/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleBadge(role: string) {
  if (role === "super_admin")
    return <Chip size="sm" color="danger" variant="flat">Super Admin</Chip>;
  if (role === "moderator")
    return <Chip size="sm" color="warning" variant="flat">Moderator</Chip>;
  return <Chip size="sm" color="primary" variant="flat">Admin</Chip>;
}

function AdminAvatar({ member, size = 10 }: { member: { full_name: string; profile_image_url?: string | null }; size?: number }) {
  const cls = `h-${size} w-${size} rounded-full`;
  if (member.profile_image_url)
    return <img src={member.profile_image_url} alt={member.full_name} className={`${cls} object-cover`} />;
  return (
    <div
      className={`${cls} flex items-center justify-center text-sm font-bold`}
      style={{ backgroundColor: "rgba(244,63,94,0.12)", color: "var(--red-600)" }}
    >
      {member.full_name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { admin } = useAuthStore();
  const isSuperAdmin = admin?.role === "super_admin";

  // Team list
  const [members, setMembers] = useState<AdminTeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", full_name: "", password: "", role: "admin" });
  const [creating, setCreating] = useState(false);

  // Deactivate / Reactivate confirm modal
  const [confirmTarget, setConfirmTarget] = useState<{ member: AdminTeamMember; action: "deactivate" | "reactivate" } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Chat
  const { isConnected, onlineAdmins, messages, socketError, sendMessage, setMessages } = useAdminSocket();
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  // ── Fetch team ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMembers();
  }, []);

  // ── Load chat history on mount ──────────────────────────────────────────────
  useEffect(() => {
    apiClient
      .get<{ id: string; admin_id: string; admin_name: string; profile_image_url: string | null; message: string; created_at: string }[]>(
        API_ENDPOINTS.ADMIN_TEAM_CHAT
      )
      .then((res) => {
        if (res.success && res.data) {
          setMessages(res.data);
        }
      })
      .catch(() => {/* non-fatal */});
  }, [setMessages]);

  // ── Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMembers = async () => {
    try {
      setLoadingMembers(true);
      const res = await apiClient.get<AdminTeamMember[]>(API_ENDPOINTS.ADMIN_TEAM);
      if (res.success && res.data) setMembers(res.data);
    } catch {
      toast.error("Failed to load team members");
    } finally {
      setLoadingMembers(false);
    }
  };

  // ── Create admin ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.email.trim()) return toast.error("Email is required");
    if (!createForm.full_name.trim()) return toast.error("Full name is required");
    if (createForm.password.length < 8) return toast.error("Password must be at least 8 characters");

    try {
      setCreating(true);
      const res = await apiClient.post<AdminTeamMember>(API_ENDPOINTS.ADMIN_TEAM, createForm);
      if (res.success) {
        toast.success(`Account created for ${createForm.full_name}`);
        setIsCreateOpen(false);
        setCreateForm({ email: "", full_name: "", password: "", role: "admin" });
        fetchMembers();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Failed to create admin";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  // ── Deactivate / Reactivate ─────────────────────────────────────────────────
  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    const { member, action } = confirmTarget;
    try {
      setConfirming(true);
      const url = `${API_ENDPOINTS.ADMIN_TEAM}/${member.id}/${action}`;
      const res = await apiClient.patch(url);
      if (res.success) {
        toast.success(action === "deactivate" ? "Account deactivated" : "Account reactivated");
        setConfirmTarget(null);
        fetchMembers();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || `Failed to ${action} account`;
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  };

  // ── Send chat ───────────────────────────────────────────────────────────────
  const handleSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    if (text.length > 2000) return toast.error("Message too long (max 2000 characters)");
    if (!isConnected) return toast.error("Not connected to chat server");
    sendMessage(text);
    setChatInput("");
  };

  const handleChatKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <Head><title>Team — AIRAT-NA Admin</title></Head>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Team Members ─────────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: "var(--text-strong)" }}>
                Admin Team
              </h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {members.length} member{members.length !== 1 ? "s" : ""} &bull; {onlineAdmins.length} online now
              </p>
            </div>
            {isSuperAdmin && (
              <Button color="danger" size="sm" onPress={() => setIsCreateOpen(true)}>
                + Add Admin
              </Button>
            )}
          </div>

          {loadingMembers ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-red-500" />
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => {
                const isOnline = onlineAdmins.some((o) => o.adminId === m.id);
                return (
                  <Card key={m.id} className="glass-card border border-white/10">
                    <CardBody className="py-3 px-4">
                      <div className="flex items-center gap-4">
                        {/* Avatar + presence dot */}
                        <div className="relative flex-shrink-0">
                          <AdminAvatar member={m} size={10} />
                          <span
                            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2"
                            style={{
                              backgroundColor: isOnline ? "#22c55e" : "#6b7280",
                              borderColor: "var(--bg-card)",
                            }}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm" style={{ color: "var(--text-strong)" }}>
                              {m.full_name}
                            </span>
                            {roleBadge(m.role)}
                            {!m.is_active && (
                              <Chip size="sm" color="default" variant="flat">Deactivated</Chip>
                            )}
                          </div>
                          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{m.email}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {isOnline
                              ? "Online now"
                              : m.last_seen_at
                              ? `Last seen ${formatTime(m.last_seen_at)}`
                              : "Never seen"}
                          </p>
                        </div>

                        {/* Actions — super_admin only, cannot act on themselves or other super_admin */}
                        {isSuperAdmin && m.id !== admin?.id && m.role !== "super_admin" && (
                          <div className="flex-shrink-0">
                            <Tooltip
                              classNames={{ content: "bg-slate-800 text-white border border-white/10 shadow-lg text-xs" }}
                              content={m.is_active ? "Deactivate account" : "Reactivate account"}
                              delay={500}
                              placement="left"
                            >
                              <Button
                                size="sm"
                                variant="flat"
                                color={m.is_active ? "danger" : "success"}
                                onPress={() => setConfirmTarget({ member: m, action: m.is_active ? "deactivate" : "reactivate" })}
                              >
                                {m.is_active ? "Deactivate" : "Reactivate"}
                              </Button>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Group Chat ──────────────────────────────────────────────── */}
        <div className="xl:col-span-1">
          <Card className="glass-card border border-white/10 h-full" style={{ minHeight: 520 }}>
            <CardHeader className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: "var(--text-strong)" }}>
                  Team Chat
                </h3>
                <p className="text-xs" style={{ color: isConnected ? "#22c55e" : "var(--text-muted)" }}>
                  {isConnected ? "Connected" : socketError ? `Error: ${socketError}` : "Connecting..."}
                </p>
              </div>
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: isConnected ? "#22c55e" : "#6b7280" }}
              />
            </CardHeader>

            {/* Messages */}
            <CardBody className="flex flex-col p-0 overflow-hidden" style={{ height: 380 }}>
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-center text-xs py-8" style={{ color: "var(--text-muted)" }}>
                    No messages yet. Say hi!
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.admin_id === admin?.id;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {msg.profile_image_url ? (
                            <img
                              src={msg.profile_image_url}
                              alt={msg.admin_name}
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ backgroundColor: "rgba(244,63,94,0.12)", color: "var(--red-600)" }}
                            >
                              {msg.admin_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Bubble */}
                        <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                          {!isMine && (
                            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                              {msg.admin_name}
                            </span>
                          )}
                          <div
                            className="px-3 py-2 rounded-2xl text-sm break-words"
                            style={
                              isMine
                                ? { backgroundColor: "var(--red-600)", color: "#fff" }
                                : { backgroundColor: "rgba(255,255,255,0.08)", color: "var(--text-strong)" }
                            }
                          >
                            {msg.message}
                          </div>
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <Divider />

              {/* Input */}
              <div className="flex items-center gap-2 px-3 py-3">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKey}
                  placeholder="Type a message…"
                  size="sm"
                  radius="full"
                  classNames={{
                    inputWrapper: "bg-white/5 border border-white/10 hover:bg-white/10 focus-within:border-red-500/60",
                    input: "text-sm",
                  }}
                  isDisabled={!isConnected}
                />
                <Button
                  isIconOnly
                  size="sm"
                  color="danger"
                  radius="full"
                  isDisabled={!isConnected || !chatInput.trim()}
                  onPress={handleSend}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ── Create Admin Modal ────────────────────────────────────────────────── */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} classNames={modalClassNames} size="md">
        <ModalContent>
          <ModalHeader>Create Admin Account</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Full Name"
                placeholder="e.g. Juan dela Cruz"
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                classNames={{ inputWrapper: "bg-white/5 border border-white/10" }}
              />
              <Input
                label="Email"
                type="email"
                placeholder="admin@example.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                classNames={{ inputWrapper: "bg-white/5 border border-white/10" }}
              />
              <Input
                label="Password"
                type="password"
                placeholder="Min. 8 characters"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                classNames={{ inputWrapper: "bg-white/5 border border-white/10" }}
              />
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>Role</p>
                <div className="flex gap-2">
                  {["admin", "moderator"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setCreateForm({ ...createForm, role: r })}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={
                        createForm.role === r
                          ? { backgroundColor: "var(--red-600)", color: "#fff" }
                          : { backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }
                      }
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  The new admin will be prompted to change this password on first login.
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button color="danger" isLoading={creating} onPress={handleCreate}>Create Account</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Deactivate / Reactivate Confirm Modal ────────────────────────────── */}
      <Modal isOpen={!!confirmTarget} onClose={() => setConfirmTarget(null)} classNames={modalClassNames} size="sm">
        <ModalContent>
          <ModalHeader>{confirmTarget?.action === "deactivate" ? "Deactivate Account" : "Reactivate Account"}</ModalHeader>
          <ModalBody>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {confirmTarget?.action === "deactivate"
                ? `Are you sure you want to deactivate ${confirmTarget.member.full_name}? They will no longer be able to log in.`
                : `Reactivate ${confirmTarget?.member.full_name}? They will regain access to the admin panel.`}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmTarget(null)}>Cancel</Button>
            <Button
              color={confirmTarget?.action === "deactivate" ? "danger" : "success"}
              isLoading={confirming}
              onPress={handleConfirmAction}
            >
              {confirmTarget?.action === "deactivate" ? "Deactivate" : "Reactivate"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
