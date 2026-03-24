const express = require('express');
const router = express.Router();
const distributorController = require('../controllers/distributor.controller');
const offlineCustomerController = require('../controllers/offlineCustomer.controller');
const manualOrderController = require('../controllers/manualOrder.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { upload } = require('../config/cloudinary');

// All routes require authentication and distributor role
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('distributor'));

// Dashboard stats
router.get('/stats', distributorController.getDistributorStats);

// Offline customer management
router.get('/customers/search', offlineCustomerController.searchCustomers);
router.get('/customers', offlineCustomerController.getMyCustomers);
router.post('/customers', offlineCustomerController.createCustomer);
router.get('/customers/:customerId', offlineCustomerController.getCustomerById);
router.put('/customers/:customerId', offlineCustomerController.updateCustomer);

// Manual order management (must be before /orders to avoid param conflicts)
router.get('/manual-orders/stats', manualOrderController.getManualOrderStats);
router.get('/manual-orders', manualOrderController.getManualOrders);
router.post('/manual-orders', manualOrderController.createManualOrder);
router.get('/manual-orders/:orderId', manualOrderController.getManualOrderById);

// Analytics
router.get('/analytics', distributorController.getDistributorAnalytics);

// Product management
router.get('/products', distributorController.getDistributorProducts);
router.post('/products', upload.array('images', 10), distributorController.addProduct);
router.put('/products/:productId', upload.array('images', 10), distributorController.updateProduct);
router.delete('/products/:productId', distributorController.deleteProduct);

// Order management
router.get('/orders', distributorController.getDistributorOrders);
router.put('/orders/:orderId', distributorController.updateOrderStatus);
router.put('/orders/:orderId/approve', distributorController.approveOrder);
router.put('/orders/:orderId/reject', distributorController.rejectOrder);

// Profile management
router.get('/profile', distributorController.getProfile);
router.put('/profile', distributorController.updateProfile);

module.exports = router;