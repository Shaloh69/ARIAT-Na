export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

/**
 * URL of the public app download page (ariat_web /download).
 * The kiosk generates QR codes that point here with a ?kiosk_session= param
 * so it can detect when the QR was scanned.
 */
export const DOWNLOAD_PAGE_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ||
  "https://ariat-na-admin.onrender.com/download";

/**
 * Smart open page — tries airatna:// deep link first, falls back to download.
 * QR codes for itineraries point here instead of directly to airatna://.
 */
export const OPEN_PAGE_URL =
  process.env.NEXT_PUBLIC_OPEN_URL ||
  "https://ariat-na-admin.onrender.com/open";

export const API_ENDPOINTS = {
  DESTINATIONS: "/destinations",
  DESTINATIONS_FEATURED: "/destinations/featured",
  CATEGORIES: "/categories",
  CLUSTERS: "/clusters",
  GUIDES: "/guides",
  KIOSK_GENERATE: "/kiosk/generate",
  KIOSK_PREVIEW: "/kiosk/preview",
  KIOSK_SCAN_PING: "/kiosk/scan-ping",
};
