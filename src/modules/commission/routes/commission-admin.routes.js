const express = require('express');
const router = express.Router();
const adminController = require('../controllers/commission-admin.controller');
const authMiddleware = require('../../../middleware/auth.middleware');
const roleMiddleware = require('../../../middleware/role.middleware');

// All routes require authenticated admin
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('admin'));

// Plans
router.post('/plans', adminController.createPlan);
router.get('/plans', adminController.getAllPlans);
router.put('/plans/:id', adminController.updatePlan);
router.patch('/plans/:id/toggle', adminController.togglePlanStatus);

// Wallets
router.get('/wallets', adminController.getAllWallets);
router.get('/wallets/:distributorId', adminController.getWalletDetails);
router.post('/wallets/:distributorId/adjust', adminController.adjustWallet);
router.post('/wallets/:distributorId/unlock', adminController.forceUnlock);

// Transactions
router.get('/transactions', adminController.getAllTransactions);

// Dashboard
router.get('/dashboard', adminController.getAdminDashboard);

module.exports = router;
