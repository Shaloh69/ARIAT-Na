import type { ReactNode } from "react";

import { useCallback, useEffect, useState } from "react";

import { API_BASE_URL, API_ENDPOINTS } from "@/lib/constants";

interface AttractScreenProps {
  onDismiss: () => void;
}

interface Destination {
  id: string;
  images?: string[];
  municipality?: string;
  name: string;
}

const SLIDE_INTERVAL_MS = 4000;

const TIPS: string[] = [
  "Plan multi-day trips across Cebu's 5 regions",
  "Scan any QR code to continue on your phone",
  "Discover beaches, mountains, and heritage sites",
  "Get AI-powered itineraries tailored to you",
  "Navigate transit routes in real time",
];

export default function AttractScreen({ onDismiss }: AttractScreenProps) {
  const [images, setImages] = useState<string[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.DESTINATIONS_FEATURED}`,
        );
        const json = (await res.json()) as {
          data: Destination[];
          success: boolean;
        };

        if (json.success && json.data) {
          const imgs = json.data
            .flatMap((d) => d.images ?? [])
            .filter(Boolean)
            .slice(0, 8);

          if (imgs.length > 0) setImages(imgs);
        }
      } catch {
        // silently ignore — use fallback gradient
      }
    };

    void fetchImages();
  }, []);

  useEffect(() => {
    if (images.length < 2) return;

    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setActiveSlide((s) => (s + 1) % images.length);
        setFadeIn(true);
      }, 600);
    }, SLIDE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [images]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  return (
    <div
      className="attract-screen"
      role="button"
      tabIndex={0}
      onClick={handleDismiss}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleDismiss();
      }}
    >
      {/* Background image slideshow */}
      {images.length > 0 && (
        <img
          key={activeSlide}
          alt=""
          className="attract-bg-img"
          src={images[activeSlide]}
          style={{ opacity: fadeIn ? 1 : 0 }}
        />
      )}

      {/* Dark overlay gradient */}
      <div className="attract-overlay" />

      {/* Content */}
      <div className="attract-content">
        {/* Logo */}
        <div className="attract-logo">
          <span className="attract-logo-text">AIRAT-NA</span>
          <span className="attract-logo-sub">Cebu Smart Tourism</span>
        </div>

        {/* Headline */}
        <div className="attract-headline">
          <h1>Discover Cebu</h1>
          <p>Beaches · Mountains · Heritage · Islands</p>
        </div>

        {/* Rotating tip */}
        <div className="attract-tip">
          <span className="attract-tip-icon">✦</span>
          <span key={tipIndex} className="attract-tip-text">
            {TIPS[tipIndex]}
          </span>
        </div>

        {/* Touch prompt */}
        <div className="attract-touch">
          <PulsingDot />
          <span>Touch anywhere to start exploring</span>
        </div>

        {/* Slide dots */}
        {images.length > 1 && (
          <div className="attract-dots">
            {images.map((_, i) => (
              <span
                key={i}
                className="attract-dot"
                style={{ opacity: i === activeSlide ? 1 : 0.3 }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PulsingDot(): ReactNode {
  return (
    <span className="attract-pulse-wrap">
      <span className="attract-pulse-ring" />
      <span className="attract-pulse-dot" />
    </span>
  );
}
