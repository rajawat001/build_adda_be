/**
 * In-memory cache with LRU eviction, statistics, and pattern invalidation.
 * Production: replace with Redis for multi-instance deployments.
 */
class MemoryCache {
  constructor(maxKeys = 1000) {
    this.store = new Map();
    this.maxKeys = maxKeys;
    this.stats = {
      hits: 0,
      misses: 0
    };
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    // LRU: move to end (most recently used) by re-inserting
    this.store.delete(key);
    this.store.set(key, item);
    return item.value;
  }

  set(key, value, ttlSeconds = 300) {
    // If key already exists, delete first to refresh insertion order
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // LRU eviction: remove oldest entries if at capacity
    while (this.store.size >= this.maxKeys) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }

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

  /**
   * Delete all keys matching a regex pattern.
   * @param {RegExp} pattern - Regex to match against cache keys
   * @returns {number} Number of keys invalidated
   */
  invalidatePattern(pattern) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Get cache statistics.
   * @returns {{ hits: number, misses: number, size: number, hitRate: number }}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.store.size,
      hitRate: total > 0 ? (this.stats.hits / total) : 0
    };
  }

  /**
   * Reset cache statistics.
   */
  resetStats() {
    this.stats.hits = 0;
    this.stats.misses = 0;
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

const cache = new MemoryCache(1000);

// Cleanup expired entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

module.exports = cache;
