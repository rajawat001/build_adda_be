const express = require('express');
const router = express.Router();
const {
  getAllActivityLogs,
  getActivityLogById,
  getEntityHistory,
  getActivityLogStats,
  getActivitySummary,
  cleanupOldLogs
} = require('../controllers/activityLog.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Activity log statistics
router.get('/stats', getActivityLogStats);

// Activity summary (aggregated)
router.get('/summary', getActivitySummary);

// Cleanup old logs
router.delete('/cleanup', cleanupOldLogs);

// Entity history
router.get('/entity/:entity/:entityId', getEntityHistory);

// Get all activity logs
router.get('/', getAllActivityLogs);

// Get single activity log by ID
router.get('/:id', getActivityLogById);

module.exports = router;
