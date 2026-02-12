const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const adminSubscriptionController = require('../controllers/adminSubscription.controller');
const contactController = require('../controllers/contact.controller');
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

// Global search
router.get('/search', adminController.globalSearch);

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
router.post('/orders/:orderId/refund', adminController.processRefund);

// Transaction reports
router.get('/transactions', adminController.getTransactionReports);

// Subscription Plans management
router.get('/subscription-plans/stats', adminSubscriptionController.getPlanStats);
router.get('/subscription-plans', adminSubscriptionController.getAllPlans);
router.get('/subscription-plans/:planId', adminSubscriptionController.getPlan);
router.post('/subscription-plans', adminSubscriptionController.createPlan);
router.put('/subscription-plans/:planId', adminSubscriptionController.updatePlan);
router.delete('/subscription-plans/:planId', adminSubscriptionController.deletePlan);

// Subscriptions management
router.get('/subscriptions', adminSubscriptionController.getAllSubscriptions);
router.get('/subscriptions/:subscriptionId', adminSubscriptionController.getSubscription);
router.put('/subscriptions/:subscriptionId/cancel', adminSubscriptionController.cancelSubscription);
router.put('/subscriptions/:subscriptionId/extend', adminSubscriptionController.extendSubscription);

// Subscription Coupons
router.get('/subscription-coupons', adminSubscriptionController.getSubscriptionCoupons);
router.post('/subscription-coupons', adminSubscriptionController.createSubscriptionCoupon);

// Invoices management
router.get('/invoices/stats', adminSubscriptionController.getInvoiceStats);
router.get('/invoices', adminSubscriptionController.getAllInvoices);
router.get('/invoices/:invoiceId', adminSubscriptionController.getInvoice);
router.get('/distributors/:distributorId/invoices', adminSubscriptionController.getDistributorInvoices);
router.post('/subscriptions/:subscriptionId/generate-invoice', adminSubscriptionController.regenerateInvoice);

// Contact messages management
router.get('/contacts/stats', contactController.getContactStats);
router.get('/contacts', contactController.getAllContacts);
router.patch('/contacts/:id', contactController.updateContactStatus);
router.post('/contacts/:id/reply', contactController.replyToContact);
router.delete('/contacts/:id', contactController.deleteContact);

module.exports = router;