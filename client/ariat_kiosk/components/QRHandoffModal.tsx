import { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { QRCodeSVG } from "qrcode.react";

interface QRHandoffModalProps {
  deepLink: string;
  isOpen: boolean;
  subtitle?: string;
  title: string;
  onClose: () => void;
}

const AUTO_CLOSE_SECONDS = 60;

const STEPS = [
  { icon: "📱", label: "Open your phone camera" },
  { icon: "🎯", label: "Point at the QR code" },
  { icon: "✨", label: "The app opens automatically" },
];

export default function QRHandoffModal({
  deepLink,
  isOpen,
  subtitle,
  title,
  onClose,
}: QRHandoffModalProps) {
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(AUTO_CLOSE_SECONDS);

      return;
    }

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
  }, [isOpen, onClose]);

  // SVG ring values
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const progress = (countdown / AUTO_CLOSE_SECONDS) * circ;

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
        <ModalHeader className="flex flex-col gap-1 pt-7 px-8">
          <p className="qr-label-tag">Start Your Journey</p>
          <h2 className="qr-title">{title}</h2>
          {subtitle && <p className="qr-subtitle">{subtitle}</p>}
        </ModalHeader>

        <ModalBody className="flex flex-row items-center gap-10 px-8 py-8">
          {/* ── QR code ──────────────────────────────────────────── */}
          <div className="qr-code-wrap">
            {/* Pulsing rings */}
            <div className="qr-pulse-ring qr-pulse-ring-1" />
            <div className="qr-pulse-ring qr-pulse-ring-2" />
            {/* White QR card */}
            <div className="qr-card">
              <QRCodeSVG
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="M"
                size={280}
                value={deepLink || "airatna://start"}
              />
            </div>
            {/* Countdown ring under QR */}
            <div className="qr-countdown-ring">
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
            </div>
          </div>

          {/* ── Instructions ─────────────────────────────────────── */}
          <div className="flex-1 space-y-6">
            <div>
              <p className="qr-scan-headline">Scan with your phone camera</p>
              <p className="qr-scan-sub">
                No app yet? You&apos;ll be taken to the App Store or Google Play
                to install AIRAT-NA first.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {STEPS.map((step, i) => (
                <div key={i} className="qr-step">
                  <div className="qr-step-num">{i + 1}</div>
                  <span className="qr-step-icon">{step.icon}</span>
                  <span className="qr-step-label">{step.label}</span>
                </div>
              ))}
            </div>

            {/* Store badges */}
            <div className="flex gap-3">
              <div className="qr-store-badge">
                <span className="text-xl">🍎</span>
                <div>
                  <p className="text-[10px] opacity-60 leading-none">
                    Download on the
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
                    Get it on
                  </p>
                  <p className="text-sm font-semibold leading-tight">
                    Google Play
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ModalBody>

        <ModalFooter className="flex justify-between items-center px-8 pb-7">
          <p className="text-sm" style={{ color: "var(--text-faint)" }}>
            Closes automatically in {countdown} second
            {countdown !== 1 ? "s" : ""}
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
      </ModalContent>
    </Modal>
  );
}
