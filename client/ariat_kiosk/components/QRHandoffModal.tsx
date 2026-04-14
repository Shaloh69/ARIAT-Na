import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { QRCodeSVG } from "qrcode.react";

import {
  API_BASE_URL,
  API_ENDPOINTS,
  DOWNLOAD_PAGE_URL,
} from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QRHandoffModalProps {
  deepLink: string;
  isOpen: boolean;
  /** When mode="download" the modal shows a disclaimer before the QR. */
  mode?: "default" | "download";
  subtitle?: string;
  title: string;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_CLOSE_SECONDS = 60;

const STEPS = [
  { icon: "📱", label: "Open your phone camera" },
  { icon: "🎯", label: "Point at the QR code" },
  { icon: "✨", label: "The app opens automatically" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function QRHandoffModal({
  deepLink,
  isOpen,
  mode = "default",
  subtitle,
  title,
  onClose,
}: QRHandoffModalProps) {
  const router = useRouter();

  // "disclaimer" → shown before QR in download mode
  // "qr"         → QR code screen (always shown in default mode)
  const [step, setStep] = useState<"disclaimer" | "qr">(
    mode === "download" ? "disclaimer" : "qr",
  );
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS);
  const [scanDetected, setScanDetected] = useState(false);

  // Unique session ID for download scan-ping
  const sessionId = useRef<string>("");

  // Build the QR value: for download mode point to the /download page with session; else use deepLink
  const qrValue =
    mode === "download"
      ? `${DOWNLOAD_PAGE_URL}?kiosk_session=${sessionId.current}`
      : deepLink || "airatna://start";

  // ── Reset on open/close ────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setStep(mode === "download" ? "disclaimer" : "qr");
      setCountdown(AUTO_CLOSE_SECONDS);
      setScanDetected(false);
      if (mode === "download") {
        sessionId.current = crypto.randomUUID();
      }
    }
  }, [isOpen, mode]);

  // ── Countdown (only runs on QR step) ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen || step !== "qr") return;

    setCountdown(AUTO_CLOSE_SECONDS);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onClose();

          return 0;
        }

        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, step, onClose]);

  // ── Scan-ping polling (download mode only, after disclaimer accepted) ──────
  const pollScan = useCallback(async () => {
    if (!sessionId.current) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.KIOSK_SCAN_PING}/${sessionId.current}`,
      );
      const json = (await res.json()) as { scanned: boolean; success: boolean };

      if (json.scanned) {
        setScanDetected(true);
      }
    } catch {
      // Polling errors are non-fatal — try again next tick
    }
  }, []);

  useEffect(() => {
    if (!isOpen || mode !== "download" || step !== "qr") return;

    // Poll immediately, then every 2 seconds
    void pollScan();
    const interval = setInterval(() => void pollScan(), 2000);

    return () => clearInterval(interval);
  }, [isOpen, mode, step, pollScan]);

  // ── Detected scan → navigate home ─────────────────────────────────────────
  useEffect(() => {
    if (!scanDetected) return;

    // Brief visual pause so the user sees "Scanned!" state, then go home
    const t = setTimeout(() => {
      onClose();
      void router.push("/");
    }, 1800);

    return () => clearTimeout(t);
  }, [scanDetected, onClose, router]);

  // ── SVG ring values ────────────────────────────────────────────────────────
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const progress = (countdown / AUTO_CLOSE_SECONDS) * circ;

  // ── Disclaimer screen ──────────────────────────────────────────────────────
  const DisclaimerBody = (
    <>
      <ModalHeader className="flex flex-col gap-1 pt-7 px-8">
        <p className="qr-label-tag">Before You Download</p>
        <h2 className="qr-title">Download AIRAT-NA</h2>
        <p className="qr-subtitle">Please read before proceeding</p>
      </ModalHeader>

      <ModalBody className="px-8 py-6 space-y-5">
        {/* Dev notice card */}
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{
            background: "rgba(234,179,8,0.08)",
            border: "1px solid rgba(234,179,8,0.25)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏫</span>
            <p className="font-bold text-base" style={{ color: "#fde047" }}>
              University of Cebu — Lapu-Lapu &amp; Mandaue
            </p>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            AIRAT-NA is a{" "}
            <strong style={{ color: "white" }}>thesis project</strong> developed
            by students of UCLM. This application is currently{" "}
            <strong style={{ color: "white" }}>under development</strong> and
            has{" "}
            <strong style={{ color: "white" }}>
              not been officially published
            </strong>{" "}
            to the Google Play Store or Apple App Store.
          </p>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            The APK is distributed directly for{" "}
            <strong style={{ color: "white" }}>
              testing and academic evaluation
            </strong>{" "}
            only. Your device and data are safe — the app only accesses your
            location (for navigation) and does not collect personal information
            beyond what you choose to provide.
          </p>
        </div>

        {/* What to expect */}
        <div className="space-y-2">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            What happens next
          </p>
          {[
            { icon: "📲", text: "Scan the QR code with your phone camera" },
            { icon: "📥", text: "Download the APK from Google Drive" },
            {
              icon: "⚙️",
              text: "Allow installation from unknown sources when prompted",
            },
            { icon: "🗺️", text: "Open AIRAT-NA and explore Cebu!" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 qr-step">
              <div className="qr-step-num">{i + 1}</div>
              <span className="qr-step-icon">{item.icon}</span>
              <span className="qr-step-label">{item.text}</span>
            </div>
          ))}
        </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center px-8 pb-7">
        <Button
          className="h-12 px-6 text-base"
          variant="flat"
          onPress={onClose}
        >
          Cancel
        </Button>
        <Button
          className="h-12 px-10 text-base font-bold"
          color="primary"
          size="lg"
          onPress={() => setStep("qr")}
        >
          Proceed →
        </Button>
      </ModalFooter>
    </>
  );

  // ── QR screen ──────────────────────────────────────────────────────────────
  const QRBody = (
    <>
      <ModalHeader className="flex flex-col gap-1 pt-7 px-8">
        <p className="qr-label-tag">
          {mode === "download" ? "Download the App" : "Start Your Journey"}
        </p>
        <h2 className="qr-title">{title}</h2>
        {subtitle && <p className="qr-subtitle">{subtitle}</p>}
      </ModalHeader>

      <ModalBody className="flex flex-row items-center gap-10 px-8 py-8">
        {/* ── QR code ──────────────────────────────────────────────────────── */}
        <div className="qr-code-wrap">
          {/* Pulsing rings */}
          <div className="qr-pulse-ring qr-pulse-ring-1" />
          <div className="qr-pulse-ring qr-pulse-ring-2" />
          {/* White QR card */}
          <div
            className="qr-card"
            style={
              scanDetected
                ? { outline: "3px solid #22c55e", outlineOffset: "4px" }
                : undefined
            }
          >
            <QRCodeSVG
              bgColor="#ffffff"
              fgColor="#0f172a"
              level="M"
              size={280}
              value={qrValue}
            />
          </div>
          {/* Countdown ring / scan detected indicator */}
          <div className="qr-countdown-ring">
            {scanDetected ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl">✅</span>
                <span className="text-xs font-semibold text-green-400">
                  Scanned!
                </span>
              </div>
            ) : (
              <>
                <svg height={64} width={64}>
                  <circle
                    cx={32}
                    cy={32}
                    fill="none"
                    r={radius}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={4}
                  />
                  <circle
                    cx={32}
                    cy={32}
                    fill="none"
                    r={radius}
                    stroke="#e11d48"
                    strokeDasharray={`${progress} ${circ}`}
                    strokeLinecap="round"
                    strokeWidth={4}
                    style={{
                      transform: "rotate(-90deg)",
                      transformOrigin: "50% 50%",
                      transition: "stroke-dasharray 1s linear",
                    }}
                  />
                </svg>
                <span className="qr-countdown-num">{countdown}</span>
              </>
            )}
          </div>
        </div>

        {/* ── Instructions ─────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-6">
          {mode === "download" ? (
            <>
              <div>
                <p className="qr-scan-headline">
                  {scanDetected
                    ? "QR Scanned — Returning home…"
                    : "Scan to download the app"}
                </p>
                <p className="qr-scan-sub">
                  Point your phone camera at the QR code. You&apos;ll be taken
                  to a download page where you can get the APK directly from
                  Google Drive.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  { icon: "📷", label: "Scan with your camera" },
                  { icon: "📥", label: "Download the APK" },
                  { icon: "⚙️", label: "Allow unknown sources & install" },
                ].map((step, i) => (
                  <div key={i} className="qr-step">
                    <div className="qr-step-num">{i + 1}</div>
                    <span className="qr-step-icon">{step.icon}</span>
                    <span className="qr-step-label">{step.label}</span>
                  </div>
                ))}
              </div>
              {/* Dev badge */}
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{
                  background: "rgba(234,179,8,0.1)",
                  color: "rgba(253,224,71,0.8)",
                }}
              >
                🏫 UCLM Thesis Project · Under Development
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="qr-scan-headline">Scan with your phone camera</p>
                <p className="qr-scan-sub">
                  No app yet? You&apos;ll be taken to the App Store or Google
                  Play to install AIRAT-NA first.
                </p>
              </div>
              <div className="space-y-4">
                {STEPS.map((s, i) => (
                  <div key={i} className="qr-step">
                    <div className="qr-step-num">{i + 1}</div>
                    <span className="qr-step-icon">{s.icon}</span>
                    <span className="qr-step-label">{s.label}</span>
                  </div>
                ))}
              </div>
              {/* Store badges */}
              <div className="flex gap-3">
                <div className="qr-store-badge">
                  <span className="text-xl">🍎</span>
                  <div>
                    <p className="text-[10px] opacity-60 leading-none">
                      Coming soon
                    </p>
                    <p className="text-sm font-semibold leading-tight">
                      App Store
                    </p>
                  </div>
                </div>
                <div className="qr-store-badge">
                  <span className="text-xl">▶</span>
                  <div>
                    <p className="text-[10px] opacity-60 leading-none">
                      Coming soon
                    </p>
                    <p className="text-sm font-semibold leading-tight">
                      Google Play
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center px-8 pb-7">
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          {scanDetected
            ? "Heading back to home screen…"
            : `Closes automatically in ${countdown} second${countdown !== 1 ? "s" : ""}`}
        </p>
        <Button
          className="h-12 px-8 text-base font-semibold"
          color="primary"
          size="lg"
          onPress={onClose}
        >
          Done
        </Button>
      </ModalFooter>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      backdrop="blur"
      classNames={{
        backdrop: "backdrop-blur-xl bg-black/70",
        base: "!bg-slate-900/96 border border-white/10 shadow-2xl rounded-3xl max-w-2xl w-full",
        body: "!bg-transparent",
        closeButton:
          "!text-white/60 hover:!text-white hover:!bg-white/10 rounded-xl",
        footer: "!bg-transparent border-t border-white/8",
        header: "!bg-transparent border-b border-white/8",
      }}
      isOpen={isOpen}
      size="2xl"
      onClose={onClose}
    >
      <ModalContent>
        {step === "disclaimer" ? DisclaimerBody : QRBody}
      </ModalContent>
    </Modal>
  );
}
