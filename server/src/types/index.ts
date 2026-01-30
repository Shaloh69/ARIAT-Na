import { Request } from 'express';

// =====================================================
// USER TYPES
// =====================================================
export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone_number?: string;
  profile_image_url?: string;
  is_verified: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  profile_image_url?: string;
  is_verified: boolean;
  created_at: Date;
}

// =====================================================
// ADMIN TYPES
// =====================================================
export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'moderator';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
}

export interface AdminResponse {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: Date;
}

// =====================================================
// AUTHENTICATION TYPES
// =====================================================
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  id: string;
  email: string;
  type: 'user' | 'admin';
  role?: string;
}

export interface RefreshToken {
  id: string;
  user_id?: string;
  admin_id?: string;
  token: string;
  user_type: 'user' | 'admin';
  expires_at: Date;
  created_at: Date;
}

// =====================================================
// REQUEST TYPES (with authenticated user/admin)
// =====================================================
export interface AuthRequest extends Request {
  user?: TokenPayload;
}

// =====================================================
// DESTINATION TYPES
// =====================================================
export interface Destination {
  id: string;
  name: string;
  description?: string;
  category_id: string;
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
  created_at: Date;
  updated_at: Date;
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

// =====================================================
// CATEGORY TYPES
// =====================================================
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// =====================================================
// INTERSECTION TYPES
// =====================================================
export interface Intersection {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_destination: boolean;
  destination_id?: string;
  address?: string;
  created_at: Date;
  updated_at: Date;
}

// =====================================================
// FARE CONFIG TYPES
// =====================================================
export interface FareConfig {
  id: string;
  transport_type: string;
  display_name: string;
  description?: string;
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  peak_hour_multiplier: number;
  icon_url?: string;
  is_active: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

// =====================================================
// ITINERARY TYPES
// =====================================================
export interface Itinerary {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  start_date?: Date;
  end_date?: Date;
  start_latitude?: number;
  start_longitude?: number;
  start_address?: string;
  optimize_for: 'distance' | 'time' | 'cost';
  transport_type?: string;
  optimized_route?: any;
  total_distance?: number;
  estimated_time?: number;
  estimated_cost?: number;
  is_saved: boolean;
  is_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ItineraryDestination {
  id: string;
  itinerary_id: string;
  destination_id: string;
  visit_order: number;
  planned_duration?: number;
  notes?: string;
  created_at: Date;
}

// =====================================================
// REVIEW TYPES
// =====================================================
export interface Review {
  id: string;
  user_id: string;
  destination_id: string;
  rating: number;
  comment?: string;
  images?: string[];
  is_approved: boolean;
  created_at: Date;
  updated_at: Date;
}

// =====================================================
// ROUTE OPTIMIZATION TYPES
// =====================================================
export interface RouteOptimizationRequest {
  destinations: string[]; // destination IDs
  startPoint: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  optimizeFor: 'distance' | 'time' | 'cost';
  transportType: string;
}

export interface OptimizedRoute {
  destinations: OptimizedDestination[];
  path: RoutePoint[];
  totalDistance: number; // km
  estimatedTime: number; // minutes
  estimatedCost: number;
}

export interface OptimizedDestination {
  destination: Destination;
  visitOrder: number;
  distanceFromPrevious: number;
  timeFromPrevious: number;
  costFromPrevious: number;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  type: 'start' | 'destination' | 'waypoint';
  destinationId?: string;
}

// =====================================================
// FARE CALCULATION TYPES
// =====================================================
export interface FareCalculationRequest {
  distance: number; // kilometers
  transportType: string;
  isPeakHour?: boolean;
}

export interface FareCalculationResponse {
  transportType: string;
  distance: number;
  baseFare: number;
  distanceFare: number;
  peakHourMultiplier: number;
  totalFare: number;
  breakdown: {
    label: string;
    amount: number;
  }[];
}

// =====================================================
// API RESPONSE TYPES
// =====================================================
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

// =====================================================
// ERROR TYPES
// =====================================================
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
