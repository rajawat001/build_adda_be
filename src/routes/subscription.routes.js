const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Public routes
router.get('/plans', subscriptionController.getPlans);

// Distributor routes (protected)
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('distributor'));

router.get('/my-subscription', subscriptionController.getMySubscription);
router.post('/apply-coupon', subscriptionController.applyCoupon);
router.post('/create-order', subscriptionController.createOrder);
router.post('/verify-payment', subscriptionController.verifyPayment);
router.get('/history', subscriptionController.getSubscriptionHistory);
router.post('/cancel', subscriptionController.cancelSubscription);

// Autopay routes
router.post('/create-order-autopay', subscriptionController.createOrderWithAutopay);
router.post('/verify-autopay', subscriptionController.verifyAutopayMandate);
router.post('/toggle-auto-renew', subscriptionController.toggleAutoRenew);
router.post('/revoke-autopay', subscriptionController.revokeAutopay);

module.exports = router;