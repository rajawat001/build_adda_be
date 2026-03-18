const jwt = require('jsonwebtoken');
const { trackVisit } = require('../utils/visitorTracker');

/**
 * Lightweight visitor tracking middleware.
 * - No DB calls, no await, no external HTTP in request path
 * - JWT decoded (not verified) to identify user type
 * - Wrapped in try/catch so tracking failures never break requests
 */
module.exports = (req, res, next) => {
  try {
    // Extract IP
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : (req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown');

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
      path: req.originalUrl || req.url
    });
  } catch (e) {
    // Never break the request
  }

  next();
};
