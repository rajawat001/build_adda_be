const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  resetSettings,
  testEmailConfig
} = require('../controllers/settings.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Test email configuration
router.post('/test-email', testEmailConfig);

// Reset settings to default
router.post('/reset', resetSettings);

// Get and update settings
router.route('/')
  .get(getSettings)
  .put(updateSettings);

module.exports = router;
