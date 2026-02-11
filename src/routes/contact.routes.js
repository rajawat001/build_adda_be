const express = require('express');
const router = express.Router();
const { submitContact, getMyThread } = require('../controllers/contact.controller');
const authMiddleware = require('../middleware/auth.middleware');

// POST /api/contact - Public endpoint for contact form submissions
router.post('/', submitContact);

// GET /api/contact/my-thread - Get logged-in user's own contact thread
router.get('/my-thread', authMiddleware.protect, getMyThread);

module.exports = router;
