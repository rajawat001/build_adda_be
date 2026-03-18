const jwt = require('jsonwebtoken');
const { trackVisit } = require('../utils/visitorTracker');

/**
 * Lightweight visitor tracking middleware.
 * - IP & location come from frontend headers (client-side fetch)
 * - Falls back to server-side IP if frontend headers missing
 * - JWT decoded (not verified) to identify user type
 * - Wrapped in try/catch so tracking failures never break requests
 */
module.exports = (req, res, next) => {
  try {
    // IP: prefer frontend-reported real IP, fallback to server-side
    const ip = (
      req.headers['x-client-real-ip'] ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );

    // Location: from frontend headers (client fetched from ip-api.com)
    const city = req.headers['x-client-city'] || '';
    const state = req.headers['x-client-state'] || '';
    const country = req.headers['x-client-country'] || '';

    // Get user agent
    const userAgent = req.headers['user-agent'] || '';

    // Decode JWT (not verify) - zero latency, no DB call
    let userId = null;
    let userRole = null;
    let userName = null;
    let userEmail = null;

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.token;

    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          userId = decoded.id || decoded._id || null;
          userRole = decoded.role || null;
          userName = decoded.name || null;
          userEmail = decoded.email || null;
        }
      } catch (e) {
        // Invalid token - treat as guest
      }
    }

    // Track synchronously
    trackVisit({
      ip,
      userAgent,
      userId,
      userRole,
      userName,
      userEmail,
      path: req.originalUrl || req.url,
      city,
      state,
      country
    });
  } catch (e) {
    // Never break the request
  }

  next();
};
