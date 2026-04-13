import Head from "next/head";
import { useEffect, useState } from "react";

type OS = "android" | "ios" | "other";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "other";
}

/**
 * Convert a standard Google Drive share link to a direct download link.
 * Input:  https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * Output: https://drive.google.com/uc?export=download&id=FILE_ID
 */
function toDirectDriveUrl(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  // Already a direct link or unknown format — return as-is
  return url;
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS>("other");
  const [copied, setCopied] = useState(false);

  // Google Drive APK — set NEXT_PUBLIC_APK_URL to your Drive share link or
  // direct download link. The helper above converts share links automatically.
  const rawApkUrl =
    process.env.NEXT_PUBLIC_APK_URL ??
    "https://drive.google.com/file/d/YOUR_FILE_ID/view";

  const APK_URL = toDirectDriveUrl(rawApkUrl);

  useEffect(() => {
    setOs(detectOS());

    // ── Kiosk scan-ping ───────────────────────────────────────────────────────
    // When the download page is opened via a kiosk QR code it will carry a
    // ?kiosk_session=<uuid> query param. Notify the server so the kiosk knows
    // the QR was successfully scanned and can navigate back to its home screen.
    const params = new URLSearchParams(window.location.search);
    const session = params.get("kiosk_session");
    if (session) {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";
      fetch(`${apiBase}/kiosk/scan-ping/${encodeURIComponent(session)}`, {
        method: "POST",
      }).catch(() => {
        // Fire-and-forget — failing silently is fine; kiosk will time-out naturally
      });
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <Head>
        <title>Download AIRAT-NA</title>
        <meta
          name="description"
          content="Download the AIRAT-NA tourist navigation app for Cebu, Philippines."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-600/10 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
          {/* Logo + name */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                AIRAT-NA
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                AI-Powered Tourist Navigation · Cebu
              </p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {["AI Itineraries", "Turn-by-turn Nav", "Offline Maps", "Free"].map(
              (f) => (
                <span
                  key={f}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-300"
                >
                  {f}
                </span>
              ),
            )}
          </div>

          {/* Download buttons */}
          <div className="w-full flex flex-col gap-3">
            {/* ── Android APK (Google Drive) — primary ── */}
            <a
              href={APK_URL}
              rel="noopener noreferrer"
              className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl font-semibold transition-all active:scale-95 ${
                os === "android"
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30"
                  : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
              }`}
            >
              {/* Android icon */}
              <svg
                className="w-7 h-7 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A5.84 5.84 0 0 0 12 1.5c-.71 0-1.39.13-2.04.37L8.48.39c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.3 1.3A5.958 5.958 0 0 0 6 7h12a5.958 5.958 0 0 0-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
              </svg>
              <div className="text-left">
                <div className="text-xs opacity-75">
                  {os === "android" ? "Detected Android · " : ""}
                  Google Drive
                </div>
                <div className="text-sm font-semibold leading-tight">
                  Download APK (Android)
                </div>
              </div>
              {os === "android" && (
                <svg
                  className="w-4 h-4 ml-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              )}
            </a>

            {/* ── Google Play — coming soon ── */}
            <div className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/8 text-white/40 cursor-not-allowed select-none">
              <svg
                className="w-7 h-7 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3.18 23.76c.3.17.65.19.97.07l12.01-6.93-2.59-2.59-10.39 9.45zM.5 1.25C.19 1.58 0 2.08 0 2.72v18.56c0 .64.19 1.14.5 1.47l.08.08 10.4-10.4v-.24L.58 1.17.5 1.25zm16.53 10.4L13.8 8.43 3.18.24C2.86.12 2.51.14 2.21.31l14.82 11.34zM23.5 9.32l-3.27-1.89-2.9 2.9 2.9 2.9 3.3-1.9c.94-.54.94-1.43-.03-2.01z" />
              </svg>
              <div className="text-left">
                <div className="text-xs opacity-60">Coming soon</div>
                <div className="text-sm font-semibold leading-tight opacity-60">
                  Google Play Store
                </div>
              </div>
            </div>

            {/* ── App Store — coming soon ── */}
            <div className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/8 text-white/40 cursor-not-allowed select-none">
              <svg
                className="w-7 h-7 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left">
                <div className="text-xs opacity-60">Coming soon</div>
                <div className="text-sm font-semibold leading-tight opacity-60">
                  App Store (iOS)
                </div>
              </div>
            </div>
          </div>

          {/* Installation note for Android */}
          <div className="w-full rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-300/80 space-y-1">
            <p className="font-semibold text-amber-300">
              📋 Android installation note
            </p>
            <p>
              After downloading, open the APK file and tap{" "}
              <strong>Install</strong>. Android may ask you to allow installs
              from unknown sources — tap <strong>Settings → Allow</strong>, then
              go back and install.
            </p>
          </div>

          {/* Share link */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {copied ? "Link copied!" : "Copy download link"}
          </button>

          <p className="text-slate-600 text-xs text-center">
            AIRAT-NA · Cebu Tourist Navigation · Version 1.0
          </p>
        </div>
      </div>
    </>
  );
}
