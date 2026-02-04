const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Guest-compatible routes (optionalAuth — works for both logged-in and guest users)
router.post('/', authMiddleware.optionalAuth, orderController.createOrder);
router.post('/phonepe/initiate', authMiddleware.optionalAuth, orderController.initiatePhonepePayment);
router.post('/phonepe/status', orderController.checkPaymentStatus); // No auth — payment callback
router.post('/cod/confirm', authMiddleware.optionalAuth, orderController.confirmCOD);
router.post('/apply-coupon', authMiddleware.optionalAuth, orderController.applyCoupon);
router.get('/guest/:orderId', orderController.getGuestOrder); // Guest order lookup by orderId + email

// Authenticated routes
router.use(authMiddleware.protect);
router.get('/', orderController.getMyOrders);
router.get('/:orderId', orderController.getOrderById);
router.put('/:orderId/cancel', orderController.cancelOrder);

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
