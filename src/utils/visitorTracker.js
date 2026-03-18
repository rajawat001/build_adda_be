const UAParser = require('ua-parser-js');
const http = require('http');

// In-memory visitor tracking
const visitors = new Map();
const geoCache = new Map(); // IP → { city, country, cachedAt }

const GEO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const SUSPICIOUS_THRESHOLD = 100; // requests per 5 min
const SUSPICIOUS_WINDOW = 5 * 60 * 1000; // 5 minutes

// Simple hash for user-agent to create unique visitor keys
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// Detect if access is from browser, app (WebView), bot, API client, etc.
function detectAccessSource(ua, browser) {
  if (!ua) return { source: 'unknown', app: '' };
  const uaLower = ua.toLowerCase();

  // API clients / tools
  if (uaLower.includes('postman')) return { source: 'api-client', app: 'Postman' };
  if (uaLower.includes('insomnia')) return { source: 'api-client', app: 'Insomnia' };
  if (uaLower.startsWith('curl')) return { source: 'api-client', app: 'cURL' };
  if (uaLower.includes('httpie')) return { source: 'api-client', app: 'HTTPie' };
  if (uaLower.includes('axios') || uaLower.includes('node-fetch') || uaLower.includes('got/')) {
    return { source: 'api-client', app: 'Script/Bot' };
  }
  if (uaLower.includes('python-requests') || uaLower.includes('python-urllib')) {
    return { source: 'api-client', app: 'Python Script' };
  }

  // Bots & crawlers
  if (uaLower.includes('googlebot')) return { source: 'bot', app: 'Googlebot' };
  if (uaLower.includes('bingbot')) return { source: 'bot', app: 'Bingbot' };
  if (uaLower.includes('yandexbot')) return { source: 'bot', app: 'YandexBot' };
  if (uaLower.includes('facebookexternalhit')) return { source: 'bot', app: 'Facebook Crawler' };
  if (uaLower.includes('twitterbot')) return { source: 'bot', app: 'Twitter Bot' };
  if (uaLower.includes('whatsapp')) return { source: 'bot', app: 'WhatsApp Preview' };
  if (uaLower.includes('telegrambot')) return { source: 'bot', app: 'Telegram Bot' };
  if (uaLower.includes('bot') || uaLower.includes('crawler') || uaLower.includes('spider')) {
    return { source: 'bot', app: 'Bot/Crawler' };
  }

  // In-app browsers (WebView) — social media & messaging apps
  if (uaLower.includes('instagram')) return { source: 'in-app', app: 'Instagram' };
  if (uaLower.includes('fbav') || uaLower.includes('fban')) return { source: 'in-app', app: 'Facebook App' };
  if (uaLower.includes('snapchat')) return { source: 'in-app', app: 'Snapchat' };
  if (uaLower.includes('twitter') && !uaLower.includes('bot')) return { source: 'in-app', app: 'Twitter/X App' };
  if (uaLower.includes('linkedin')) return { source: 'in-app', app: 'LinkedIn App' };
  if (uaLower.includes('pinterest')) return { source: 'in-app', app: 'Pinterest App' };
  if (uaLower.includes('telegram') && !uaLower.includes('bot')) return { source: 'in-app', app: 'Telegram' };

  // Generic WebView detection (Android/iOS)
  if (uaLower.includes('wv') && uaLower.includes('android')) return { source: 'in-app', app: 'Android WebView' };
  if ((uaLower.includes('iphone') || uaLower.includes('ipad')) &&
      !uaLower.includes('safari') && uaLower.includes('applewebkit')) {
    return { source: 'in-app', app: 'iOS WebView' };
  }

  // Regular browser
  const browserName = browser?.name || 'Unknown';
  return { source: 'browser', app: browserName };
}

function isPrivateIP(ip) {
  if (!ip) return true;
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' ||
    ip.startsWith('10.') || ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') || ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
    ip.startsWith('172.2') || ip.startsWith('172.3') ||
    ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') ||
    ip.startsWith('::ffff:192.168.');
}

// Async geo lookup - fire and forget, results cached
function lookupGeo(ip) {
  if (isPrivateIP(ip)) return;

  const cached = geoCache.get(ip);
  if (cached && (Date.now() - cached.cachedAt) < GEO_CACHE_TTL) return;

  // Mark as pending to avoid duplicate requests
  geoCache.set(ip, { city: 'Looking up...', state: '', country: '', cachedAt: Date.now() });

  const req = http.get(`http://ip-api.com/json/${ip}?fields=city,regionName,country,status`, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.status === 'success') {
          geoCache.set(ip, {
            city: parsed.city || '',
            state: parsed.regionName || '',
            country: parsed.country || '',
            cachedAt: Date.now()
          });
          // Update any active visitors with this IP
          for (const [, visitor] of visitors) {
            if (visitor.ip === ip) {
              visitor.city = parsed.city || '';
              visitor.state = parsed.regionName || '';
              visitor.country = parsed.country || '';
            }
          }
        }
      } catch (e) {
        // Silently fail - geo is best effort
      }
    });
  });
  req.on('error', () => {}); // Silently fail
  req.setTimeout(5000, () => req.destroy());
}

function trackVisit({ ip, userAgent, userId, userRole, userName, userEmail, path }) {
  const uaHash = simpleHash(userAgent || 'unknown');
  const key = `${ip}::${uaHash}`;
  const now = Date.now();

  const existing = visitors.get(key);

  if (existing) {
    existing.lastActivity = now;
    existing.currentPath = path;
    existing.requestCount++;

    // Update user info if they logged in
    if (userId && !existing.userId) {
      existing.userId = userId;
      existing.userType = userRole || 'guest';
      existing.userName = userName || '';
      existing.userEmail = userEmail || '';
    }

    // Check suspicious activity
    checkSuspicious(existing);
    return;
  }

  // Parse user agent
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  const accessSource = detectAccessSource(userAgent, browser);

  // Get cached geo or trigger lookup
  const geo = geoCache.get(ip);
  const isLocal = isPrivateIP(ip);

  const visitor = {
    ip,
    browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Unknown',
    os: os.name ? `${os.name} ${os.version || ''}`.trim() : 'Unknown',
    deviceType: device.type || 'desktop',
    deviceVendor: device.vendor || '',
    deviceModel: device.model || '',
    accessSource: accessSource.source,
    accessApp: accessSource.app,
    userId: userId || null,
    userType: userRole || 'guest',
    userName: userName || '',
    userEmail: userEmail || '',
    currentPath: path,
    requestCount: 1,
    firstSeen: now,
    lastActivity: now,
    city: isLocal ? 'Localhost' : (geo ? geo.city : ''),
    state: isLocal ? '' : (geo ? geo.state : ''),
    country: isLocal ? '' : (geo ? geo.country : ''),
    isSuspicious: false,
    suspiciousReasons: []
  };

  visitors.set(key, visitor);

  // Trigger async geo lookup
  lookupGeo(ip);
}

function checkSuspicious(visitor) {
  const elapsed = Date.now() - visitor.firstSeen;
  const reasons = [];

  // High request rate
  if (elapsed > 0 && elapsed <= SUSPICIOUS_WINDOW && visitor.requestCount > SUSPICIOUS_THRESHOLD) {
    reasons.push(`High request rate: ${visitor.requestCount} requests in ${Math.round(elapsed / 1000)}s`);
  }

  if (reasons.length > 0) {
    visitor.isSuspicious = true;
    visitor.suspiciousReasons = reasons;
  }
}

function getActiveVisitors() {
  const result = [];
  for (const [, visitor] of visitors) {
    result.push({ ...visitor });
  }
  // Sort by lastActivity descending
  result.sort((a, b) => b.lastActivity - a.lastActivity);
  return result;
}

function getStats() {
  let total = 0, guests = 0, users = 0, distributors = 0, admins = 0, suspicious = 0;
  for (const [, v] of visitors) {
    total++;
    if (v.isSuspicious) suspicious++;
    switch (v.userType) {
      case 'admin': admins++; break;
      case 'distributor': distributors++; break;
      case 'user': users++; break;
      default: guests++;
    }
  }
  return { total, guests, users, distributors, admins, suspicious };
}

function getServerHealth() {
  const mem = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return {
    status: 'online',
    uptime: uptimeSeconds,
    uptimeFormatted: parts.join(' '),
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100)
    },
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid
  };
}

// Cleanup inactive visitors every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, visitor] of visitors) {
    if (now - visitor.lastActivity > INACTIVE_TIMEOUT) {
      visitors.delete(key);
    }
  }

  // Cleanup expired geo cache entries
  for (const [ip, entry] of geoCache) {
    if (now - entry.cachedAt > GEO_CACHE_TTL) {
      geoCache.delete(ip);
    }
  }
}, 60 * 1000);

module.exports = {
  trackVisit,
  getActiveVisitors,
  getStats,
  getServerHealth
};
