// Admin Types
export interface Admin {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'moderator';
  created_at: string;
}

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    admin: Admin;
    accessToken: string;
    refreshToken: string;
  };
}

// Destination Types
export interface Destination {
  id: string;
  name: string;
  description?: string;
  category_id: string;
  category_name?: string;
  category_slug?: string;
  latitude: number;
  longitude: number;
  address?: string;
  nearest_intersection_id?: string;
  images?: string[];
  operating_hours?: OperatingHours;
  entrance_fee_local: number;
  entrance_fee_foreign: number;
  average_visit_duration: number;
  best_time_to_visit?: string;
  rating: number;
  review_count: number;
  popularity_score: number;
  amenities?: string[];
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperatingHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed?: boolean;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  display_order: number;
  is_active: boolean;
  destination_count?: number;
  created_at: string;
  updated_at: string;
}

// Intersection Types
export interface Intersection {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_destination: boolean;
  destination_id?: string;
  address?: string;
  point_type?: 'tourist_spot' | 'bus_terminal' | 'bus_stop' | 'pier' | 'intersection';
  created_at: string;
  updated_at: string;
}

// GeoJSON Types
export interface GeoJSONPoint {
  type: 'Feature';
  properties: {
    name: string;
    id: string;
    isDestination: boolean;
    point_type?: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  id: number | string;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONPoint[];
}

// Road/Route Types
export interface Road {
  id: string;
  name: string;
  start_intersection_id: string;
  end_intersection_id: string;
  distance: number;
  path: [number, number][]; // Array of [lat, lng]
  road_type: 'highway' | 'main_road' | 'local_road';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
