export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

export const API_ENDPOINTS = {
  DESTINATIONS: "/destinations",
  DESTINATIONS_FEATURED: "/destinations/featured",
  CATEGORIES: "/categories",
  CLUSTERS: "/clusters",
  GUIDES: "/guides",
};
