import { useEffect, useState } from "react";

import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Progress } from "@heroui/progress";
import { QRCodeSVG } from "qrcode.react";

interface QRHandoffModalProps {
  deepLink: string;
  isOpen: boolean;
  subtitle?: string;
  title: string;
  onClose: () => void;
}

const AUTO_CLOSE_SECONDS = 60;

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

  return (
    <Modal
      backdrop="blur"
      classNames={{
        backdrop: "backdrop-blur-md",
        base: "!bg-slate-900/95 border border-white/15 shadow-2xl !backdrop-blur-xl rounded-2xl",
        body: "!bg-transparent !text-slate-200",
        closeButton: "!text-white/70 hover:!text-white hover:!bg-white/10",
        footer: "!bg-transparent border-t border-white/12",
        header: "!bg-transparent border-b border-white/12 !text-white",
      }}
      isOpen={isOpen}
      size="2xl"
      onClose={onClose}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 pt-6">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-1"
            style={{ color: "var(--red-400)" }}
          >
            Start Your Journey
          </p>
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--text-strong)" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="text-sm font-normal"
              style={{ color: "var(--text-muted)" }}
            >
              {subtitle}
            </p>
          )}
        </ModalHeader>

        <ModalBody className="flex flex-col items-center gap-6 py-8">
          {/* QR Code */}
          <div className="rounded-2xl p-5 shadow-xl" style={{ background: "#ffffff" }}>
            <QRCodeSVG
              bgColor="#ffffff"
              fgColor="#0f172a"
              level="M"
              size={260}
              value={deepLink || "airatna://start"}
            />
          </div>

          {/* Instructions */}
          <div className="text-center max-w-sm">
            <p
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--text-strong)" }}
            >
              Scan with your phone camera
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Point your phone camera at the QR code. If the AIRAT-NA app is not
              installed yet, you will be directed to download it first.
            </p>
          </div>

          {/* Store badges */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Chip
              className="px-3 py-1 text-sm"
              size="md"
              startContent={<span>🍎</span>}
              variant="flat"
            >
              App Store
            </Chip>
            <Chip
              className="px-3 py-1 text-sm"
              size="md"
              startContent={<span>▶</span>}
              variant="flat"
            >
              Google Play
            </Chip>
          </div>
        </ModalBody>

        <ModalFooter className="flex flex-col gap-3 pb-6">
          <div className="flex items-center gap-3 w-full">
            <Progress
              aria-label="Auto-close countdown"
              className="flex-1"
              color="primary"
              size="sm"
              value={(countdown / AUTO_CLOSE_SECONDS) * 100}
            />
            <span
              className="text-sm tabular-nums w-8 text-right"
              style={{ color: "var(--text-faint)" }}
            >
              {countdown}s
            </span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-sm" style={{ color: "var(--text-faint)" }}>
              Screen closes automatically
            </span>
            <Button color="primary" size="lg" onPress={onClose}>
              Done
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
