const express = require('express');
const router = express.Router();
const { getDashboardAnalytics } = require('../controllers/analytics.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Dashboard analytics
router.get('/dashboard', getDashboardAnalytics);

module.exports = router;
