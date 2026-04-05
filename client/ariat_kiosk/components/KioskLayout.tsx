import type { ReactNode } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
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
        <header className="glass-topbar sticky top-0 z-50 flex items-center justify-between px-10 py-0 h-[68px]">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="kiosk-logo-mark" />
              <span className="kiosk-logo-text">AIRAT-NA</span>
            </div>
            <Chip color="primary" size="sm" variant="flat">
              Kiosk Mode
            </Chip>
          </div>

          <div className="flex items-center gap-5">
            {/* Nav links */}
            <nav className="flex items-center gap-1">
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
        <main className="relative z-10">{children}</main>

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
