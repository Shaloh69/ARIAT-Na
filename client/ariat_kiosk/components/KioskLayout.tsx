import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";

import { ThemeSwitch } from "@/components/ThemeSwitch";

interface KioskLayoutProps {
  children: ReactNode;
  title?: string;
}

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const WARN_BEFORE_MS = 30 * 1000;

export default function KioskLayout({
  children,
  title = "AIRAT-NA Kiosk",
}: KioskLayoutProps) {
  const router = useRouter();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [clock, setClock] = useState("");

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowIdleWarning(false);
    setCountdown(30);

    warnTimer.current = setTimeout(() => {
      setShowIdleWarning(true);
      setCountdown(30);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);

            return 0;
          }

          return c - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    idleTimer.current = setTimeout(() => {
      setShowIdleWarning(false);
      if (router.pathname !== "/") {
        void router.push("/");
      }
    }, IDLE_TIMEOUT_MS);
  }, [router]);

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

  useEffect(() => {
    const events = ["touchstart", "touchmove", "click", "mousemove", "keydown", "scroll"];
    const passiveOpts = { passive: true };

    events.forEach((ev) => window.addEventListener(ev, resetIdle, passiveOpts));
    resetIdle();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
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

        {/* Top bar */}
        <header className="glass-topbar sticky top-0 z-50 flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <span
              className="text-2xl font-extrabold tracking-tight"
              style={{ color: "var(--red-500)" }}
            >
              AIRAT-NA
            </span>
            <Chip color="primary" size="sm" variant="flat">
              Kiosk Mode
            </Chip>
          </div>
          <div className="flex items-center gap-5">
            {clock && (
              <span
                className="text-base font-mono tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {clock}
              </span>
            )}
            <ThemeSwitch />
          </div>
        </header>

        {/* Page content */}
        <main className="relative z-10">{children}</main>

        {/* Idle warning overlay */}
        {showIdleWarning && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: "rgba(2,6,23,0.93)" }}
          >
            <div
              className="rounded-2xl p-12 text-center"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border-strong)",
                maxWidth: 400,
              }}
            >
              <div
                className="text-8xl font-black mb-4 tabular-nums"
                style={{ color: "var(--red-500)" }}
              >
                {countdown}
              </div>
              <p
                className="text-xl font-semibold mb-2"
                style={{ color: "var(--text-strong)" }}
              >
                Still here?
              </p>
              <p className="text-base mb-8" style={{ color: "var(--text-muted)" }}>
                Returning to home in {countdown} second{countdown !== 1 ? "s" : ""}
              </p>
              <Button color="primary" size="lg" onPress={resetIdle}>
                I&apos;m still here
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
