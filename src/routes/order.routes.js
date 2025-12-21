const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// All routes require authentication
router.use(authMiddleware.protect);

// User routes
router.post('/', orderController.createOrder);
router.get('/', orderController.getMyOrders);
router.get('/:orderId', orderController.getOrderById);
router.put('/:orderId/cancel', orderController.cancelOrder);

// Payment routes
router.post('/razorpay/create', orderController.createRazorpayOrder);
router.post('/razorpay/verify', orderController.verifyPayment);
router.post('/cod/confirm', orderController.confirmCOD);

// Coupon route
router.post('/apply-coupon', orderController.applyCoupon);

// Distributor routes
router.get('/distributor/orders', 
  roleMiddleware.authorize('distributor'),
  orderController.getDistributorOrders
);

router.put('/distributor/orders/:orderId',
  roleMiddleware.authorize('distributor'),
  orderController.updateOrderStatus
);

module.exports = router;