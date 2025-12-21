const express = require('express');
const router = express.Router();
const distributorController = require('../controllers/distributor.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { upload } = require('../config/cloudinary');

// All routes require authentication and distributor role
router.use(authMiddleware.protect);
router.use(roleMiddleware.authorize('distributor'));

// Dashboard stats
router.get('/stats', distributorController.getDistributorStats);

// Product management
router.get('/products', distributorController.getDistributorProducts);
router.post('/products', upload.single('image'), distributorController.addProduct);
router.put('/products/:productId', upload.single('image'), distributorController.updateProduct);
router.delete('/products/:productId', distributorController.deleteProduct);

module.exports = router;