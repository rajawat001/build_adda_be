const express = require('express');
const router = express.Router();
const {
  getAllEmailTemplates,
  getEmailTemplateById,
  getEmailTemplateBySlug,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  sendTestEmail,
  getEmailTemplateStats
} = require('../controllers/emailTemplate.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.protect);

// Apply admin authorization to all routes
router.use(roleMiddleware.authorize('admin'));

// Template statistics
router.get('/stats', getEmailTemplateStats);

// Get template by slug
router.get('/slug/:slug', getEmailTemplateBySlug);

// Send test email
router.post('/:id/test', sendTestEmail);

// CRUD operations
router.route('/')
  .get(getAllEmailTemplates)
  .post(createEmailTemplate);

router.route('/:id')
  .get(getEmailTemplateById)
  .put(updateEmailTemplate)
  .delete(deleteEmailTemplate);

module.exports = router;
