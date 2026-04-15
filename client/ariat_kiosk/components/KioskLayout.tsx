import type { ReactNode } from "react";

import { useCallback, useEffect, useRef, useState } from "react";

export const FOOTER_H = 36; // px — collapsed footer height (exported for hero sizing)
export const TOPBAR_H = 52; // px — top bar height (exported for hero sizing)
import Head from "next/head";
import { useRouter } from "next/router";
import { Chip } from "@heroui/chip";

import AttractScreen from "@/components/AttractScreen";
import { ThemeSwitch } from "@/components/ThemeSwitch";

interface KioskLayoutProps {
  children: ReactNode;
  title?: string;
}

const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes → attract screen

export default function KioskLayout({
  children,
  title = "AIRAT-NA Kiosk",
}: KioskLayoutProps) {
  const router = useRouter();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAttract, setShowAttract] = useState(false);
  const [clock, setClock] = useState("");
  const [footerOpen, setFooterOpen] = useState(false);

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setShowAttract(false);

    idleTimer.current = setTimeout(() => {
      setShowAttract(true);
    }, IDLE_TIMEOUT_MS);
  }, []);

  const handleAttractDismiss = useCallback(() => {
    setShowAttract(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);

    // Reset idle timer, navigate home
    if (router.pathname !== "/") {
      void router.push("/");
    }

    idleTimer.current = setTimeout(() => {
      setShowAttract(true);
    }, IDLE_TIMEOUT_MS);
  }, [router]);

  // Clock — update every 10s in PH timezone
  useEffect(() => {
    const updateClock = () =>
      setClock(
        new Date().toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );

    updateClock();
    const interval = setInterval(updateClock, 10_000);

    return () => clearInterval(interval);
  }, []);

  // Idle detection
  useEffect(() => {
    const events = [
      "touchstart",
      "touchmove",
      "click",
      "mousemove",
      "keydown",
      "scroll",
    ];
    const passiveOpts = { passive: true };

    events.forEach((ev) => window.addEventListener(ev, resetIdle, passiveOpts));
    resetIdle();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
          name="viewport"
        />
      </Head>

      <div className="relative min-h-screen overflow-hidden">
        <div className="bg-animated" />
        <div className="bg-noise" />

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <header className="glass-topbar sticky top-0 z-50 flex items-center justify-between px-6 py-0 h-[52px]">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="kiosk-logo-mark" />
              <span className="kiosk-logo-text">AIRAT-NA</span>
            </div>
            <Chip color="primary" size="sm" variant="flat">
              Kiosk Mode
            </Chip>
          </div>

          <div className="flex items-center gap-3">
            {/* Nav links */}
            <nav className="flex items-center gap-0.5">
              <NavLink
                active={router.pathname === "/"}
                label="Home"
                onClick={() => void router.push("/")}
              />
              <NavLink
                active={router.pathname === "/map"}
                label="Map"
                onClick={() => void router.push("/map")}
              />
              <NavLink
                active={router.pathname === "/explore"}
                label="Explore"
                onClick={() => void router.push("/explore")}
              />
            </nav>

            {clock && <span className="kiosk-clock">{clock}</span>}
            <ThemeSwitch />
          </div>
        </header>

        {/* ── Page content ────────────────────────────────────────────── */}
        <main className="relative z-10" style={{ paddingBottom: FOOTER_H }}>
          {children}
        </main>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer
          className="kiosk-footer"
          style={{ height: footerOpen ? 84 : FOOTER_H }}
        >
          {/* Collapsed bar (always visible) */}
          <div className="kiosk-footer-bar">
            <span className="kiosk-footer-brand">
              <span style={{ color: "var(--red-500)", fontWeight: 800 }}>AIRAT-NA</span>
              <span style={{ opacity: 0.45, margin: "0 8px" }}>·</span>
              <span style={{ opacity: 0.5, fontSize: "0.78rem" }}>AI-Assisted Tourism</span>
            </span>
            <span className="kiosk-footer-loc">📍 Cebu, Philippines</span>
            <button
              aria-label={footerOpen ? "Collapse footer" : "Expand footer"}
              className="kiosk-footer-toggle"
              type="button"
              onClick={() => setFooterOpen((v) => !v)}
            >
              {footerOpen ? "▼" : "▲"}
            </button>
          </div>

          {/* Expanded content */}
          {footerOpen && (
            <div className="kiosk-footer-expanded">
              <p style={{ opacity: 0.55, fontSize: "0.78rem" }}>
                Scan any destination card to continue exploring on the AIRAT-NA mobile app.
                Available on iOS &amp; Android.
              </p>
              <p style={{ opacity: 0.35, fontSize: "0.72rem" }}>
                © 2026 AIRAT-NA · Thesis Project · University of Cebu Lapu-Lapu and Mandaue
              </p>
            </div>
          )}
        </footer>

        {/* ── Attract / idle screen ───────────────────────────────────── */}
        {showAttract && (
          <div className="fixed inset-0 z-[9999]">
            <AttractScreen onDismiss={handleAttractDismiss} />
          </div>
        )}
      </div>
    </>
  );
}

function NavLink({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="kiosk-nav-link"
      data-active={active}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
