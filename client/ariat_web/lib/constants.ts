export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export const API_ENDPOINTS = {
  // Auth
  ADMIN_LOGIN: '/auth/admin/login',
  ADMIN_ME: '/auth/admin/me',
  REFRESH_TOKEN: '/auth/refresh',
  LOGOUT: '/auth/logout',
  LOGOUT_ALL: '/auth/logout-all',

  // Destinations
  DESTINATIONS: '/destinations',
  DESTINATIONS_FEATURED: '/destinations/featured',
  DESTINATIONS_POPULAR: '/destinations/popular',

  // Categories
  CATEGORIES: '/categories',

  // Intersections
  INTERSECTIONS: '/intersections',
  INTERSECTIONS_GEOJSON: '/intersections/geojson',

  // Roads
  ROADS: '/roads',
  ROADS_GEOJSON: '/roads/geojson',

  // Routes (Pathfinding)
  ROUTES: '/routes',

  // Admin Profile
  ADMIN_PROFILE: '/admin/profile',
  ADMIN_PROFILE_IMAGE: '/admin/profile/image',
  ADMIN_CHANGE_PASSWORD: '/admin/profile/password',

  // Uploads
  UPLOAD_IMAGE: '/upload/image',
  UPLOAD_IMAGES: '/upload/images',
  UPLOAD_VIDEO: '/upload/video',
  UPLOAD_DELETE: '/upload',
};

export const TOKEN_KEY = 'ariat_admin_token';
export const REFRESH_TOKEN_KEY = 'ariat_admin_refresh_token';
