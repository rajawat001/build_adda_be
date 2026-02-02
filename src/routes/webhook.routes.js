const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// No auth middleware — PhonePe calls this directly
router.post('/phonepe', webhookController.handlePhonepeWebhook);

module.exports = router;
