// ===============================
// File: public/constants.js
// Centralized constants to eliminate magic strings
// ===============================

// Sorting options for image galleries
export const SORT_OPTIONS = {
    NAME_ASC: 'name_asc',
    NAME_DESC: 'name_desc',
    DATE_DESC: 'date_desc',
    DATE_ASC: 'date_asc',
    RATIO_DESC: 'ratio_desc',
    RATIO_ASC: 'ratio_asc'
};

// Scheduling modes for calendar
export const SCHEDULE_MODES = {
    CHRONOLOGICAL: 'chrono',
    INTERLACED: 'interlaced',
    RANDOM: 'random'
};

// Auto-crop treatments
export const CROP_TREATMENTS = {
    FILL_CROP: 'fill_crop',
    INTELLIGENT_CROP: 'intelligent_crop',
    LETTERBOX: 'letterbox',
    NONE: 'none'
};

// Image orientations
export const ORIENTATIONS = {
    VERTICAL: 'vertical',
    HORIZONTAL: 'horizontal'
};

// Application tabs
export const TABS = {
    GALLERIES: 'galleries',
    CURRENT_GALLERY: 'currentGallery',
    CROPPING: 'cropping',
    DESCRIPTION: 'description',
    CALENDAR: 'calendar'
};

// API endpoints base paths
export const API_ENDPOINTS = {
    AUTH: '/api/auth',
    GALLERIES: '/api/galleries',
    IMAGES: '/api/images',
    PUBLICATIONS: '/api/publications',
    SCHEDULE: '/api/schedule',
    ZIP_EXPORTS: '/api/zip-exports'
};

// File size limits
export const FILE_LIMITS = {
    MAX_IMAGE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_IMAGES_PER_UPLOAD: 50
};

// UI constants
export const UI_CONSTANTS = {
    MIN_ZOOM: 0.1,
    MAX_ZOOM: 3.0,
    ZOOM_STEP: 0.1,
    DEBOUNCE_DELAY: 1500,
    MIN_CANVAS_SIZE: 400
};

// Notification types
export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

// Cache expiration times
export const CACHE_EXPIRY = {
    SHORT: 5 * 60 * 1000,      // 5 minutes
    MEDIUM: 30 * 60 * 1000,    // 30 minutes
    LONG: 2 * 60 * 60 * 1000   // 2 hours
};

// Publication size thresholds
export const PUBLICATION_THRESHOLDS = {
    BACKGROUND_EXPORT_MIN_IMAGES: 10,  // Use background processing for 10+ images
    MAX_SYNC_EXPORT_IMAGES: 9          // Max images for synchronous export
};