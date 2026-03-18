const asyncHandler = require('../utils/asyncHandler');
const { getActiveVisitors, getStats, getServerHealth } = require('../utils/visitorTracker');

// GET /api/admin/live-monitor - Full monitoring data
exports.getLiveMonitorData = asyncHandler(async (req, res) => {
  const visitors = getActiveVisitors();
  const stats = getStats();
  const server = getServerHealth();

  const suspiciousVisitors = visitors.filter(v => v.isSuspicious);

  res.json({
    success: true,
    server,
    stats,
    visitors,
    suspiciousVisitors
  });
});

// GET /api/admin/live-monitor/stats - Lightweight stats only
exports.getLiveMonitorStats = asyncHandler(async (req, res) => {
  const stats = getStats();
  const server = getServerHealth();

  res.json({
    success: true,
    server,
    stats
  });
});
