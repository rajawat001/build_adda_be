const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// All routes require authentication and admin role
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('admin'));

// Dashboard stats
router.get('/stats', adminController.getAdminStats);

// User management
router.get('/users', adminController.getAllUsers);
router.put('/users/:userId', adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);

// Distributor management
router.get('/distributors', adminController.getAllDistributors);
router.put('/distributors/:distributorId/approve', adminController.approveDistributor);
router.put('/distributors/:distributorId', adminController.updateDistributor);
router.delete('/distributors/:distributorId', adminController.deleteDistributor);

// Product management
router.get('/products', adminController.getAllProducts);
router.delete('/products/:productId', adminController.deleteProduct);

// Coupon management
router.post('/coupons', adminController.createCoupon);
router.get('/coupons', adminController.getAllCoupons);
router.put('/coupons/:couponId', adminController.updateCoupon);
router.delete('/coupons/:couponId', adminController.deleteCoupon);

// Order management
router.get('/orders', adminController.getAllOrders);
router.put('/orders/:orderId', adminController.updateOrderStatus);

// Transaction reports
router.get('/transactions', adminController.getTransactionReports);

module.exports = router;