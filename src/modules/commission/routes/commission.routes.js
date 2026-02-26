const express = require('express');
const router = express.Router();
const commissionController = require('../controllers/commission.controller');
const authMiddleware = require('../../../middleware/auth.middleware');
const roleMiddleware = require('../../../middleware/role.middleware');

// All routes require authenticated distributor
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('distributor'));

// Plans
router.get('/plans', commissionController.getAvailablePlans);
router.post('/select-plan', commissionController.selectCommissionPlan);

// Wallet
router.get('/wallet', commissionController.getMyWallet);
router.get('/transactions', commissionController.getMyTransactions);

// Payment
router.post('/payment/initiate', commissionController.initiatePayment);
router.get('/payment/status/:merchantOrderId', commissionController.checkPaymentStatus);

// Dashboard
router.get('/dashboard', commissionController.getCommissionDashboard);

module.exports = router;
