/**
 * Simple in-memory cache for expensive queries.
 * Production: replace with Redis for multi-instance deployments.
 */
class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds = 300) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  // Clean up expired entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.store) {
      if (now > item.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

const cache = new MemoryCache();

// Cleanup expired entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

module.exports = cache;
