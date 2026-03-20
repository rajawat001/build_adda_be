module.exports = {
  // Subscription
  MAX_AUTOPAY_RETRY_ATTEMPTS: 3,
  SUBSCRIPTION_GRACE_PERIOD_DAYS: 7,

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  ADMIN_DEFAULT_PAGE_SIZE: 50,

  // Cache
  CACHE_TTL: {
    SHORT: 5 * 60,          // 5 minutes
    MEDIUM: 30 * 60,        // 30 minutes
    LONG: 60 * 60,          // 1 hour
    CATEGORIES: 60 * 60,    // 1 hour (categories rarely change)
    PRODUCTS: 10 * 60,      // 10 minutes
  },

  // Rate limiting
  AUTH_RATE_LIMIT_WINDOW: 15 * 60 * 1000,  // 15 minutes
  AUTH_RATE_LIMIT_MAX: 5,

  // File upload
  MAX_FILE_SIZE: 5 * 1024 * 1024,  // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
};
