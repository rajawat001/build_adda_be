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

// Analytics endpoints
router.get('/analytics/dashboard', adminController.getDashboardAnalytics);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);
router.get('/analytics/users', adminController.getUserGrowthAnalytics);
router.get('/analytics/orders', adminController.getOrderAnalytics);
router.get('/analytics/categories', adminController.getCategoryPerformance);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/stats', adminController.getUserStats);
router.post('/users/bulk-activate', adminController.bulkActivateUsers);
router.post('/users/bulk-deactivate', adminController.bulkDeactivateUsers);
router.delete('/users/bulk-delete', adminController.bulkDeleteUsers);
router.put('/users/:userId', adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);

// Distributor management
router.get('/distributors', adminController.getAllDistributors);
router.get('/distributors/stats', adminController.getDistributorStats);
router.post('/distributors/bulk-approve', adminController.bulkApproveDistributors);
router.post('/distributors/bulk-reject', adminController.bulkRejectDistributors);
router.delete('/distributors/bulk-delete', adminController.bulkDeleteDistributors);
router.put('/distributors/:distributorId/approve', adminController.approveDistributor);
router.put('/distributors/:distributorId', adminController.updateDistributor);
router.delete('/distributors/:distributorId', adminController.deleteDistributor);

// Product management
router.get('/products', adminController.getAllProducts);
router.get('/products/stats', adminController.getProductStats);
router.delete('/products/bulk-delete', adminController.bulkDeleteProducts);
router.delete('/products/:productId', adminController.deleteProduct);

// Coupon management
router.get('/coupons/stats', adminController.getCouponStats);
router.post('/coupons', adminController.createCoupon);
router.get('/coupons', adminController.getAllCoupons);
router.put('/coupons/:couponId', adminController.updateCoupon);
router.delete('/coupons/:couponId', adminController.deleteCoupon);

// Order management
router.get('/orders/stats', adminController.getOrderStats);
router.get('/orders', adminController.getAllOrders);
router.put('/orders/:orderId', adminController.updateOrderStatus);

// Transaction reports
router.get('/transactions', adminController.getTransactionReports);

module.exports = router;