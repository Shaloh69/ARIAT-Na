import { body, param, query, ValidationChain } from 'express-validator';

// =====================================================
// AUTH VALIDATORS
// =====================================================
export const registerValidator: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('full_name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Full name must be between 2 and 255 characters'),
  body('phone_number')
    .optional()
    .matches(/^[\d\s\+\-\(\)]+$/)
    .withMessage('Invalid phone number format'),
];

export const loginValidator: ValidationChain[] = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

export const refreshTokenValidator: ValidationChain[] = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
];

// =====================================================
// DESTINATION VALIDATORS
// =====================================================
export const createDestinationValidator: ValidationChain[] = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('description')
    .optional()
    .trim(),
  body('category_id')
    .isUUID()
    .withMessage('Valid category ID is required'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('address')
    .optional()
    .trim(),
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array'),
  body('entrance_fee_local')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Local entrance fee must be a positive number'),
  body('entrance_fee_foreign')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Foreign entrance fee must be a positive number'),
  body('average_visit_duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Average visit duration must be a positive number'),
  body('amenities')
    .optional()
    .isArray()
    .withMessage('Amenities must be an array'),
];

export const updateDestinationValidator: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Valid destination ID is required'),
  ...createDestinationValidator.map(validator => validator.optional()),
];

export const destinationIdValidator: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Valid destination ID is required'),
];

// =====================================================
// CATEGORY VALIDATORS
// =====================================================
export const createCategoryValidator: ValidationChain[] = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('slug')
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must be lowercase alphanumeric with hyphens'),
  body('description')
    .optional()
    .trim(),
  body('display_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Display order must be a positive integer'),
];

// =====================================================
// ROUTE OPTIMIZATION VALIDATORS
// =====================================================
export const optimizeRouteValidator: ValidationChain[] = [
  body('destinations')
    .isArray({ min: 2 })
    .withMessage('At least 2 destinations are required'),
  body('destinations.*')
    .isUUID()
    .withMessage('Each destination must be a valid UUID'),
  body('startPoint')
    .isObject()
    .withMessage('Start point is required'),
  body('startPoint.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid start latitude is required'),
  body('startPoint.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid start longitude is required'),
  body('optimizeFor')
    .optional()
    .isIn(['distance', 'time', 'cost'])
    .withMessage('Optimize for must be distance, time, or cost'),
  body('transportType')
    .notEmpty()
    .withMessage('Transport type is required'),
];

// =====================================================
// FARE CALCULATION VALIDATORS
// =====================================================
export const calculateFareValidator: ValidationChain[] = [
  body('distance')
    .isFloat({ min: 0 })
    .withMessage('Distance must be a positive number'),
  body('transportType')
    .notEmpty()
    .withMessage('Transport type is required'),
  body('isPeakHour')
    .optional()
    .isBoolean()
    .withMessage('isPeakHour must be a boolean'),
];

// =====================================================
// REVIEW VALIDATORS
// =====================================================
export const createReviewValidator: ValidationChain[] = [
  body('destination_id')
    .isUUID()
    .withMessage('Valid destination ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment must not exceed 1000 characters'),
];

// =====================================================
// ITINERARY VALIDATORS
// =====================================================
export const createItineraryValidator: ValidationChain[] = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),
  body('description')
    .optional()
    .trim(),
  body('destinations')
    .isArray({ min: 1 })
    .withMessage('At least 1 destination is required'),
  body('destinations.*.destination_id')
    .isUUID()
    .withMessage('Valid destination ID is required'),
  body('destinations.*.visit_order')
    .isInt({ min: 1 })
    .withMessage('Visit order must be a positive integer'),
  body('start_latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('start_longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('optimizeFor')
    .optional()
    .isIn(['distance', 'time', 'cost'])
    .withMessage('Optimize for must be distance, time, or cost'),
  body('transportType')
    .optional(),
];

// =====================================================
// PAGINATION VALIDATORS
// =====================================================
export const paginationValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

// =====================================================
// SEARCH VALIDATORS
// =====================================================
export const searchValidator: ValidationChain[] = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search query is required'),
  query('category')
    .optional()
    .isUUID()
    .withMessage('Valid category ID is required'),
  query('minRating')
    .optional()
    .isFloat({ min: 0, max: 5 })
    .withMessage('Minimum rating must be between 0 and 5'),
  query('featured')
    .optional()
    .isBoolean()
    .withMessage('Featured must be a boolean'),
];
