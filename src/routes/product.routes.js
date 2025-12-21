const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth.middleware');

// CRITICAL FIX: Route ordering matters! Specific routes MUST come before generic patterns like /:id

// Public routes - NO authentication needed
router.get('/', productController.getAllProducts);
router.get('/categories', productController.getCategories);
router.get('/category/:categoryId', productController.getProductsByCategory);
router.get('/distributor/:distributorId', productController.getProductsByDistributor);

// Protected routes - authentication REQUIRED (define specific routes first)
router.use(authMiddleware.protect);

// Wishlist routes (MUST be before /:id)
router.get('/wishlist', productController.getWishlist);
router.post('/wishlist', productController.addToWishlist);
router.delete('/wishlist/:productId', productController.removeFromWishlist);

// Cart routes (MUST be before /:id)
router.get('/cart', productController.getCart);
router.post('/cart', productController.addToCart);
router.put('/cart/:productId', productController.updateCartItem);
router.delete('/cart/:productId', productController.removeFromCart);
router.delete('/cart', productController.clearCart);

// FIX: Generic /:id route MUST be at the end to avoid catching all routes above
// This route can be public since anyone can view product details
router.get('/:id', authMiddleware.optionalAuth, productController.getProductById);

module.exports = router;
