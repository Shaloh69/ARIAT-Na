import Head from "next/head";
import { useEffect, useState } from "react";

export default function OpenPage() {
  const [token, setToken] = useState<string | null>(null);

  const APK_URL =
    process.env.NEXT_PUBLIC_APK_URL ??
    "https://drive.google.com/uc?export=download&id=1jjGwUvms_EM7-vYXXVBNcRRWZE1h8XbQ";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token")?.toUpperCase() ?? null);
  }, []);

  return (
    <>
      <Head>
        <title>AIRAT-NA — Your Kiosk Itinerary</title>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
      </Head>

      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-600/10 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6 text-center">
          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
              />
              <path
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
              />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">AIRAT-NA</h1>
            <p className="text-slate-400 text-sm mt-1">
              Your kiosk itinerary is ready
            </p>
          </div>

          {/* Guest Code Box */}
          {token && (
            <div className="w-full rounded-2xl bg-white/5 border border-white/10 px-6 py-5 flex flex-col items-center gap-2">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
                Your Guest Code
              </p>
              <p className="text-4xl font-mono font-bold text-white tracking-[0.2em]">
                {token}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Valid for 24 hours
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="w-full rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-left space-y-1.5">
            <p className="text-blue-300 font-semibold text-sm">How to use:</p>
            <ol className="text-blue-200/80 text-xs space-y-1 list-decimal list-inside">
              <li>Download the AIRAT-NA app below</li>
              <li>
                Open the app → tap{" "}
                <strong className="text-white">Continue as Guest</strong>
              </li>
              <li>
                Enter your guest code:{" "}
                <strong className="text-white font-mono">{token ?? "—"}</strong>
              </li>
              <li>Your trip opens automatically in the Saved tab</li>
            </ol>
          </div>

          {/* Download Button */}
          <a
            href={APK_URL}
            className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all active:scale-95 shadow-lg shadow-red-500/30"
            rel="noopener noreferrer"
          >
            <svg
              className="w-7 h-7 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A5.84 5.84 0 0 0 12 1.5c-.71 0-1.39.13-2.04.37L8.48.39c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.3 1.3A5.958 5.958 0 0 0 6 7h12a5.958 5.958 0 0 0-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-75">Free Download</div>
              <div className="text-sm font-semibold leading-tight">
                Download AIRAT-NA (Android)
              </div>
            </div>
          </a>

          <p className="text-slate-600 text-xs">
            AIRAT-NA · Cebu Tourist Navigation · UCLM Thesis
          </p>
        </div>
      </div>
    </>
  );
}
