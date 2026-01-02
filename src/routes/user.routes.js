const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// Public distributor listing routes
router.get('/distributors', userController.getAllDistributors);
router.get('/distributors/nearby', userController.getNearbyDistributors);
router.get('/distributors/:id', userController.getDistributorProfile);

module.exports = router;
