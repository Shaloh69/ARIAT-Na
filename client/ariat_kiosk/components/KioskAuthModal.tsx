import { useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";

import { API_BASE_URL } from "@/lib/constants";

export interface KioskAuthUser {
  email: string;
  name: string;
  token: string;
}

interface KioskAuthModalProps {
  isOpen: boolean;
  onAuth: (user: KioskAuthUser) => void;
  onClose: () => void;
  onSkip?: () => void;
}

type Tab = "register" | "login";

export default function KioskAuthModal({
  isOpen,
  onAuth,
  onClose,
  onSkip,
}: KioskAuthModalProps) {
  const [tab, setTab] = useState<Tab>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");

      return;
    }
    if (tab === "register" && !name.trim()) {
      setError("Name is required.");

      return;
    }
    if (
      password.length < 8 ||
      !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)
    ) {
      setError(
        "Password needs 8+ chars with uppercase, lowercase, and a number (e.g. Cebu2026).",
      );

      return;
    }

    setLoading(true);
    try {
      const endpoint =
        tab === "register" ? "/auth/user/register" : "/auth/user/login";

      const body: Record<string, string> =
        tab === "register"
          ? { email: email.trim(), full_name: name.trim(), password }
          : { email: email.trim(), password };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: {
          accessToken: string;
          user: { full_name: string; email: string };
        };
      };

      if (!json.success || !json.data?.accessToken) {
        throw new Error(
          json.message ??
            (tab === "register" ? "Registration failed" : "Login failed"),
        );
      }

      reset();
      onAuth({
        token: json.data.accessToken,
        email: json.data.user.email,
        name: json.data.user.full_name,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      backdrop="blur"
      classNames={{
        backdrop: "backdrop-blur-xl bg-black/70",
        base: "!bg-slate-900/96 border border-white/10 shadow-2xl rounded-3xl max-w-md w-full",
        body: "!bg-transparent",
        closeButton:
          "!text-white/60 hover:!text-white hover:!bg-white/10 rounded-xl",
        footer: "!bg-transparent border-t border-white/8",
        header: "!bg-transparent border-b border-white/8",
      }}
      isOpen={isOpen}
      size="md"
      onClose={handleClose}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 pt-6 px-7">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--red-500)" }}
          >
            One more step
          </p>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--text-strong)" }}
          >
            Save Your Itinerary
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Create a free account so your trip is waiting in the app when you
            install it.
          </p>
        </ModalHeader>

        <ModalBody className="px-7 py-5 space-y-4">
          {/* Tab switcher */}
          <div
            className="flex rounded-xl overflow-hidden border"
            style={{ borderColor: "var(--border)" }}
          >
            {(["register", "login"] as Tab[]).map((t) => (
              <button
                key={t}
                className="flex-1 py-2 text-sm font-semibold transition-all"
                style={{
                  background: tab === t ? "var(--red-500)" : "transparent",
                  color: tab === t ? "#fff" : "var(--text-muted)",
                }}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
              >
                {t === "register" ? "New Account" : "I Have an Account"}
              </button>
            ))}
          </div>

          {tab === "register" && (
            <Input
              classNames={{ inputWrapper: "bg-white/5 border border-white/10" }}
              label="Your Name"
              placeholder="e.g. Maria Santos"
              value={name}
              onValueChange={setName}
            />
          )}

          <Input
            classNames={{ inputWrapper: "bg-white/5 border border-white/10" }}
            label="Email"
            placeholder="you@email.com"
            type="email"
            value={email}
            onValueChange={setEmail}
          />

          <Input
            classNames={{ inputWrapper: "bg-white/5 border border-white/10" }}
            label="Password"
            placeholder="e.g. Cebu2026 (upper, lower, number)"
            type="password"
            value={password}
            onValueChange={setPassword}
          />

          {error && (
            <p
              className="text-sm text-center rounded-xl px-4 py-2"
              style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e" }}
            >
              {error}
            </p>
          )}
        </ModalBody>

        <ModalFooter className="flex flex-col gap-3 px-7 pb-6">
          <div className="flex justify-between items-center w-full">
            <Button variant="flat" onPress={handleClose}>
              Cancel
            </Button>
            <Button
              className="px-8 font-bold"
              color="primary"
              isLoading={loading}
              onPress={() => void handleSubmit()}
            >
              {tab === "register"
                ? "Create Account & Continue →"
                : "Login & Continue →"}
            </Button>
          </div>
          {onSkip && (
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
          )}
          {onSkip && (
            <Button
              className="w-full"
              variant="flat"
              onPress={() => { handleClose(); onSkip(); }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Continue as Guest — trip won&apos;t be saved to an account
              </span>
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
